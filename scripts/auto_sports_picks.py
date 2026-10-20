#!/usr/bin/env python3
"""Frozen Root free automated sports forecasts (no ChatGPT API / no sportsbook odds).

Run AFTER the daily/weekly ESPN schedule has been updated. Creates a frozen,
pregame-only auto pick per upcoming game, and settles older auto picks only
from completed ESPN scoreboards. Does not touch official manual pick ledgers.
"""
import argparse
import json
import math
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PT = ZoneInfo("America/Los_Angeles")
SPORTS = {
    "nfl": dict(path="football/nfl", history_days=49, prior_days=0,
                baseline=22.0, home_edge=2.0, score_key="Points", decay=42),
    "nba": dict(path="basketball/nba", history_days=24, prior_days=10,
                baseline=112.0, home_edge=2.5, score_key="Points", decay=20),
    "nhl": dict(path="hockey/nhl", history_days=24, prior_days=10,
                baseline=3.05, home_edge=0.28, score_key="Goals", decay=21),
}


def load_json(path):
    if not path.exists():
        raise FileNotFoundError(str(path))
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def utc_now():
    return datetime.now(timezone.utc)


def datetime_utc(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def get_events(config, day):
    endpoint = "https://site.api.espn.com/apis/site/v2/sports/" + config["path"] + "/scoreboard"
    url = endpoint + "?" + urlencode({"dates":day.strftime("%Y%m%d"),"limit":120})
    failure = None
    for attempt in range(2):
        try:
            req = Request(url, headers={"User-Agent":"Mozilla/5.0 FrozenRootAutoForecast/1.0",
                                        "Accept":"application/json"})
            with urlopen(req, timeout=14) as resp:
                content = json.load(resp)
            if not isinstance(content.get("events"), list):
                raise ValueError("ESPN response missing events")
            return content["events"]
        except Exception as err:
            failure = err
            if attempt == 0:
                time.sleep(1)
    raise RuntimeError(f"ESPN scoreboard failed for {day}: {failure}")


def final_event(event, now):
    """Only final, score-bearing games; never treat current/partial scores as final."""
    competitions = event.get("competitions") or []
    if not competitions:
        return None
    comp = competitions[0]
    status = (comp.get("status") or event.get("status") or {}).get("type") or {}
    if not (status.get("completed") or
            str(status.get("name","")).upper() in ("STATUS_FINAL","FINAL")):
        return None
    when = datetime_utc(event.get("date") or comp.get("date"))
    if not when or when >= now:
        return None
    competitors = comp.get("competitors") or []
    home = next((x for x in competitors if x.get("homeAway")=="home"),None)
    away = next((x for x in competitors if x.get("homeAway")=="away"),None)
    if not home or not away:
        return None
    def parse_score(c):
        raw = c.get("score")
        if isinstance(raw,dict):
            raw = raw.get("value",raw.get("displayValue"))
        try:
            value = int(raw)
            return value if value >= 0 else None
        except (ValueError, TypeError):
            return None
    home_score,away_score = parse_score(home),parse_score(away)
    if home_score is None or away_score is None:
        return None
    def name(c):
        return (c.get("team") or {}).get("displayName") or (c.get("team") or {}).get("name")
    home_name,away_name = name(home),name(away)
    if not home_name or not away_name:
        return None
    season = event.get("season") or {}
    try:
        season_type = int(season.get("type",2))
    except (ValueError,TypeError):
        season_type = 2
    return dict(id=str(event.get("id","")),date=when,home=home_name,away=away_name,
                home_score=home_score,away_score=away_score,season_type=season_type)


def fetch_results(config, days):
    """Parallel scoreboard reads; one unavailable historical day never invents a score."""
    unique = {}
    failures = 0
    with ThreadPoolExecutor(max_workers=7) as pool:
        jobs = {pool.submit(get_events,config,day):day for day in sorted(days)}
        for result in as_completed(jobs):
            try:
                for event in result.result():
                    if isinstance(event,dict) and event.get("id"):
                        unique[str(event["id"])] = event
            except Exception as exc:
                failures += 1
                print(f"History unavailable on {jobs[result]}: {exc}")
    if failures == len(days) and days:
        raise RuntimeError("All ESPN historical scoreboards unavailable. Refusing to invent projections.")
    return unique


def expected_rates(config, outcomes, now):
    """Recent verified scoring, weighted by age and regressed toward a league baseline."""
    stats = defaultdict(list)
    for outcome in outcomes.values():
        item = final_event(outcome,now)
        if not item or item["season_type"] not in (2,3):
            continue
        age = max(0.0,(now-item["date"]).total_seconds()/86400)
        weight = math.exp(-age/config["decay"])
        stats[item["home"]].append((item["home_score"],item["away_score"],weight))
        stats[item["away"]].append((item["away_score"],item["home_score"],weight))
    rates = {}
    baseline = config["baseline"]
    for team,rows in stats.items():
        effective = sum(weight for _,_,weight in rows)
        pseudo = 4.0 if baseline > 10 else 5.0
        scored = (baseline*pseudo+sum(s*w for s,_,w in rows))/(pseudo+effective)
        conceded = (baseline*pseudo+sum(a*w for _,a,w in rows))/(pseudo+effective)
        rates[team] = (scored,conceded,len(rows))
    return rates


def forecast(game, config, rates, when, now, sport):
    away,home = str(game.get("away","")),str(game.get("home",""))
    if not away or not home or away == "TBD" or home == "TBD" or away == home:
        return None
    if when <= now:
        return None  # No retroactive picks, including if cron runs late.
    baseline = config["baseline"]
    off_a,def_a,n_a = rates.get(away,(baseline,baseline,0))
    off_h,def_h,n_h = rates.get(home,(baseline,baseline,0))
    edge = config["home_edge"]
    expected_away = max(0.3,(off_a+def_h)/2-edge/2)
    expected_home = max(0.3,(off_h+def_a)/2+edge/2)
    # Raw estimated scoring difference chooses winner, not sportsbook odds.
    home_wins = expected_home >= expected_away
    # Non-tied integer projected score, while preserving winner orientation.
    away_score = max(0,int(math.floor(expected_away+0.5)))
    home_score = max(0,int(math.floor(expected_home+0.5)))
    if away_score == home_score:
        if home_wins:
            home_score += 1
        else:
            away_score += 1
    if (home_score > away_score) != home_wins:
        # Guard against rounding inversions.
        if home_wins:
            home_score = away_score+1
        else:
            away_score = home_score+1
    chosen = home if home_wins else away
    opponent = away if home_wins else home
    key = config["score_key"]
    score = { "team"+key: home_score if home_wins else away_score,
              "opponent"+key: away_score if home_wins else home_score}
    date_str = when.astimezone(PT).date().isoformat()
    # No made-up confidence percentage. Games with little history are explicitly flagged.
    low_data = min(n_a,n_h) < 3
    note = ("Limited current-season scoring data; baseline and home advantage play a larger role."
            if low_data else "Recent verified scoring form, opponent defense and a modest home adjustment.")
    return {
        "id":sport+"-auto-"+str(game["id"]),
        "sport":sport.upper(),
        "gameId":str(game["id"]),
        "date":date_str,
        "dateUTC":game.get("dateUTC"),
        "team":chosen,
        "opponent":opponent,
        "away":away,
        "home":home,
        "pickType":"moneyline",
        "createdBy":"Frozen Root automated statistical model (not ChatGPT)",
        "automated":True,
        "locked":True,
        "createdAt":now.isoformat(timespec="seconds").replace("+00:00","Z"),
        "status":"pending",
        "projectedScore":score,
        "modelVersion":"score-form-v1",
        "risk":"LOW DATA" if low_data else "MODEL ESTIMATE",
        "analysis":f"{note} Past result samples: {away} {n_a}, {home} {n_h}. "
                   "This is a simple automatic estimate, not a live ChatGPT analysis "
                   "and does not account for confirmed injuries, lineups or betting odds."
    }


def settle(entries, outcomes, now, config):
    changed=0
    key=config["score_key"]
    for p in entries:
        if p.get("status")!="pending":
            continue
        game = outcomes.get(str(p.get("gameId","")))
        item = final_event(game,now) if game else None
        if item:
            if p.get("team")==item["home"] and p.get("opponent")==item["away"]:
                team_score,opp_score=item["home_score"],item["away_score"]
            elif p.get("team")==item["away"] and p.get("opponent")==item["home"]:
                team_score,opp_score=item["away_score"],item["home_score"]
            else:
                continue
            p["actualScore"]={"team"+key:team_score,"opponent"+key:opp_score}
            p["status"]="win" if team_score>opp_score else "loss" if team_score<opp_score else "push"
            p["resultVerifiedOn"]=now.date().isoformat()
            p["resultSource"]="ESPN public scoreboard"
            changed+=1
        elif game:
            state=(game.get("status") or {}).get("type") or {}
            code=(str(state.get("name") or "")+" "+str(state.get("description") or "")).lower()
            if any(word in code for word in ("postpon","cancel")):
                p["status"]="void"
                p["settlementReason"]="Game postponed or canceled"
                changed+=1
    return changed


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--sport",choices=SPORTS,required=True)
    args=parser.parse_args()
    sport=args.sport
    config=SPORTS[sport]
    now=utc_now()
    day=now.astimezone(PT).date()
    schedule=load_json(ROOT/(sport+"-schedule.json"))
    official=load_json(ROOT/(sport+"-picks.json"))
    outfile=ROOT/("auto-"+sport+"-picks.json")
    dataset=load_json(outfile)
    entries=dataset.get("picks") or []
    game_list=schedule.get("games") or []

    expected_day = day.isoformat()
    if sport in ("nba","nhl") and schedule.get("date")!=expected_day:
        raise RuntimeError("Schedule isn't for today's Pacific day. No automatic picks will be posted.")
    if sport=="nfl":
        weekstart=day-timedelta(days=(day.weekday()-1)%7)
        if schedule.get("startDate")!=weekstart.isoformat():
            raise RuntimeError("NFL slate is out of date. Refusing to forecast an old week.")

    past_days={day-timedelta(days=i) for i in range(0,config["history_days"]+1)}
    # An opening-season prediction also uses a small slice of last spring's
    # regular season when 2026-27 scoring form is limited; explicit low-data warning remains.
    if config["prior_days"] and day.month in (10,11):
        spring=date(day.year,4,1)
        past_days.update(spring+timedelta(days=i) for i in range(config["prior_days"]))
    for p in entries:
        if p.get("status")=="pending":
            try:
                previous=date.fromisoformat(str(p.get("date")))
                if previous<=day:
                    past_days.add(previous)
            except ValueError:
                pass

    outcomes=fetch_results(config,past_days)
    settled=settle(entries,outcomes,now,config)
    rates=expected_rates(config,outcomes,now)
    known_ids={str(p.get("gameId")) for p in entries}
    manual_ids={str(p.get("gameId")) for p in official.get("picks",[]) if p.get("locked")}
    added=0
    for g in sorted(game_list,key=lambda g: str(g.get("dateUTC",""))):
        game_id=str(g.get("id",""))
        if not game_id or game_id in known_ids or game_id in manual_ids:
            continue
        status=str(g.get("status","")).lower()
        if any(x in status for x in ("final","complet","cancel","postpon","progress",
                                    "half","period","quarter","live","intermission")):
            continue
        game_at=datetime_utc(g.get("dateUTC"))
        if not game_at:
            continue
        record=forecast(g,config,rates,game_at,now,sport)
        if record:
            entries.append(record)
            known_ids.add(game_id)
            added+=1

    # Saved predictions never get their teams or projected scores recomputed.
    dataset["picks"]=entries
    dataset["lastUpdated"]=now.isoformat(timespec="seconds").replace("+00:00","Z")
    outfile.write_text(json.dumps(dataset,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{sport.upper()}: new auto picks={added}, newly settled={settled}, "
          f"total frozen={len(entries)}; official user locks left untouched.")


if __name__=="__main__":
    main()
