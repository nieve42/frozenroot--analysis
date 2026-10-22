# FROZEN ROOT PREDICTION SYSTEM — Free GitHub Pages edition

This version of Frozen Root Prediction System is a static website built for **GitHub Pages Free**: dark blue-and-black design, desktop/mobile layout, official locked picks, a historical performance tracker, and methodology. No hosting subscription or Node.js server is required.

## Publish for free

1. Sign in to https://github.com (a free account is sufficient).
2. Create a **new public repository**, for example `root-frozen`.
3. Extract `root-frozen-github-pages.zip` on your computer.
4. In the repository on GitHub, choose **Add file → Upload files**, and upload these files to the repository root: `index.html`, `app.js`, `style.css`, `site.json`, and `README.md`. Commit the upload to the `main` branch. **Do not upload the ZIP as one file.**
5. In your repository choose **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch** and choose `main` / `(root)`, then save.
6. GitHub will show your actual Pages link after deployment. Open it on desktop or mobile.

## Update predictions

All published data lives in `site.json` at the root of this repository. Edit that file on GitHub and commit it to update the public website. Once you've connected the **GitHub** app to ChatGPT and granted repository permissions, ask Root to update the official pick or settle a verified result; where connector write access is available, Root can help publish the corresponding file changes through GitHub. This site itself has **no public edit form** or admin password because GitHub Pages is static hosting.

`site.json` retains user-confirmed October 18, 2026 Tampa Bay Rays ML vs Cleveland Guardians as LOCKED and PENDING. October 16 Cleveland Guardians selection is also still PENDING here until result verification. Earlier settled picks are represented by the user-supplied historical aggregate through October 15 (3 wins / 5 losses / 0 pushes), not fabricated as individual records.

### Important limitations

- The free site automatically **displays** published picks and **calculates** the win rate; it does not automatically predict games or verify live MLB results.
- Updating predictions requires editing the tracked JSON (manually, or with the connected GitHub assistant workflow). Real scheduled AI predictions and live data feeds would require additional integrations and could incur fees.
- This project is for hypothetical $1 entertainment units, not real-money betting or sportsbook transactions.
- The static files work when hosted by GitHub Pages or another web server. The JSON request may be blocked by browsers if you double-click `index.html` directly on your computer.


## Automatic daily MLB game schedule — no subscription

Frozen Root now has a **Today’s MLB schedule** section on the homepage. Every day at approximately **12:01 AM Pacific**, the public GitHub Actions workflow `.github/workflows/daily-mlb-schedule.yml` fetches that day's official MLB game slate and writes `schedule.json`; it also refreshes around **2:23 PM Pacific** for changes to postponements and game status for schedule changes. It uses MLB's public Stats API and GitHub Actions with no paid API key. Scheduled GitHub Actions jobs are best-effort and can be delayed, skipped, or disabled after 60 days of repository inactivity.

- New matchups display **PICK PENDING**. This **does not** mean that a team has been selected, and these placeholders do **not** enter the official ledger, win rate, or **Awaiting Results** number.
- When an official pick for the exact matchup and date has already been locked in `site.json`, the schedule card shows the locked team instead. This workflow **never edits `site.json`**.
- Cancelled or postponed games are labeled **GAME CANCELED / POSTPONED — NO PENDING PICK** in the schedule. Official pick settlements/voiding are a **separate verified record update**.
- Finished games without a locked official pick show **FINAL — NO OFFICIAL PICK**.
- If GitHub's daily refresh is late, the website attempts a direct live MLB schedule request in the browser. If that is unavailable, it explicitly shows **Schedule unavailable** rather than pretending there were no games.
- You can manually run the feed from **GitHub → Actions → Frozen Root — Daily slate at 12:01 AM PT → Run workflow**, if the first scheduled run hasn't occurred yet and GitHub Actions are enabled.

**This feature automatically posts the games and pending placeholders, not model-selected winners.** Genuine automatic winner predictions would require a separate data-validation and analysis service, and they must never silently override locked official picks.



