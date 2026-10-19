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

