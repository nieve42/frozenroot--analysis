#!/usr/bin/env python3
"""Publish NFL game schedule ONLY. Official NFL/MLB picks are never edited."""
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

PT = ZoneInfo("America/Los_Angeles")
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "nfl-schedule.json"
BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"


def load_day(day):
    url = BASE + "?" + urlencode({"dates":day.strftime("%Y%m%d"), "limit":50})
    error = None
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent":"Mozilla/5.0 FrozenRootNflSlate/1.0", "Accept":"application/json"})
            with urlopen(request, timeout=25) as response:
                payload = json.load(response)
            if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
                raise ValueError("Unexpected NFL schedule response")
            return payload["events"]
        except Exception as exc:
            error = exc
            if attempt < 2:
                time.sleep(2 * (attempt+1))
    raise RuntimeError(f"Could not fetch NFL schedule for {day}: {error}")


def make_game(event):
    competition = (event.get("competitions") or [{}])[0]
    competitors = competition.get("competitors") or []
    home = next((c for c in competitors if c.get("homeAway") == "home"), {})
    away = next((c for c in competitors if c.get("homeAway") == "away"), {})
    status = (competition.get("status") or event.get("status") or {})
    state = status.get("type") or {}
    def team_name(c):
        t = c.get("team") or {}
        return t.get("displayName") or t.get("name") or "TBD"
    return {
        "id": str(event.get("id","")),
        "dateUTC": event.get("date") or competition.get("date"),
        "away": team_name(away), "home": team_name(home),
        "status": state.get("description") or state.get("name") or "Scheduled",
        "awayScore": away.get("score") if state.get("completed") else None,
        "homeScore": home.get("score") if state.get("completed") else None
    }


def main():
    today = datetime.now(PT).date()
    until = today + timedelta(days=6)
    # Include a prior/next query day to cover ESPN grouping across time zones.
    unique = {}
    for offset in range(-1, 8):
        for event in load_day(today+timedelta(days=offset)):
            game = make_game(event)
            if not game["id"] or not game["dateUTC"]:
                continue
            try:
                local_day = datetime.fromisoformat(game["dateUTC"].replace("Z","+00:00")).astimezone(PT).date()
            except ValueError:
                continue
            if today <= local_day <= until:
                unique[game["id"]] = game
    games = sorted(unique.values(),key=lambda g:(g["dateUTC"],g["id"]))
    output={
        "source":"ESPN NFL public scoreboard",
        "generatedAt":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z"),
        "startDate":today.isoformat(), "endDate":until.isoformat(),
        "games":games
    }
    DEST.write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"Published NFL schedule ({today} through {until}) — {len(games)} games, no picks changed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc),file=sys.stderr)
        sys.exit(1)
