/* Frozen Root NBA — daily schedule, score forecasts and separate locked picks. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const grid = byId('nbaGames');
  if (!grid) return;
  const meta = byId('nbaMeta');
  const dayLabel = byId('nbaDateLabel');
  const summary = byId('nbaPickSummary');
  const feature = byId('nbaOfficialPick');
  const history = byId('nbaHistoryRows');
  const count = byId('nbaHistoryCount');
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
  const isLive = state => /in progress|half|quarter|end of|halftime|live/i.test(state);
  const statusClass = value => ['win','loss','pending','void','push'].includes(value) ? value : 'pending';
  async function readJson(file) {
    const response = await fetch('./'+file+'?t='+Date.now(),{cache:'no-store'});
    if (!response.ok) throw new Error(file+' request failed');
    return response.json();
  }
  const scoreValue = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  };
  function pregameScore(p) {
    const scores = p?.projectedScore;
    const team = scoreValue(scores?.teamPoints), opponent = scoreValue(scores?.opponentPoints);
    return team === null || opponent === null ? null :
      {team,opponent,total:team+opponent};
  }
  function pregameCard(p) {
    const s = pregameScore(p);
    if (!s) return '<div class="run-projection missing"><div class="run-projection-heading"><span>🏀 PROJECTED FINAL SCORE</span><small>PREGAME FORECAST</small></div><p>No pregame score forecast was recorded for this pick.</p></div>';
    return '<section class="run-projection nba-score-projection">'+
      '<div class="run-projection-heading"><span>🏀 PROJECTED FINAL SCORE</span><small>PREGAME FORECAST · NOT ACTUAL RESULTS</small></div>'+
      '<div class="run-projection-scores">'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.team)+'</span><strong>'+s.team+'</strong></div>'+
      '<div class="run-score-separator">–</div>'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.opponent)+'</span><strong>'+s.opponent+'</strong></div>'+
      '<div class="run-total"><span>PROJECTED TOTAL POINTS</span><strong>'+s.total+'</strong></div></div></section>';
  }
  function pregameHistory(p) {
    const s = pregameScore(p);
    return s ? '<strong class="projection-history-score">'+s.team+' – '+s.opponent+'</strong>'+
      '<small>'+s.total+' total points · FORECAST</small>' :
      '<span class="projection-unavailable">Not recorded</span>';
  }
  function officialFinal(p,schedule) {
    const saved = p?.actualScore;
    if (['win','loss','push'].includes(p?.status)) {
      const a = scoreValue(saved?.teamPoints), b = scoreValue(saved?.opponentPoints);
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
      feature.innerHTML = '<div class="loading">NBA official picks temporarily unavailable.</div>';
      history.innerHTML = '<tr><td colspan="6">Pick history unavailable.</td></tr>';
      count.textContent = 'UNAVAILABLE';
      summary.textContent = 'NBA pick record unavailable.';
      return;
    }
    const locked = ledger.picks.filter(p => p.locked === true)
      .sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const wins = locked.filter(p => p.status==='win').length;
    const losses = locked.filter(p => p.status==='loss').length;
    const pending = locked.filter(p => p.status==='pending').length;
    summary.textContent = 'NBA ONLY · '+wins+' wins · '+losses+' losses · '+pending+
      ' awaiting results. MLB and NFL records are unaffected.';
    count.textContent = locked.length+' LOCKED PICK'+(locked.length === 1?'':'S');
    if (!locked.length) {
      feature.innerHTML = '<div class="loading">No official NBA picks have been locked yet. Scheduled games are PICK PENDING until we choose a winner.</div>';
      history.innerHTML = '<tr><td colspan="6">No locked NBA picks yet.</td></tr>';
      return;
    }
    const p = locked[0], status = String(p.status||'pending').toLowerCase();
    const actual = officialFinal(p,schedule);
    feature.innerHTML = '<div class="picktop"><span class="labelcyan">🏀 OFFICIAL NBA SELECTION</span>'+
      '<span class="pickdate">'+safe(prettyDay(p.date))+' · '+safe(p.series||'NBA')+'</span></div>'+
      '<div class="pickbody"><span class="labelcyan">MONEYLINE WINNER</span>'+
      '<div class="picktitle">'+safe(p.team).toUpperCase()+'</div>'+
      '<div class="opp">VERSUS '+safe(p.opponent)+'</div>'+
      '<div class="pickchips"><span class="chip locked">❄ OFFICIALLY LOCKED</span>'+
      '<span class="chip '+statusClass(status)+'">'+safe(status.toUpperCase())+'</span>'+
      '<span class="chip">HYPOTHETICAL $'+safe(p.stake??1)+' UNIT</span></div>'+
      pregameCard(p)+(actual?finalCard(p.team,p.opponent,actual.team,actual.opponent):'')+
      '<p class="nfl-info">'+safe(p.analysis||'Locked before tipoff.')+'</p></div>'+
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
  function renderSlate(slate,ledger) {
    if (!slate || !Array.isArray(slate.games)) throw new Error('Invalid NBA slate');
    const today = pacificDay(new Date());
    dayLabel.textContent = prettyDay(today).toUpperCase()+' · DAILY RESET';
    if (slate.date !== today) {
      meta.textContent = 'TODAY\'S NBA SCHEDULE IS UPDATING';
      grid.innerHTML = '<div class="panel schedule-empty">The previous day’s NBA games have cleared. The current slate is awaiting its scheduled refresh; no picks are assumed.</div>';
      return;
    }
    const updated = new Date(slate.generatedAt);
    const stale = !validDate(updated) || Date.now()-updated.getTime()>26*3600000;
    meta.textContent = 'SOURCE: ESPN NBA SCOREBOARD'+
      (validDate(updated)?' · UPDATED '+new Intl.DateTimeFormat('en-US',{
        timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
      }).format(updated)+' PT':'')+(stale?' · FEED MAY BE OUTDATED':'');
    const games = slate.games.filter(g => {
      const date = new Date(g.dateUTC);
      return validDate(date) && pacificDay(date) === today;
    }).sort((a,b) => String(a.dateUTC).localeCompare(String(b.dateUTC)));
    if (!games.length) {
      grid.innerHTML = '<div class="panel schedule-empty">No NBA games are scheduled for today. The next daily slate will appear after midnight Pacific.</div>';
      return;
    }
    grid.innerHTML = games.map(g => {
      const state = String(g.status||'Scheduled');
      const pick = ledger?.picks?.find(p => p.locked===true && String(p.gameId)===String(g.id));
      let label='❄ PICK PENDING', cls='await-pick';
      if (isOff(state)) { label='CANCELED / POSTPONED — NO PENDING PICK';cls='off'; }
      else if (pick) { label='❄ OFFICIAL NBA PICK: '+pick.team+' ('+pick.status+')';cls='official'; }
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
        '<p class="nfl-slate-forecast">PREGAME POINTS FORECAST: '+safe(pick.team)+' '+
        forecast.team+' · '+safe(pick.opponent)+' '+forecast.opponent+
        ' · TOTAL '+forecast.total+' POINTS</p>' : '';
      return '<article class="schedule-game">'+
        '<div class="schedule-game-head"><span>NBA · '+safe(g.id)+'</span><span>'+
        safe(gameTime(g.dateUTC))+'</span></div>'+
        '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
        '<p class="schedule-game-state">'+safe(state)+'</p>'+live+
        '<div class="schedule-status '+cls+'">'+safe(label)+'</div>'+forecastHtml+final+
        '</article>';
    }).join('');
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy=true;
    try {
      const outcomes = await Promise.allSettled([
        readJson('nba-schedule.json'),readJson('nba-picks.json')
      ]);
      const ledger = outcomes[1].status==='fulfilled' ? outcomes[1].value : null;
      const slate = outcomes[0].status==='fulfilled' ? outcomes[0].value : null;
      renderOfficial(ledger,slate);
      if (!slate) throw new Error('NBA schedule unavailable');
      renderSlate(slate,ledger);
    } catch (error) {
      dayLabel.textContent = prettyDay(pacificDay(new Date())).toUpperCase();
      meta.textContent = 'NBA SCHEDULE TEMPORARILY UNAVAILABLE';
      grid.innerHTML = '<div class="panel schedule-empty">Could not verify today’s NBA games. '+
        '<a href="https://www.espn.com/nba/schedule" target="_blank" rel="noopener noreferrer">See ESPN NBA schedule ↗</a></div>';
    } finally { busy=false; }
  }
  refresh();
  window.addEventListener('hashchange',()=>{if(location.hash==='#basketball') refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && location.hash==='#basketball') refresh();});
  setInterval(()=>{if(location.hash==='#basketball')refresh();},60000);
})();
