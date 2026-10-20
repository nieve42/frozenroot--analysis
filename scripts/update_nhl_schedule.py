#!/usr/bin/env python3
"""Refresh the NHL daily slate only. Never modify official NHL, NFL or MLB picks."""
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "nhl-schedule.json"
SOURCE = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"


def fetch_day(day):
    url = SOURCE + "?" + urlencode({"dates": day.strftime("%Y%m%d"), "limit": 100})
    last_error = None
    for attempt in range(3):
        try:
            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 FrozenRootNhlSlate/1.0",
                "Accept": "application/json"
            })
            with urlopen(req, timeout=25) as response:
                data = json.load(response)
            if not isinstance(data, dict) or not isinstance(data.get("events"), list):
                raise ValueError("Unexpected ESPN NHL schedule response")
            return data["events"]
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Could not fetch NHL games for {day}: {last_error}")


def game_from_event(event):
    competition = (event.get("competitions") or [{}])[0]
    competitors = competition.get("competitors") or []
    home = next((x for x in competitors if x.get("homeAway") == "home"), {})
    away = next((x for x in competitors if x.get("homeAway") == "away"), {})
    status = (competition.get("status") or event.get("status") or {})
    kind = status.get("type") or {}
    def team_name(x):
        team = x.get("team") or {}
        return team.get("displayName") or team.get("name") or "TBD"
    def score(x):
        raw = x.get("score")
        if isinstance(raw, dict):
            raw = raw.get("displayValue") or raw.get("value")
        return str(raw) if raw is not None else None
    return {
        "id": str(event.get("id", "")),
        "dateUTC": event.get("date") or competition.get("date"),
        "away": team_name(away),
        "home": team_name(home),
        "status": kind.get("description") or kind.get("name") or "Scheduled",
        "awayScore": score(away) if kind.get("completed") or kind.get("state") == "in" else None,
        "homeScore": score(home) if kind.get("completed") or kind.get("state") == "in" else None
    }


def main():
    today = datetime.now(PACIFIC).date()
    found = {}
    # ESPN groups some games by UTC date; inspect neighboring dates, filter in Pacific.
    for day_offset in (-1, 0, 1):
        for event in fetch_day(today + timedelta(days=day_offset)):
            game = game_from_event(event)
            if not game["id"] or not game["dateUTC"]:
                continue
            try:
                when = datetime.fromisoformat(game["dateUTC"].replace("Z", "+00:00"))
                if when.astimezone(PACIFIC).date() == today:
                    found[game["id"]] = game
            except ValueError:
                continue
    games = sorted(found.values(), key=lambda item: (item["dateUTC"], item["id"]))
    data = {
        "source": "ESPN NHL public scoreboard",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "date": today.isoformat(),
        "dailyReset": "12:01 AM America/Los_Angeles",
        "games": games
    }
    DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated NHL slate for {today}: {len(games)} games, zero official picks changed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