## NFL football — separate game section

The navigation menu contains **Football games** directly beneath **Update the website**. The NFL tab is fully separate from the MLB dashboard, pick archive, and baseball record.

- `nfl-schedule.json` contains the current **Tuesday-through-Monday NFL week** from ESPN's public scoreboard feed, displayed with kickoff times in Pacific time. The entire displayed week is replaced every Tuesday.
- `scripts/update_nfl_schedule.py` refreshes the NFL slate only; it never edits the MLB `site.json` or any official pick.
- `.github/workflows/daily-nfl-schedule.yml` updates game statuses daily at approximately **12:01 AM Pacific** and refreshes them in the afternoon. **Tuesday at 12:01 AM Pacific** begins a new NFL week: the previous week's visible games are cleared and replaced with Tuesday–Monday matchups. If the job is delayed, the site hides the old week instead of displaying it as current. Scheduled GitHub Actions can be delayed and may be paused by GitHub.
- `nfl-picks.json` is the separate NFL official pick ledger, containing our October 19 locked 49ers selection and its pregame projected score. Upcoming games display **PICK PENDING** until an official NFL selection is deliberately locked. No football pick is assumed from the posted schedule.
- Canceled or postponed games are labeled as such. Schedule entries and placeholders never increment either sport's win/loss totals or Awaiting Results.

GitHub Pages remains free. As of October 20, 2026, the site also publishes separate **automatic statistical predictions** for NFL, NBA and NHL via GitHub Actions; manual Root + owner picks remain separate. See the updated automatic sports forecast section below.


## MLB score forecasts — team runs and total

When locking a **new** MLB moneyline pick, store an optional pregame score projection in its entry in `site.json`. The official pick should include this field when the independent prediction is made **before first pitch**:

```json
{
  "team": "Tampa Bay Rays",
  "opponent": "Cleveland Guardians",
  "projectedScore": {
    "teamRuns": 4,
    "opponentRuns": 2
  }
}
```

**Example only; not a historical forecast or a new official game selection.** The website displays this as **Rays 4 – Guardians 2, projected total 6 runs** on the latest locked MLB pick and in Pick History, and also on the day's schedule card if the locked game is scheduled that day. The total is calculated, so do not manually enter an inconsistent total.

- `projectedScore.teamRuns` is the projected run total for **`team`**, Root's official winner pick; `projectedScore.opponentRuns` is for **`opponent`**.
- Use nonnegative whole numbers for each field. Publish the forecast **at the time the new pick is locked**; don't retroactively invent it for old entries or silently revise it after the game.
- Forecast runs are **not the actual final score** and do **not** affect moneyline wins, losses, voids, or Awaiting Results. Settlements remain independent (`status` and verified `finalScore`).
- Historical entries with no recorded pregame score forecast display **Not recorded**.



## NFL score forecasts — projected points and total

When we publish an official NFL winner pick, it can include a **pregame estimated final score** in the separate `nfl-picks.json` ledger:

```json
{
  "team": "San Francisco 49ers",
  "opponent": "Washington Commanders",
  "projectedScore": { "teamPoints": 27, "opponentPoints": 20 }
}
```

The example above is the **published pregame prediction for October 19, 2026** (forecast added October 18 before kickoff). It predicts **49ers 27 – Commanders 20**, for **47 projected total points**. The moneyline winner remains locked as San Francisco.

- `projectedScore.teamPoints` is the forecast for `team` (our NFL pick), and `projectedScore.opponentPoints` is for `opponent`. Both must be nonnegative whole numbers; the website calculates total points.
- Forecasts appear on **Latest official NFL pick**, **NFL pick history**, and the weekly NFL schedule card when the matchup remains in the displayed week.
- Future NFL score forecasts should be saved before kickoff, ideally when the winner is locked. Do not fabricate forecasts for finished games or silently revise historical projections.
- **PREGAME FORECAST** and **ACTUAL SCORE** are different. Projections have no effect on wins, losses, voids, or Awaiting Results in either NFL or MLB.
- Weekly NFL schedule refreshes never modify `nfl-picks.json`, and locked picks stay in history after Tuesday resets.


