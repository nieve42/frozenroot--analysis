/* Frozen Root NHL — daily schedule, score forecasts and separate locked picks. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const grid = byId('nhlGames');
  if (!grid) return;
  const meta = byId('nhlMeta');
  const dayLabel = byId('nhlDateLabel');
  const summary = byId('nhlPickSummary');
  const feature = byId('nhlOfficialPick');
  const history = byId('nhlHistoryRows');
  const count = byId('nhlHistoryCount');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validDate = d => d instanceof Date && !Number.isNaN(d.getTime());
  const pacificDay = date => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date);
    const value = part => parts.find(x => x.type === part)?.value || '';
    return value('year')+'-'+value('month')+'-'+value('day');
  };
  const prettyDay = day => new Intl.DateTimeFormat('en-US', {
    weekday:'short',month:'short',day:'numeric',timeZone:'UTC'
  }).format(new Date(day+'T12:00:00Z'));
  const gameTime = utc => {
    const date = new Date(utc);
    return validDate(date) ? new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',timeZoneName:'short'
    }).format(date) : 'TIME TBD';
  };
  const isFinal = state => /final|complete|closed/i.test(state);
  const isOff = state => /cancel|postpon|suspend/i.test(state);
  const isLive = state => /in progress|intermission|period|end of|live|shootout|overtime/i.test(state);
  const statusClass = value => ['win','loss','pending','void','push'].includes(value) ? value : 'pending';
  async function readJson(file) {
    const response = await fetch('./'+file+'?t='+Date.now(),{cache:'no-store'});
    if (!response.ok) throw new Error(file+' request failed');
    return response.json();
  }
  // GitHub Actions schedules are best-effort. If the published file is from
  // yesterday, try ESPN in the browser so today's slate can appear immediately.
  // This never creates, changes, or locks a pick; JSON ledgers stay authoritative.
  async function liveTodaySlate(today) {
    const base = new Date(today + 'T12:00:00Z');
    const dates = [-1,0,1].map(offset => {
      const date = new Date(base.getTime() + offset * 86400000);
      return date.toISOString().slice(0,10).replace(/-/g,'');
    });
    const results = await Promise.allSettled(dates.map(async day => {
      const url = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=' +
        encodeURIComponent(day) + '&limit=100';
      const response = await fetch(url,{cache:'no-store'});
      if (!response.ok) throw new Error('ESPN NHL scoreboard unavailable');
      const data = await response.json();
      if (!Array.isArray(data?.events)) throw new Error('Unexpected NHL scoreboard response');
      return data.events;
    }));
    const successful = results.filter(r => r.status === 'fulfilled');
    if (!successful.length) throw new Error('ESPN NHL live schedule fallback unavailable');
    const games = new Map();
    for (const result of successful) {
      for (const event of result.value) {
        const competition = event?.competitions?.[0];
        const competitors = competition?.competitors || [];
        const away = competitors.find(t => t.homeAway === 'away');
        const home = competitors.find(t => t.homeAway === 'home');
        const timestamp = event?.date || competition?.date;
        if (!event?.id || !away || !home || !timestamp) continue;
        const date = new Date(timestamp);
        if (!validDate(date) || pacificDay(date) !== today) continue;
        const kind = (competition?.status || event?.status || {}).type || {};
        const active = Boolean(kind.completed || kind.state === 'in');
        const value = team => {
          if (!active) return null;
          const raw = team?.score;
          const score = typeof raw === 'object' && raw !== null
            ? (raw.displayValue ?? raw.value) : raw;
          return score === null || score === undefined ? null : String(score);
        };
        games.set(String(event.id),{
          id:String(event.id),
          dateUTC:timestamp,
          away:away.team?.displayName || away.team?.name || 'TBD',
          home:home.team?.displayName || home.team?.name || 'TBD',
          status:kind.description || kind.name || 'Scheduled',
          awayScore:value(away),homeScore:value(home)
        });
      }
    }
    return {
      source:'ESPN NHL public scoreboard (browser fallback)',
      generatedAt:new Date().toISOString(),date:today,
      dailyReset:'12:01 AM America/Los_Angeles',
      liveFallback:true,
      games:[...games.values()].sort((a,b) =>
        String(a.dateUTC).localeCompare(String(b.dateUTC)))
    };
  }
  const scoreValue = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  };
  function pregameScore(p) {
    const scores = p?.projectedScore;
    const team = scoreValue(scores?.teamGoals), opponent = scoreValue(scores?.opponentGoals);
    return team === null || opponent === null ? null :
      {team,opponent,total:team+opponent};
  }
  function pregameCard(p) {
    const s = pregameScore(p);
    if (!s) return '<div class="run-projection missing"><div class="run-projection-heading"><span>🏒 PROJECTED FINAL SCORE</span><small>PREGAME FORECAST</small></div><p>No pregame score forecast was recorded for this pick.</p></div>';
    return '<section class="run-projection nhl-score-projection">'+
      '<div class="run-projection-heading"><span>🏒 PROJECTED FINAL SCORE</span><small>PREGAME FORECAST · NOT ACTUAL RESULTS</small></div>'+
      '<div class="run-projection-scores">'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.team)+'</span><strong>'+s.team+'</strong></div>'+
      '<div class="run-score-separator">–</div>'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.opponent)+'</span><strong>'+s.opponent+'</strong></div>'+
      '<div class="run-total"><span>PROJECTED TOTAL GOALS</span><strong>'+s.total+'</strong></div></div></section>';
  }
  function pregameHistory(p) {
    const s = pregameScore(p);
    return s ? '<strong class="projection-history-score">'+s.team+' – '+s.opponent+'</strong>'+
      '<small>'+s.total+' total goals · FORECAST</small>' :
      '<span class="projection-unavailable">Not recorded</span>';
  }
  function officialFinal(p,schedule) {
    const saved = p?.actualScore;
    if (['win','loss','push'].includes(p?.status)) {
      const a = scoreValue(saved?.teamGoals), b = scoreValue(saved?.opponentGoals);
      if (a !== null && b !== null) return {team:a,opponent:b};
    }
    const game = schedule?.games?.find(g => String(g.id) === String(p.gameId));
    if (!game || !isFinal(String(game.status||''))) return null;
    const away = scoreValue(game.awayScore), home = scoreValue(game.homeScore);
    if (away === null || home === null) return null;
    if (p.team === game.away && p.opponent === game.home) return {team:away,opponent:home};
    if (p.team === game.home && p.opponent === game.away) return {team:home,opponent:away};
    return null;
  }
  const winner = (p,score) => score.team===score.opponent ? 'TIE GAME' :
    (score.team>score.opponent ? p.team : p.opponent);
  function finalCard(team,opponent,a,b) {
    const leader = a === b ? 'TIE GAME' : (a > b ? team : opponent);
    return '<section class="actual-final" aria-label="Actual final score">'+
      '<div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>GAME COMPLETE</small></div>'+
      '<div class="actual-final-score"><span>'+safe(team)+'</span><strong>'+a+' – '+b+'</strong><span>'+safe(opponent)+'</span></div>'+
      '<div class="actual-final-winner">'+(leader==='TIE GAME'?'TIE GAME':'🏆 WINNER: '+safe(leader))+'</div></section>';
  }
  function finalHistory(p,schedule) {
    const score = officialFinal(p,schedule);
    if (!score) return '<small class="actual-unavailable">'+(p.status==='void'?'Canceled / void':'Not final')+'</small>';
    return '<strong class="actual-history-score">'+score.team+' – '+score.opponent+'</strong>'+
      '<small class="actual-history-winner">'+(score.team===score.opponent?'TIE GAME':'WINNER: '+safe(winner(p,score)))+'</small>';
  }
  function renderOfficial(ledger,schedule) {
    if (!ledger || !Array.isArray(ledger.picks)) {
      feature.innerHTML = '<div class="loading">NHL official picks temporarily unavailable.</div>';
      history.innerHTML = '<tr><td colspan="6">Pick history unavailable.</td></tr>';
      count.textContent = 'UNAVAILABLE';
      summary.textContent = 'NHL pick record unavailable.';
      return;
    }
    const locked = ledger.picks.filter(p => p.locked === true)
      .map(p => ({...p,...window.FrozenRootSportResult.get(p,schedule,'Goals')}))
      .sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const season=window.FrozenRootSeason.current('nhl');
    const currentLocked=locked.filter(p=>window.FrozenRootSeason.matches('nhl',p.date));
    const wins=currentLocked.filter(p=>p.status==='win').length;
    const losses=currentLocked.filter(p=>p.status==='loss').length;
    const pending=currentLocked.filter(p=>p.status==='pending').length;
    summary.textContent = 'NHL '+season.label+' SEASON · '+wins+' wins · '+losses+' losses · '+pending+
      ' awaiting results. MLB and NFL records are unaffected.';
    count.textContent = locked.length+' LOCKED PICK'+(locked.length === 1?'':'S');
    if (!locked.length) {
      feature.innerHTML = '<div class="loading">No official NHL picks have been locked yet. Scheduled games are PICK PENDING until we choose a winner.</div>';
      history.innerHTML = '<tr><td colspan="6">No locked NHL picks yet.</td></tr>';
      return;
    }
    const p = locked[0], status = String(p.status||'pending').toLowerCase();
    const actual = officialFinal(p,schedule);
    feature.innerHTML = '<div class="picktop"><span class="labelcyan">🏒 OFFICIAL NHL SELECTION</span>'+
      '<span class="pickdate">'+safe(prettyDay(p.date))+' · '+safe(p.series||'NHL')+'</span></div>'+
      '<div class="pickbody"><span class="labelcyan">MONEYLINE WINNER</span>'+
      '<div class="picktitle">'+safe(p.team).toUpperCase()+'</div>'+
      '<div class="opp">VERSUS '+safe(p.opponent)+'</div>'+
      '<div class="pickchips"><span class="chip locked">❄ OFFICIALLY LOCKED</span>'+
      '<span class="chip '+statusClass(status)+'">'+safe(status.toUpperCase())+'</span>'+
      '<span class="chip">HYPOTHETICAL $'+safe(p.stake??1)+' UNIT</span>'+window.FrozenRootReliability.badge(p,'nhl',false)+'</div>'+
      pregameCard(p)+(actual?finalCard(p.team,p.opponent,actual.team,actual.opponent):'')+
      '<p class="nfl-info">'+safe(p.analysis||'Locked before puck drop.')+'</p></div>'+
      '<div class="feature-note"><strong>RISK / PROCESS</strong><span>'+
      safe(p.risk||'Pregame prediction, not a guarantee.')+'</span></div>';
    history.innerHTML = locked.map(p => {
      const status = String(p.status||'pending').toLowerCase();
      return '<tr><td>'+safe(prettyDay(p.date))+'</td>'+
        '<td><strong>'+safe(p.team)+'</strong><small>OFFICIAL · LOCKED</small></td>'+
        '<td>'+safe(p.opponent)+'</td><td>'+pregameHistory(p)+'</td>'+
        '<td>'+finalHistory(p,schedule)+'</td>'+
        '<td><span class="status '+statusClass(status)+'">'+safe(status.toUpperCase())+
        '</span></td></tr>';
    }).join('');
  }
  function renderSlate(slate,ledger,automaticLedger) {
    if (!slate || !Array.isArray(slate.games)) throw new Error('Invalid NHL slate');
    const today = pacificDay(new Date());
    dayLabel.textContent = prettyDay(today).toUpperCase()+' · DAILY RESET';
    if (slate.date !== today) {
      meta.textContent = 'TODAY\'S NHL SCHEDULE IS UPDATING';
      grid.innerHTML = '<div class="panel schedule-empty">The previous day’s NHL games have cleared. The current slate is awaiting its scheduled refresh; no picks are assumed.</div>';
      return;
    }
    const updated = new Date(slate.generatedAt);
    const stale = !validDate(updated) || Date.now()-updated.getTime()>26*3600000;
    meta.textContent = 'SOURCE: ESPN NHL SCOREBOARD'+
      (slate.liveFallback?' · LIVE FALLBACK WHILE NIGHTLY PUBLISH CATCHES UP':'')+
      (validDate(updated)?' · UPDATED '+new Intl.DateTimeFormat('en-US',{
        timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
      }).format(updated)+' PT':'')+(stale?' · FEED MAY BE OUTDATED':'');
    const games = slate.games.filter(g => {
      const date = new Date(g.dateUTC);
      return validDate(date) && pacificDay(date) === today;
    }).sort((a,b) => String(a.dateUTC).localeCompare(String(b.dateUTC)));
    if (!games.length) {
      grid.innerHTML = '<div class="panel schedule-empty">No NHL games are scheduled for today. The next daily slate will appear after midnight Pacific.</div>';
      return;
    }
    grid.innerHTML = games.map(g => {
      const state = String(g.status||'Scheduled');
      const official = ledger?.picks?.find(p => p.locked===true && String(p.gameId)===String(g.id));
      const automatic = !official && automaticLedger?.picks?.find(p => p.automated===true && String(p.gameId)===String(g.id));
      const pick = official || automatic;
      let label='❄ PICK PENDING', cls='await-pick';
      if (isOff(state)) { label='CANCELED / POSTPONED — NO PENDING PICK';cls='off'; }
      else if (official) { label='❄ OFFICIAL NHL PICK: '+official.team+' ('+window.FrozenRootSportResult.get(official,slate,'Goals').status.toUpperCase()+')';cls='official'; }
      else if (automatic) { label='🤖 AUTOMATIC NHL PICK: '+automatic.team+' ('+window.FrozenRootSportResult.get(automatic,slate,'Goals').status.toUpperCase()+')';cls='automated'; }
      else if (isFinal(state)) {label='FINAL — NO OFFICIAL PICK';cls='final';}
      else if (isLive(state)) {label='IN PROGRESS — NO OFFICIAL PICK';cls='final';}
      else if (!ledger || !Array.isArray(ledger.picks)) {label='PICK STATUS UNAVAILABLE';cls='off';}
      const away = scoreValue(g.awayScore),home = scoreValue(g.homeScore);
      const final = isFinal(state) && away !== null && home !== null ?
        finalCard(g.away,g.home,away,home) : '';
      const live = isLive(state) && !isFinal(state) && away!==null && home!==null ?
        '<p class="football-score">LIVE: '+safe(g.away)+' '+away+' – '+home+' '+safe(g.home)+'</p>' : '';
      const forecast = pick ? pregameScore(pick) : null;
      const forecastHtml = forecast ?
        '<p class="nfl-slate-forecast">PREGAME GOALS FORECAST: '+safe(pick.team)+' '+
        forecast.team+' · '+safe(pick.opponent)+' '+forecast.opponent+
        ' · TOTAL '+forecast.total+' GOALS</p>' : '';
      return '<article class="schedule-game">'+
        '<div class="schedule-game-head"><span>NHL · '+safe(g.id)+'</span><span>'+
        safe(gameTime(g.dateUTC))+'</span></div>'+
        '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
        '<p class="schedule-game-state">'+safe(state)+'</p>'+live+
        '<div class="schedule-status '+cls+'">'+safe(label)+'</div>'+(pick?'<div class="slate-reliability">'+window.FrozenRootReliability.badge(pick,'nhl',!!automatic)+'</div>':'')+forecastHtml+final+
        '</article>';
    }).join('');
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy=true;
    try {
      const outcomes = await Promise.allSettled([
        readJson('nhl-schedule.json'),readJson('nhl-picks.json'),readJson('auto-nhl-picks.json')
      ]);
      const ledger = outcomes[1].status==='fulfilled' ? outcomes[1].value : null;
      let slate = outcomes[0].status==='fulfilled' ? outcomes[0].value : null;
      const today = pacificDay(new Date());
      if (!slate || slate.date !== today) {
        try { slate = await liveTodaySlate(today); }
        catch (error) {
          console.warn('NHL midnight live fallback unavailable:',error);
        }
      }
      renderOfficial(ledger,slate);
      if (!slate) throw new Error('NHL schedule unavailable');
      renderSlate(slate,ledger, outcomes[2].status==='fulfilled'?outcomes[2].value:null);
    } catch (error) {
      dayLabel.textContent = prettyDay(pacificDay(new Date())).toUpperCase();
      meta.textContent = 'NHL SCHEDULE TEMPORARILY UNAVAILABLE';
      grid.innerHTML = '<div class="panel schedule-empty">Could not verify today’s NHL games. '+
        '<a href="https://www.espn.com/nhl/schedule" target="_blank" rel="noopener noreferrer">See ESPN NHL schedule ↗</a></div>';
    } finally { busy=false; }
  }
  refresh();
  window.addEventListener('hashchange',()=>{if(location.hash==='#hockey') refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && location.hash==='#hockey') refresh();});
  setInterval(()=>{if(location.hash==='#hockey')refresh();},60000);
})();
