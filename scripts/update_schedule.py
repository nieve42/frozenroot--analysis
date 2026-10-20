#!/usr/bin/env python3
"""Update the PUBLIC daily game slate only. Never modify site.json or official picks."""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
OUTPUT = Path(__file__).resolve().parents[1] / "schedule.json"
ENDPOINT = "https://statsapi.mlb.com/api/v1/schedule"


def load_schedule(day: str) -> dict:
    url = ENDPOINT + "?" + urlencode({"sportId": "1", "date": day})
    request = Request(url, headers={"User-Agent": "FrozenRootSchedule/1.0", "Accept": "application/json"})
    failure = None
    for attempt in range(3):
        try:
            with urlopen(request, timeout=25) as response:
                data = json.load(response)
            if not isinstance(data, dict) or not isinstance(data.get("dates"), list):
                raise ValueError("Malformed MLB schedule response; refusing to publish empty slate")
            return data
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            failure = exc
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError("MLB schedule refresh failed: " + str(failure))


def game_record(game: dict) -> dict:
    teams = game.get("teams") or {}
    away = (teams.get("away") or {}).get("team") or {}
    home = (teams.get("home") or {}).get("team") or {}
    status = game.get("status") or {}
    state = status.get("detailedState", "Scheduled")
    completed = str(state).lower() in ("final", "completed", "game over")
    return {
        "gamePk": game.get("gamePk"),
        "away": away.get("name", "Away TBD"),
        "home": home.get("name", "Home TBD"),
        "startUTC": game.get("gameDate"),
        "status": state,
        "awayScore": (teams.get("away") or {}).get("score") if completed else None,
        "homeScore": (teams.get("home") or {}).get("score") if completed else None,
        "series": game.get("seriesDescription", ""),
        "gameType": game.get("gameType", ""),
        "gameNumber": game.get("seriesGameNumber"),
    }


def main() -> int:
    day = datetime.now(PACIFIC).date().isoformat()
    source = load_schedule(day)
    games = [
        game_record(g)
        for entry in source["dates"]
        if entry.get("date") == day
        for g in entry.get("games", [])
        if isinstance(g, dict)
    ]
    games.sort(key=lambda g: (g["startUTC"] or "", str(g["gamePk"])))
    out = {
        "date": day,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": "MLB Stats API",
        "games": games,
    }
    # This file has no predictions or selections, only scheduled games.
    OUTPUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Refreshed {len(games)} MLB games for {day}; official picks left untouched.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