## NBA basketball — separate daily schedule and pick ledger

Frozen Root now has an **NBA basketball** tab beneath Football. It matches the site's black-and-ice-blue styling and is designed for desktop and mobile.

- The **daily NBA slate** comes from ESPN's public NBA scoreboard feed and is stored in `nba-schedule.json`.
- `scripts/update_nba_schedule.py` runs via `.github/workflows/daily-nba-schedule.yml` at approximately **12:01 AM Pacific** every day, with an afternoon refresh. GitHub scheduled jobs are best effort and may be delayed. The site hides yesterday's slate if today's feed has not yet published.
- Upcoming games appear as **PICK PENDING** until an official NBA winner is intentionally locked. Games not played, cancelled, or postponed do not become pending official predictions.
- Final games show the **actual score and winning team**. This does not automatically mark an official locked prediction as won or lost; official settlement is a separate verified edit.
- Official basketball picks live only in `nba-picks.json`. NBA wins/losses, picks, and forecasts **never** affect either the NFL or MLB trackers.
- New locked NBA picks can include `projectedScore: {"teamPoints": 116, "opponentPoints": 109}` (example values only). The website calculates the predicted total, preserves the original projection, and shows actual results separately if they become available. No historical or future winner has been assumed.
- Games and status displays are automated; **winner predictions are not**. Root and the user must deliberately lock NBA moneyline picks before tipoff.


## NHL hockey — separate daily games and official picks

The **NHL hockey** tab sits directly beneath NBA Basketball on the navigation menu. It uses the same frozen blue-and-black theme and works on PC and mobile.

- `nhl-schedule.json` lists games, times (Pacific), live statuses, and final scores from ESPN's public NHL scoreboard. Games are grouped by the current calendar date in the Pacific timezone.
- The scheduled GitHub workflow `.github/workflows/daily-nhl-schedule.yml` runs `scripts/update_nhl_schedule.py` at approximately **12:01 AM Pacific** with an afternoon refresh. GitHub Actions are best-effort and may run late; yesterday's slate clears automatically in the page until today's update arrives.
- New games show the **frozen automatic NHL winner, projected goals, and projected total goals** as soon as a pregame model forecast is published. Until one is available, they show **PICK PENDING**; placeholders are not actual picks or awaiting results. Canceled or postponed games are clearly marked.
- Official NHL moneyline picks belong in `nhl-picks.json` only. A locked pick can contain `projectedScore: {"teamGoals": 3, "opponentGoals": 2}` (illustration, not a real prediction). Predicted total goals are computed from the two teams' goal forecasts.
- Completed games display **actual goals and the winner**, without silently rewriting a locked pregame forecast. Official picks are settled as wins/losses/voids only after verification.
- NHL picks, win/loss records and history are **independent** from baseball, football, and basketball. The automatic model records forecasts in `auto-nhl-picks.json`, while **manually confirmed official selections** remain separate in `nhl-picks.json` and cannot be changed by the model.


## Automatically generated NFL, NBA and NHL winner picks + projected scores (free)

When the schedule workflow posts its next slate, `scripts/auto_sports_picks.py`
runs immediately afterward, gathers recent **completed games from ESPN**, estimates
each team's scoring and scoring allowed, applies a modest home adjustment,
and publishes one **predicted moneyline winner with projected scores for both teams**
and the projected total. No OpenAI API key, paid subscription or sportsbook data
is required. Automatic forecasts are a basic statistical model, **not a live
ChatGPT judgment**; they do not incorporate verified gameday injuries or lineups.
Early-season picks with little usable game history are especially uncertain.

Schedules and automatic forecasts refresh as follows:
- NFL: every Tuesday around **12:01 AM Pacific** for the Tuesday–Monday slate,
  plus daily scheduled refreshes for score/status updates.
