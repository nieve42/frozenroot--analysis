#!/usr/bin/env python3
"""Frozen Root MLB automatic pregame winner and run forecasts.

Uses MLB Stats API final scores, not sportsbook odds or ChatGPT. Auto forecasts
are deliberately separate from the official owner-locked site.json ledger.
No backfilling: a forecast is first published only before scheduled first pitch.
A forecast's winner and projected score never change after publication.
"""
import json
import math
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PACIFIC = ZoneInfo("America/Los_Angeles")
API = "https://statsapi.mlb.com/api/v1/schedule"
AUTO_FILE = ROOT / "auto-mlb-picks.json"
DAY_FILE = ROOT / "schedule.json"
GAME_TYPES = {"R", "F", "D", "L", "W"}
PLAYOFF_TYPES = {"F", "D", "L", "W"}


def utc_dt(value):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        return None


def get_schedule(start, end):
    args = {"sportId": 1, "startDate": start.isoformat(),
            "endDate": end.isoformat(), "gameTypes": ",".join(sorted(GAME_TYPES))}
    request = Request(API + "?" + urlencode(args), headers={
        "User-Agent": "FrozenRootAutoMLB/1.0", "Accept": "application/json"})
    error = None
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
            if not isinstance(data.get("dates"), list):
                raise ValueError("MLB Stats API schedule has no dates array")
            return [g for row in data["dates"] for g in row.get("games", [])
                    if isinstance(g, dict)]
        except Exception as exc:
            error = exc
            if attempt != 2:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"MLB Stats API failed for {start} to {end}: {error}")


def status(game):
    return str((game.get("status") or {}).get("detailedState") or "").lower()


def team_name(game, side):
    return str(((game.get("teams") or {}).get(side) or {}).get("team", {}).get("name") or "")


def completed(game):
    state = status(game)
    if not ("final" in state or state in ("completed", "game over")):
        return None
    teams = game.get("teams") or {}
    try:
        away = teams["away"]["score"]
        home = teams["home"]["score"]
        if type(away) is not int or type(home) is not int or min(away, home) < 0:
            return None
    except (KeyError, TypeError):
        return None
    return {"away": away, "home": home}


def load_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def source_games(today, existing, need_model):
    """Fetch recent verified scores and older pending games for settlement."""
    now = datetime.now(timezone.utc)
    if need_model:
        # Use this season's final scores and a small amount of last year's late
        # season scoring as a prior. League-wide regression prevents overfitting.
        start = max(date(today.year, 3, 1), today - timedelta(days=100))
        prior_year = today.year - 1
        prior_start = date(prior_year, 9, 1)
        prior_end = date(prior_year, 10, 31)
    else:
        start = today - timedelta(days=2)
        prior_start = prior_end = None
    min_pending = []
    for p in existing:
        if p.get("status") == "pending":
            try:
                min_pending.append(date.fromisoformat(p["date"]) - timedelta(days=1))
            except (ValueError, TypeError, KeyError):
                pass
    if min_pending:
        start = min(start, min(min_pending))
    games = get_schedule(start, today)
    previous = get_schedule(prior_start, prior_end) if need_model else []
    final = {}
    for g in games + previous:
        game_id = str(g.get("gamePk") or "")
        if game_id and completed(g):
            final[game_id] = g
    return final


def rates_for(games, now, playoff):
    """Team runs for/against, time-weighted; no future or partial scores."""
    rows = defaultdict(list)
    for g in games.values():
        game_type = str(g.get("gameType") or "")
        if playoff and game_type not in PLAYOFF_TYPES:
            # The playoff model uses postseason results only; if samples are
            # missing, the league baseline takes over (no fake postseason stats).
            continue
        if not playoff and game_type != "R":
            continue
        when = utc_dt(g.get("gameDate"))
        if not when or when >= now:
            continue
        final = completed(g)
        if not final:
            continue
        away, home = team_name(g, "away"), team_name(g, "home")
        if not away or not home:
            continue
        age = max(0, (now-when).total_seconds()/86400)
        # Previous-season results are heavily downweighted, not treated as fresh.
        previous = when.year < now.astimezone(PACIFIC).year
        weight = (0.20 if previous else 1.0) * math.exp(-age/(45 if playoff else 32))
        if previous:
            # Exponential age would otherwise erase off-season carryover.
            weight = 0.14 * math.exp(-max(0, (date(when.year,10,31)-when.date()).days)/45)
        rows[away].append((final["away"], final["home"], weight))
        rows[home].append((final["home"], final["away"], weight))
    baseline = 4.45
    result = {}
    for team,values in rows.items():
        effective = sum(v[2] for v in values)
        pseudo = 8.0
        scored = (pseudo*baseline+sum(a*w for a,b,w in values))/(pseudo+effective)
        allowed = (pseudo*baseline+sum(b*w for a,b,w in values))/(pseudo+effective)
        result[team] = scored, allowed, len(values)
    return result


