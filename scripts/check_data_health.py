#!/usr/bin/env python3
"""FrozenRoot read-only health audit of the published MLB/NFL/NBA/NHL files.

No data provider calls and no edits to schedules, predictions or records.
This checks the files the website actually publishes; it cannot guarantee
that ESPN or MLB has the very latest result when a schedule feed itself is stale.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PT = ZoneInfo("America/Los_Angeles")
SPORTS = ("mlb", "nfl", "nba", "nhl")
SCHEDULE_AGE_HOURS = {"mlb": 31, "nfl": 4, "nba": 4, "nhl": 4}
FINAL_WORDS = ("final", "completed", "complete", "closed", "game over")
OFF_WORDS = ("cancel", "postpon")
SETTLED = {"win", "loss", "push", "void"}


def load(filename, issues):
    try:
        with (ROOT / filename).open(encoding="utf-8") as stream:
            value = json.load(stream)
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object")
        return value
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        issues.append({
            "severity": "error", "code": "missing-or-invalid",
            "message": f"{filename} cannot be read ({type(exc).__name__}); no healthy status assumed."
        })
        return None


def iso(value):
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return None
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def status(value):
    text = str(value or "").lower()
    if any(word in text for word in OFF_WORDS):
        return "void"
    if any(word in text for word in FINAL_WORDS):
        return "final"
    return "other"


def number(value):
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        result = float(value)
        if result >= 0 and result.is_integer():
            return int(result)
    except (TypeError, ValueError, OverflowError):
        pass
    return None


def note(issues, code, message, severity="warning"):
    issues.append({"severity": severity, "code": code, "message": message})


def schedule_audit(sport, slate, now, issues):
    if slate is None:
        return None
    games = slate.get("games")
    if not isinstance(games, list):
        note(issues, "invalid-schedule", f"{sport.upper()} schedule is missing its games list.", "error")
        return None
    if any(not isinstance(g, dict) for g in games):
        note(issues, "invalid-games", f"{sport.upper()} schedule includes invalid game entries.", "error")
        return None
    timestamp = iso(slate.get("fetchedAt" if sport == "mlb" else "generatedAt"))
    if timestamp is None:
        note(issues, "missing-timestamp", f"{sport.upper()} schedule has no valid refresh time.", "warning")
    else:
        age = (now - timestamp).total_seconds() / 3600
        if age < -0.25:
            note(issues, "future-refresh-time", f"{sport.upper()} schedule has a future-dated refresh time.")
        elif age > SCHEDULE_AGE_HOURS[sport]:
            note(issues, "stale-feed", f"{sport.upper()} schedule last refreshed {age:.1f} hours ago.")
    today = now.astimezone(PT).date()
    # Let the midnight workflows run before declaring a missing new slate.
    grace = now.astimezone(PT).hour >= 2
    if sport == "nfl":
        start = today - timedelta(days=(today.weekday() - 1) % 7)
        expected_end = start + timedelta(days=6)
        if grace and (slate.get("startDate") != start.isoformat() or
                      slate.get("endDate") != expected_end.isoformat()):
            note(issues, "old-slate", "NFL schedule does not cover the current Tuesday–Monday week.")
    elif grace and slate.get("date") != today.isoformat():
        note(issues, "old-slate", f"{sport.upper()} schedule is not dated for today ({today.isoformat()} PT).")
    return games


def audit_picks(sport, schedule, now, issues):
    base = "site.json" if sport == "mlb" else sport + "-picks.json"
    manual = load(base, issues)
    auto = None if sport == "mlb" else load("auto-" + sport + "-picks.json", issues)
    ledgers = [("official", manual)]
    if auto is not None:
        ledgers.append(("automatic", auto))
    elif sport != "mlb":
        # load() has already flagged the missing automatic ledger
        pass
    schedule_map = {}
    if schedule:
        schedule_map = {str(g.get("id", g.get("gamePk", ""))): g for g in schedule}
    checked = 0
    pending = 0
    for kind, data in ledgers:
        if data is None:
            continue
        picks = data.get("picks")
        if not isinstance(picks, list):
            note(issues, "invalid-picks", f"{kind.capitalize()} {sport.upper()} ledger has no picks list.", "error")
            continue
        for pick in picks:
            if not isinstance(pick, dict):
                note(issues, "invalid-pick", f"{sport.upper()} {kind} ledger contains a malformed pick.", "error")
                continue
            if kind == "official" and not pick.get("locked"):
                continue
            if kind == "automatic" and not pick.get("automated"):
                continue
            checked += 1
            stored = str(pick.get("status") or "pending").lower()
            if stored == "pending":
                pending += 1
            game = schedule_map.get(str(pick.get("gameId") or ""))
            if sport == "mlb" and schedule:
                names = {str(pick.get("team", "")).casefold(),
                         str(pick.get("opponent", "")).casefold()}
                slate_day = pick.get("date")
                game = next((g for g in schedule if
                    slate_day == iso(g.get("startUTC")).astimezone(PT).date().isoformat()
                    and {str(g.get("home", "")).casefold(),
                         str(g.get("away", "")).casefold()} == names), None) if slate_day else None
            key = f"{sport.upper()} {kind} pick {pick.get('id') or pick.get('gameId') or pick.get('date') or 'unknown'}"
            if game and stored == "pending":
                game_status = status(game.get("status"))
                if game_status == "void":
                    note(issues, "unsettled-void", key + ": game was canceled or postponed but pick remains pending.")
                elif (game_status == "final" and number(game.get("homeScore")) is not None
                      and number(game.get("awayScore")) is not None):
                    note(issues, "unsettled-final", key + ": final game score is published but pick still says pending.")
            # Once a slate rotates away, an old pending pick warrants a manual
            # follow-up, not an unsupported claim that the game finished.
            if stored == "pending" and not game:
                try:
                    day = datetime.strptime(str(pick.get("date")), "%Y-%m-%d").date()
                    if (now.astimezone(PT).date() - day).days >= 3:
                        note(issues, "older-pending", key + ": still pending after 3+ days; verify final result.")
                except ValueError:
                    note(issues, "invalid-pick-date", key + ": has an invalid date.")
            if game and status(game.get("status")) == "final" and stored in ("win", "loss"):
                home = number(game.get("homeScore"))
                away = number(game.get("awayScore"))
                team = str(pick.get("team") or "").casefold()
                home_name = str(game.get("home") or "").casefold()
                away_name = str(game.get("away") or "").casefold()
                if home is not None and away is not None and team in (home_name, away_name):
                    expected = "win" if (home > away if team == home_name else away > home) else "loss" if home != away else "push"
                    if stored != expected:
                        note(issues, "result-conflict", key + ": saved outcome disagrees with the published final score.", "error")
    return {"picksChecked": checked, "pending": pending}


def scan(now=None):
    now = now or datetime.now(timezone.utc)
    result = {
        "version": 1,
        "checkedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": "Published FrozenRoot JSON files only; no live ESPN/MLB polling.",
        "overall": "ok",
        "sports": {}
    }
    for sport in SPORTS:
        issues = []
        schedule_data = load("schedule.json" if sport == "mlb" else sport + "-schedule.json", issues)
        schedule = schedule_audit(sport, schedule_data, now, issues)
        picks = audit_picks(sport, schedule, now, issues)
        severity = "error" if any(i["severity"] == "error" for i in issues) else "warning" if issues else "ok"
        result["sports"][sport] = {
            "status": severity,
            "scheduleUpdatedAt": ((schedule_data or {}).get("fetchedAt") if sport == "mlb"
                                  else (schedule_data or {}).get("generatedAt")),
            "gamesChecked": len(schedule) if schedule is not None else None,
            "picksChecked": picks["picksChecked"],
            "pendingPicks": picks["pending"],
            "issues": issues[:30],
            "totalIssues": len(issues)
        }
    result["overall"] = ("error" if any(x["status"] == "error" for x in result["sports"].values())
                         else "warning" if any(x["status"] == "warning" for x in result["sports"].values())
                         else "ok")
    return result


def main():
    report = scan()
    (ROOT / "health.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {s: len(p["issues"]) for s, p in report["sports"].items()}
    print("Health audit:", report["overall"], counts)
    # Data-quality problems are reported to the site but are not workflow
    # crashes. Failed script execution itself still fails the workflow.
    return 0


if __name__ == "__main__":
    sys.exit(main())