- NBA and NHL: **daily at approximately 12:01 AM Pacific**, with hourly and afternoon
  refreshes for new games and scores. For **NHL**, each published daily file also
  stages the **following Pacific day's games**, allowing the auto model to lock
  pregame forecasts a day in advance so they are ready when the next slate appears.
  GitHub schedules are best-effort and can run late.

Each sport keeps a **separate automatic pick record** in
`auto-nfl-picks.json`, `auto-nba-picks.json`, or `auto-nhl-picks.json`.
Every selection and pregame score is saved with a timestamp and **never changed
to match later results**. Once ESPN confirms a final, the auto pick is
automatically marked win/loss, with the actual score saved separately. Canceled
or postponed games can be marked void. New picks are made **only before kickoff,
tipoff or puck drop**; the model skips games already in progress or completed.

The website displays the auto winner and score forecast **on the schedule game
card**, and also displays a separate auto model record, win rate, latest forecast
and history on each sport's page. Independently reviewed and owner-confirmed
official Root selections in `nfl-picks.json`, `nba-picks.json`,
`nhl-picks.json` take priority over auto cards and **are never overwritten or
silently switched**. Baseball is unchanged.

If source data or the schedule publishing job fails, a pick may temporarily
remain `PICK PENDING`. The site does not fabricate completed games, live
ChatGPT analysis, a win probability, or guarantees of winning.


## Top-of-page automated prediction accuracy records

The NFL, NBA and NHL pages each show a top-of-page automatic winner prediction accuracy tracker. It calculates **correct winner picks (wins), incorrect winner picks (losses), and wins / (wins + losses)** from that sport's own full automatic prediction history. The counters are not manually entered, do not represent the teams' season W–L standings, and do not include MLB or manually locked Root picks.

An example display like "1 win / 2 losses" is illustrative only. Actual counters always reflect completed, verified automatic predictions in the saved per-sport pick ledger plus any freshly verified final scores already visible in the current schedule. Pending, void, and tied/push games do not count as wins or losses. When no picks have been graded, the record is 0 wins / 0 losses and the accuracy percentage shows a dash. If data can't be loaded, the record displays unavailable rather than falsely showing zero. The numbers refresh on site visits and periodically while the section is open.

## Seasonal 0–0 rollover and completed-season archives

The website now has a separate **🏆 Season archives** navigation tab for **MLB, NFL, NBA and NHL**. Each sport retains a current-season winner prediction W–L record, resetting to **0 wins / 0 losses** at the start of its next season. The archive then displays the completed season's full **wins, losses, and accuracy** in that sport's own card. Historical picks and their saved outcomes remain in their original JSON ledgers and are **never erased**.

- **MLB:** one official Root pick record per baseball season. The preserved historical MLB baseline (3–5 through October 15, 2026) counts toward *2026 only*, along with later individual picks, rather than being repeated in later years.
- **NFL:** model-generated picks and manually locked Root picks appear as distinct records for each NFL season.
- **NBA:** model-generated picks and manually locked Root picks appear as distinct records for each NBA season.
- **NHL:** model-generated picks and manually locked Root picks appear as distinct records for each NHL season.

The season rollover dates are conservative fixed dates in the **America/Los_Angeles** time zone after the usual championship windows: **MLB November 15**, **NFL February 22**, **NBA July 1**, **NHL July 1**. These are practical record-reset boundaries, **not exact assertions of league championship dates**; they should be adjusted in `season-records.js` if a season schedule ever runs unusually late. The current season is visible as *Active* in the archive; concluded seasons show up as *Final Record* when a reset boundary passes.

Live current-season metrics filter picks by their season; original game history, saved score projections, and past-season records are preserved. Pending games, void games, and ties/pushes are excluded from wins/losses and accuracy calculations. A missing history file displays an unavailable message, never a fabricated 0–0 record.

The archive is calculated deterministically from the retained pick-ledger files, not manually typed W–L counters; **keep the historical ledgers available** to preserve archive totals.