def make_pick(g, rates, now):
    game_id = str(g.get("gamePk") or "")
    away, home = str(g.get("away") or ""), str(g.get("home") or "")
    game_time = utc_dt(g.get("startUTC"))
    if not game_id or not game_time or game_time <= now or not away or not home or away == home:
        return None
    kind = str(g.get("gameType") or "")
    if kind not in GAME_TYPES:
        return None
    if any(word in str(g.get("status") or "").lower()
           for word in ("final", "in progress", "live", "delay", "suspend", "postpon", "cancel")):
        return None
    neutral = 4.45
    away_for, away_against, na = rates.get(away, (neutral, neutral, 0))
    home_for, home_against, nh = rates.get(home, (neutral, neutral, 0))
    away_runs = max(0.6, (away_for+home_against)/2-0.13)
    home_runs = max(0.6, (home_for+away_against)/2+0.13)
    take_home = home_runs >= away_runs
    ra, rh = max(0, int(away_runs+0.5)), max(0, int(home_runs+0.5))
    if ra == rh:
        if take_home:
            rh += 1
        else:
            ra += 1
    winner, opponent = (home, away) if take_home else (away, home)
    score = {"teamRuns": rh if take_home else ra,
             "opponentRuns": ra if take_home else rh}
    local_day = game_time.astimezone(PACIFIC).date().isoformat()
    low_data = min(na, nh) < 5
    postseason = kind in PLAYOFF_TYPES
    scope = "postseason-only" if postseason else "regular-season"
    return {
        "id": "mlb-auto-" + game_id,
        "sport": "MLB",
        "gameId": game_id,
        "date": local_day,
        "dateUTC": game_time.isoformat().replace("+00:00","Z"),
        "team": winner, "opponent": opponent,
        "away": away, "home": home,
        "pickType": "moneyline",
        "createdBy": "Frozen Root automatic statistical model (not ChatGPT)",
        "automated": True, "locked": True,
        "createdAt": now.isoformat(timespec="seconds").replace("+00:00","Z"),
        "status": "pending", "projectedScore": score,
        "modelVersion": "mlb-score-form-v1",
        "risk": "LOW DATA" if low_data else "MODEL ESTIMATE",
        "analysis": f"{scope.title()} verified team scoring and runs allowed with regression to league average, "
                    f"recent game samples: {away} {na}, {home} {nh}. Modest home-field adjustment. "
                    "Statistical forecast only; does not verify starting pitchers, confirmed lineups, "
                    "bullpen availability, weather or injuries. No sportsbook odds are used."
    }


def main():
    now = datetime.now(timezone.utc)
    today = now.astimezone(PACIFIC).date()
    slate = load_json(DAY_FILE)
    if slate.get("date") != today.isoformat():
        raise RuntimeError("MLB daily schedule is stale; refusing to predict.")
    dataset = load_json(AUTO_FILE)
    entries = dataset.get("picks")
    if not isinstance(entries, list):
        raise RuntimeError("Malformed MLB auto-picks history")
    games = slate.get("games") or []
    known = {str(p.get("gameId")) for p in entries}
    upcoming = [g for g in games if str(g.get("gamePk")) not in known
                and utc_dt(g.get("startUTC")) and utc_dt(g["startUTC"]) > now
                and str(g.get("gameType")) in GAME_TYPES
                and not any(x in str(g.get("status","")).lower()
                            for x in ("final", "progress", "delay", "suspend", "postpon", "cancel"))]
    needs_model = bool(upcoming)
    final_games = source_games(today, entries, needs_model)
    # Include today's completed games from the newly published MLB schedule,
    # but only when status explicitly says Final and scores are valid.
    for g in games:
        if "final" in str(g.get("status") or "").lower() and g.get("gamePk"):
            if type(g.get("awayScore")) is int and type(g.get("homeScore")) is int:
                final_games[str(g["gamePk"])] = {
                    "gamePk": g["gamePk"], "gameDate": g.get("startUTC"),
                    "gameType": g.get("gameType"), "status": {"detailedState":"Final"},
                    "teams": {"away":{"team":{"name":g.get("away")},"score":g["awayScore"]},
                              "home":{"team":{"name":g.get("home")},"score":g["homeScore"]}}
                }
    settled = 0
    for p in entries:
        if p.get("status") != "pending":
            continue
        g = final_games.get(str(p.get("gameId")))
        if g:
            s = completed(g)
            if not s:
                continue
            away, home = team_name(g, "away"), team_name(g, "home")
            if p.get("team") == away and p.get("opponent") == home:
                team_runs, opponent_runs = s["away"], s["home"]
            elif p.get("team") == home and p.get("opponent") == away:
                team_runs, opponent_runs = s["home"], s["away"]
            else:
                print(f"Skipped mismatch for game {p.get('gameId')}")
                continue
            p["status"] = "win" if team_runs > opponent_runs else "loss" if team_runs < opponent_runs else "push"
            p["actualScore"] = {"teamRuns":team_runs, "opponentRuns":opponent_runs}
            p["resultVerifiedOn"] = today.isoformat()
            p["resultSource"] = "MLB Stats API final scores"
            settled += 1
        else:
            g = next((x for x in games if str(x.get("gamePk")) == str(p.get("gameId"))), None)
            if g and any(x in str(g.get("status","")).lower() for x in ("postpon", "cancel")):
                p["status"] = "void"
                p["settlementReason"] = "Game postponed or canceled"
                p["resultVerifiedOn"] = today.isoformat()
                settled += 1
    rates_cache = {}
    added = 0
    for g in sorted(upcoming, key=lambda x: str(x.get("startUTC") or "")):
        game_id = str(g.get("gamePk"))
        if game_id in known:
            continue
        playoff = str(g.get("gameType")) in PLAYOFF_TYPES
        if playoff not in rates_cache:
            rates_cache[playoff] = rates_for(final_games, now, playoff)
        pick = make_pick(g, rates_cache[playoff], now)
        if pick:
            entries.append(pick)
            known.add(game_id)
            added += 1
    if added or settled:
        dataset["picks"] = entries
        dataset["lastUpdated"] = now.isoformat(timespec="seconds").replace("+00:00","Z")
        AUTO_FILE.write_text(json.dumps(dataset, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(f"MLB auto picks: {added} new, {settled} settled; {len(entries)} total. "
          f"Official site.json was not modified.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"MLB forecast failed: {exc}", file=sys.stderr)
        sys.exit(1)
