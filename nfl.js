/* Frozen Root — NFL game schedule and separate official NFL ledger. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const grid = byId('nflGames');
  if (!grid) return;
  const meta = byId('nflMeta');
  const range = byId('nflDateRange');
  const summary = byId('nflPickSummary');
  const feature = byId('nflOfficialPick');
  const history = byId('nflHistoryRows');
  const historyCount = byId('nflHistoryCount');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isValidDate = date => date instanceof Date && !Number.isNaN(date.getTime());
  const format = (utc, options) => new Intl.DateTimeFormat('en-US', options).format(utc);
  const pacificDay = date => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(date);
    const part = key => parts.find(x => x.type === key)?.value || '';
    return part('year')+'-'+part('month')+'-'+part('day');
  };
  const dayDate = day => new Date(day+'T12:00:00Z');
  const shiftDay = (day, n) => {
    const date = dayDate(day);
    date.setUTCDate(date.getUTCDate()+n);
    return date.toISOString().slice(0,10);
  };
  const thisWeek = () => {
    const today = pacificDay(new Date());
    const weekday = dayDate(today).getUTCDay();
    const start = shiftDay(today, -((weekday-2+7)%7));
    return {today, start, end:shiftDay(start,6)};
  };
  const labelDay = day => format(dayDate(day), {month:'short',day:'numeric',weekday:'short',timeZone:'UTC'});
  const shortDay = day => format(dayDate(day), {month:'short',day:'numeric',timeZone:'UTC'});
  const gameTime = utc => {
    const date = new Date(utc);
    return isValidDate(date) ? format(date,{timeZone:'America/Los_Angeles',weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'TIME TBD';
  };
  const isOff = status => /cancel|postpon|suspend/i.test(status);
  const isFinal = status => /final|complete|closed/i.test(status);
  const isLive = status => /progress|half|quarter|end of|halftime/i.test(status);
  const statusClass = status => ['win','loss','pending','void','push'].includes(status) ? status : 'pending';
  const readJson = async file => {
    const response = await fetch('./'+file+'?t='+Date.now(),{cache:'no-store'});
    if (!response.ok) throw new Error('Unable to fetch '+file+' ('+response.status+')');
    return response.json();
  };
  // Forecast is pregame only and never changes a locked moneyline pick or actual final score.
  function projectedPoints(p) {
    const s=p && p.projectedScore;
    if(!s || !Number.isInteger(s.teamPoints) || !Number.isInteger(s.opponentPoints) ||
      s.teamPoints<0 || s.opponentPoints<0) return null;
    return {teamPoints:s.teamPoints,opponentPoints:s.opponentPoints,totalPoints:s.teamPoints+s.opponentPoints};
  }
  function projectedPointsCard(p) {
    const s=projectedPoints(p);
    if(!s) return '<div class="run-projection missing"><div class="run-projection-heading"><span>🏈 PROJECTED FINAL SCORE</span><small>PREGAME FORECAST</small></div><p>Not recorded for this pick. Future locked NFL selections will include projected points for both teams.</p></div>';
    return '<div class="run-projection nfl-score-projection">'+
      '<div class="run-projection-heading"><span>🏈 PROJECTED FINAL SCORE</span><small>PREGAME FORECAST · NOT ACTUAL RESULTS</small></div>'+
      '<div class="run-projection-scores">'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.team)+'</span><strong>'+s.teamPoints+'</strong></div>'+
      '<div class="run-score-separator">–</div>'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.opponent)+'</span><strong>'+s.opponentPoints+'</strong></div>'+
      '<div class="run-total"><span>PROJECTED TOTAL POINTS</span><strong>'+s.totalPoints+'</strong></div>'+
      '</div></div>';
  }
  function projectedPointsHistory(p) {
    const s=projectedPoints(p);
    if (!s) return '<span class="projection-unavailable">Not recorded</span>';
    return '<strong class="projection-history-score">'+s.teamPoints+' – '+s.opponentPoints+'</strong>'+
      '<small>'+s.totalPoints+' total points · FORECAST</small>';
  }

  // Show actual scores only after a verified final, never replace the locked forecast.
  function nflFinalData(p,schedule) {
    const saved=p?.actualScore;
    if(['win','loss','push'].includes(p?.status) &&
      Number.isInteger(saved?.teamPoints) && Number.isInteger(saved?.opponentPoints) &&
      saved.teamPoints>=0 && saved.opponentPoints>=0)
      return {teamPoints:saved.teamPoints,opponentPoints:saved.opponentPoints};
    const game=schedule?.games?.find(g=>String(g.id)===String(p.gameId));
    if(!game || !isFinal(String(game.status||'')))return null;
    const away=game.awayScore,home=game.homeScore;
    const a=Number(away),b=Number(home);
    if(away==null||home==null||!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0)return null;
    if(String(p.team).toLowerCase()===String(game.away).toLowerCase() &&
       String(p.opponent).toLowerCase()===String(game.home).toLowerCase())
      return {teamPoints:a,opponentPoints:b};
    if(String(p.team).toLowerCase()===String(game.home).toLowerCase() &&
       String(p.opponent).toLowerCase()===String(game.away).toLowerCase())
      return {teamPoints:b,opponentPoints:a};
    return null;
  }
  function nflWinner(p,score){
    return score.teamPoints===score.opponentPoints?'TIE GAME':
      (score.teamPoints>score.opponentPoints?p.team:p.opponent);
  }
  function nflActualCard(p,schedule){
    const score=nflFinalData(p,schedule);
    if(!score)return '';
    const winner=nflWinner(p,score);
    return '<section class="actual-final" aria-label="Actual final score">'+
      '<div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>GAME COMPLETE</small></div>'+
      '<div class="actual-final-score"><span>'+safe(p.team)+'</span><strong>'+score.teamPoints+' – '+score.opponentPoints+'</strong><span>'+safe(p.opponent)+'</span></div>'+
      '<div class="actual-final-winner">'+(winner==='TIE GAME'?'TIE GAME':'🏆 WINNER: '+safe(winner))+'</div></section>';
  }
  function nflActualHistory(p,schedule){
    const score=nflFinalData(p,schedule);
    if(!score)return '<small class="actual-unavailable">'+(p.status==='void'?'Canceled / void':'Not final')+'</small>';
    return '<strong class="actual-history-score">'+score.teamPoints+' – '+score.opponentPoints+'</strong>'+
      '<small class="actual-history-winner">'+(score.teamPoints===score.opponentPoints?'TIE GAME':'WINNER: '+safe(nflWinner(p,score)))+'</small>';
  }

  function renderOfficial(data,schedule) {
    if (!feature || !history || !historyCount) return;
    if (!data || !Array.isArray(data.picks)) {
      feature.innerHTML = '<div class="loading">Official NFL pick data temporarily unavailable.</div>';
      history.innerHTML = '<tr><td colspan="6">Unable to load pick history.</td></tr>';
      historyCount.textContent = 'UNAVAILABLE';
      if (summary) summary.textContent = 'Official NFL record temporarily unavailable.';
      return;
    }
    const locked = data.picks.filter(p => p.locked === true)
      .map(p => ({...p,...window.FrozenRootSportResult.get(p,schedule,'Points')}))
      .sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const season=window.FrozenRootSeason.current('nfl');
    const currentLocked=locked.filter(p=>window.FrozenRootSeason.matches('nfl',p.date));
    const wins=currentLocked.filter(p=>p.status==='win').length;
    const losses=currentLocked.filter(p=>p.status==='loss').length;
    const pending=currentLocked.filter(p=>p.status==='pending').length;
    if (summary) summary.textContent = 'NFL '+season.label+' SEASON · '+wins+' wins · '+losses+' losses · '+pending+
      ' awaiting results. Separate from the MLB record.';
    historyCount.textContent = locked.length+' LOCKED PICK'+(locked.length===1?'':'S');
    if (!locked.length) {
      feature.innerHTML = '<div class="loading">No official NFL picks have been locked yet.</div>';
      history.innerHTML = '<tr><td colspan="6">No locked football picks yet.</td></tr>';
      return;
    }
    const p = locked[0];
    const status = String(p.status||'pending').toLowerCase();
    feature.innerHTML =
      '<div class="picktop"><span class="labelcyan">🏈 OFFICIAL NFL SELECTION</span>'+
      '<span class="pickdate">'+safe(labelDay(p.date))+' · '+safe(p.series||'NFL')+'</span></div>'+
      '<div class="pickbody"><span class="labelcyan">MONEYLINE WINNER</span>'+
      '<div class="picktitle">'+safe(p.team).toUpperCase()+'</div>'+
      '<div class="opp">VERSUS '+safe(p.opponent)+'</div>'+
      '<div class="pickchips"><span class="chip locked">❄ OFFICIALLY LOCKED</span>'+
      '<span class="chip '+statusClass(status)+'">'+safe(status.toUpperCase())+'</span>'+
      '<span class="chip">HYPOTHETICAL 
      projectedPointsCard(p)+nflActualCard(p,schedule)+
      '<p class="nfl-info">'+safe(p.analysis||'Official selection locked before kickoff.')+'</p></div>'+
      '<div class="feature-note"><strong>RISK / PROCESS</strong><span>'+
      safe(p.risk||'Prediction, not a guaranteed result.')+'</span></div>';
    history.innerHTML = locked.map(pick => {
      const outcome = String(pick.status||'pending').toLowerCase();
      return '<tr><td>'+safe(labelDay(pick.date))+'</td>'+
        '<td><strong>'+safe(pick.team)+'</strong><small>OFFICIAL · LOCKED</small></td>'+
        '<td>'+safe(pick.opponent)+'</td>'+
        '<td>'+projectedPointsHistory(pick)+'</td>'+ 
        '<td>'+nflActualHistory(pick,schedule)+'</td>'+
        '<td><span class="status '+statusClass(outcome)+'">'+safe(outcome.toUpperCase())+
        '</span></td></tr>';
    }).join('');
  }
  function renderSchedule(data, picks, autos) {
    if (!data || !Array.isArray(data.games)) throw new Error('Invalid schedule data');
    const week = thisWeek();
    range.textContent = shortDay(week.start).toUpperCase()+' – '+shortDay(week.end).toUpperCase()+' · RESETS TUESDAY';
    if (data.startDate !== week.start || data.endDate !== week.end) {
      meta.textContent = 'New NFL week · awaiting schedule refresh';
      grid.innerHTML = '<div class="panel schedule-empty">The old week has cleared. This week’s schedule is updating; please check back shortly.</div>';
      return;
    }
    const updated = data.generatedAt ? new Date(data.generatedAt) : null;
    const stale = !isValidDate(updated) || Date.now()-updated.getTime()>26*3600000;
    meta.textContent = 'SOURCE: ESPN NFL SCHEDULE'+
      (isValidDate(updated) ? ' · Updated '+format(updated,{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT' : '')+
      (stale ? ' · FEED MAY BE OUTDATED' : '');
    const games = data.games.filter(g => {
      const date = new Date(g.dateUTC);
      if (!isValidDate(date)) return false;
      const gameDay = pacificDay(date);
      return gameDay >= week.start && gameDay <= week.end;
    }).sort((a,b)=>String(a.dateUTC).localeCompare(String(b.dateUTC)));
    if (!games.length) {
      grid.innerHTML = '<div class="panel schedule-empty">No NFL games listed for this Tuesday–Monday week.</div>';
      return;
    }
    const grouped = new Map();
    for (const game of games) {
      const day = pacificDay(new Date(game.dateUTC));
      if (!grouped.has(day)) grouped.set(day,[]);
      grouped.get(day).push(game);
    }
    let html = '';
    for (const [day, items] of grouped) {
      html += '<div class="nfl-day-heading">'+safe(labelDay(day).toUpperCase())+(day===week.today?' · TODAY':'')+'</div>';
      for (const g of items) {
        const official = Array.isArray(picks) && picks.find(p => p.locked===true && String(p.gameId)===String(g.id));
        const automatic = !official && Array.isArray(autos) && autos.find(p => p.automated===true && String(p.gameId)===String(g.id));
        const state = String(g.status||'Scheduled');
        let badge='❄ PICK PENDING', kind='await-pick';
        if (isOff(state)) {badge='CANCELED / POSTPONED — NO PENDING PICK';kind='off';}
        else if (official) {badge='❄ OFFICIAL NFL PICK: '+official.team+' ('+window.FrozenRootSportResult.get(official,data,'Points').status.toUpperCase()+')';kind='official';}
        else if (automatic) {
          const result=window.FrozenRootSportResult.get(automatic,data,'Points').status.toUpperCase();
          badge='🤖 '+(result==='PENDING'?'UPCOMING · ':'')+'AUTOMATIC NFL PICK: '+automatic.team+' ('+result+')';
          kind='automated';
        }
        else if (isFinal(state)) {badge='FINAL — NO OFFICIAL PICK';kind='final';}
        else if (isLive(state)) {badge='IN PROGRESS — NO OFFICIAL PICK';kind='final';}
        else if (!Array.isArray(picks)) {badge='PICK STATUS UNAVAILABLE';kind='off';}
        const hasFinalScores=isFinal(state) && g.awayScore!=null && g.homeScore!=null &&
          Number.isInteger(Number(g.awayScore)) && Number.isInteger(Number(g.homeScore));
        const a=Number(g.awayScore),b=Number(g.homeScore);
        const winner=a===b?'TIE GAME':(a>b?g.away:g.home);
        const finalCard=hasFinalScores ?
          '<section class="actual-final" aria-label="Actual final score">'+
          '<div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>GAME COMPLETE</small></div>'+
          '<div class="actual-final-score"><span>'+safe(g.away)+'</span><strong>'+a+' – '+b+'</strong><span>'+safe(g.home)+'</span></div>'+
          '<div class="actual-final-winner">'+(winner==='TIE GAME'?'TIE GAME':'🏆 WINNER: '+safe(winner))+'</div></section>' : '';
        const liveScore=!isFinal(state) && isLive(state) && g.awayScore!=null && g.homeScore!=null ?
          '<div class="football-score">LIVE SCORE: '+safe(g.away)+' '+safe(g.awayScore)+' – '+safe(g.homeScore)+' '+safe(g.home)+'</div>' : '';
        const forecastPick = official || automatic;
        const projected = forecastPick ? projectedPoints(forecastPick) : null;
        const forecast = projected ?
          '<p class="nfl-slate-forecast">PREGAME POINTS FORECAST: '+
          safe(forecastPick.team)+' '+projected.teamPoints+' · '+safe(forecastPick.opponent)+' '+projected.opponentPoints+
          ' · TOTAL '+projected.totalPoints+' POINTS</p>' : '';
        html += '<article class="schedule-game">'+
          '<div class="schedule-game-head"><span>NFL · '+safe(g.id)+'</span><span>'+safe(gameTime(g.dateUTC))+'</span></div>'+
          '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
          '<p class="schedule-game-state">'+safe(state)+(state==='Scheduled'?' · NOT PLAYED YET':'')+'</p>'+liveScore+
          '<div class="schedule-status '+kind+'">'+safe(badge)+'</div>'+(forecastPick?'<div class="slate-reliability">'+window.FrozenRootReliability.badge(forecastPick,'nfl',!!automatic)+'</div>':'')+forecast+finalCard+'</article>';
      }
    }
    grid.innerHTML = html;
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const results = await Promise.allSettled([readJson('nfl-schedule.json'),readJson('nfl-picks.json'),readJson('auto-nfl-picks.json')]);
      const picksData = results[1].status==='fulfilled' ? results[1].value : null;
      renderOfficial(picksData,results[0].status==='fulfilled'?results[0].value:null);
      if (results[0].status==='rejected') throw results[0].reason;
      renderSchedule(results[0].value, Array.isArray(picksData?.picks)?picksData.picks:null, results[2].status==='fulfilled' ? results[2].value?.picks : null);
    } catch (error) {
      meta.textContent = 'NFL schedule is temporarily unavailable';
      grid.innerHTML = '<div class="panel schedule-empty">Could not load the schedule right now. <a href="https://www.espn.com/nfl/schedule" target="_blank" rel="noopener noreferrer">See NFL schedule ↗</a></div>';
    } finally {
      busy = false;
    }
  }
  refresh();
  window.addEventListener('hashchange', () => {if (location.hash==='#football') refresh();});
  document.addEventListener('visibilitychange', () => {if (!document.hidden && location.hash==='#football') refresh();});
  setInterval(() => {if (location.hash==='#football') refresh();}, 60*1000);
})();+safe(p.stake??1)+' UNIT</span>'+window.FrozenRootReliability.badge(p,'nfl',false)+'</div>'+
      projectedPointsCard(p)+nflActualCard(p,schedule)+
      '<p class="nfl-info">'+safe(p.analysis||'Official selection locked before kickoff.')+'</p></div>'+
      '<div class="feature-note"><strong>RISK / PROCESS</strong><span>'+
      safe(p.risk||'Prediction, not a guaranteed result.')+'</span></div>';
    history.innerHTML = locked.map(pick => {
      const outcome = String(pick.status||'pending').toLowerCase();
      return '<tr><td>'+safe(labelDay(pick.date))+'</td>'+
        '<td><strong>'+safe(pick.team)+'</strong><small>OFFICIAL · LOCKED</small></td>'+
        '<td>'+safe(pick.opponent)+'</td>'+
        '<td>'+projectedPointsHistory(pick)+'</td>'+ 
        '<td>'+nflActualHistory(pick,schedule)+'</td>'+
        '<td><span class="status '+statusClass(outcome)+'">'+safe(outcome.toUpperCase())+
        '</span></td></tr>';
    }).join('');
  }
  function renderSchedule(data, picks, autos) {
    if (!data || !Array.isArray(data.games)) throw new Error('Invalid schedule data');
    const week = thisWeek();
    range.textContent = shortDay(week.start).toUpperCase()+' – '+shortDay(week.end).toUpperCase()+' · RESETS TUESDAY';
    if (data.startDate !== week.start || data.endDate !== week.end) {
      meta.textContent = 'New NFL week · awaiting schedule refresh';
      grid.innerHTML = '<div class="panel schedule-empty">The old week has cleared. This week’s schedule is updating; please check back shortly.</div>';
      return;
    }
    const updated = data.generatedAt ? new Date(data.generatedAt) : null;
    const stale = !isValidDate(updated) || Date.now()-updated.getTime()>26*3600000;
    meta.textContent = 'SOURCE: ESPN NFL SCHEDULE'+
      (isValidDate(updated) ? ' · Updated '+format(updated,{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT' : '')+
      (stale ? ' · FEED MAY BE OUTDATED' : '');
    const games = data.games.filter(g => {
      const date = new Date(g.dateUTC);
      if (!isValidDate(date)) return false;
      const gameDay = pacificDay(date);
      return gameDay >= week.start && gameDay <= week.end;
    }).sort((a,b)=>String(a.dateUTC).localeCompare(String(b.dateUTC)));
    if (!games.length) {
      grid.innerHTML = '<div class="panel schedule-empty">No NFL games listed for this Tuesday–Monday week.</div>';
      return;
    }
    const grouped = new Map();
    for (const game of games) {
      const day = pacificDay(new Date(game.dateUTC));
      if (!grouped.has(day)) grouped.set(day,[]);
      grouped.get(day).push(game);
    }
    let html = '';
    for (const [day, items] of grouped) {
      html += '<div class="nfl-day-heading">'+safe(labelDay(day).toUpperCase())+(day===week.today?' · TODAY':'')+'</div>';
      for (const g of items) {
        const official = Array.isArray(picks) && picks.find(p => p.locked===true && String(p.gameId)===String(g.id));
        const automatic = !official && Array.isArray(autos) && autos.find(p => p.automated===true && String(p.gameId)===String(g.id));
        const state = String(g.status||'Scheduled');
        let badge='❄ PICK PENDING', kind='await-pick';
        if (isOff(state)) {badge='CANCELED / POSTPONED — NO PENDING PICK';kind='off';}
        else if (official) {badge='❄ OFFICIAL NFL PICK: '+official.team+' ('+window.FrozenRootSportResult.get(official,data,'Points').status.toUpperCase()+')';kind='official';}
        else if (automatic) {
          const result=window.FrozenRootSportResult.get(automatic,data,'Points').status.toUpperCase();
          badge='🤖 '+(result==='PENDING'?'UPCOMING · ':'')+'AUTOMATIC NFL PICK: '+automatic.team+' ('+result+')';
          kind='automated';
        }
        else if (isFinal(state)) {badge='FINAL — NO OFFICIAL PICK';kind='final';}
        else if (isLive(state)) {badge='IN PROGRESS — NO OFFICIAL PICK';kind='final';}
        else if (!Array.isArray(picks)) {badge='PICK STATUS UNAVAILABLE';kind='off';}
        const hasFinalScores=isFinal(state) && g.awayScore!=null && g.homeScore!=null &&
          Number.isInteger(Number(g.awayScore)) && Number.isInteger(Number(g.homeScore));
        const a=Number(g.awayScore),b=Number(g.homeScore);
        const winner=a===b?'TIE GAME':(a>b?g.away:g.home);
        const finalCard=hasFinalScores ?
          '<section class="actual-final" aria-label="Actual final score">'+
          '<div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>GAME COMPLETE</small></div>'+
          '<div class="actual-final-score"><span>'+safe(g.away)+'</span><strong>'+a+' – '+b+'</strong><span>'+safe(g.home)+'</span></div>'+
          '<div class="actual-final-winner">'+(winner==='TIE GAME'?'TIE GAME':'🏆 WINNER: '+safe(winner))+'</div></section>' : '';
        const liveScore=!isFinal(state) && isLive(state) && g.awayScore!=null && g.homeScore!=null ?
          '<div class="football-score">LIVE SCORE: '+safe(g.away)+' '+safe(g.awayScore)+' – '+safe(g.homeScore)+' '+safe(g.home)+'</div>' : '';
        const forecastPick = official || automatic;
        const projected = forecastPick ? projectedPoints(forecastPick) : null;
        const forecast = projected ?
          '<p class="nfl-slate-forecast">PREGAME POINTS FORECAST: '+
          safe(forecastPick.team)+' '+projected.teamPoints+' · '+safe(forecastPick.opponent)+' '+projected.opponentPoints+
          ' · TOTAL '+projected.totalPoints+' POINTS</p>' : '';
        html += '<article class="schedule-game">'+
          '<div class="schedule-game-head"><span>NFL · '+safe(g.id)+'</span><span>'+safe(gameTime(g.dateUTC))+'</span></div>'+
          '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
          '<p class="schedule-game-state">'+safe(state)+(state==='Scheduled'?' · NOT PLAYED YET':'')+'</p>'+liveScore+
          '<div class="schedule-status '+kind+'">'+safe(badge)+'</div>'+forecast+finalCard+'</article>';
      }
    }
    grid.innerHTML = html;
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const results = await Promise.allSettled([readJson('nfl-schedule.json'),readJson('nfl-picks.json'),readJson('auto-nfl-picks.json')]);
      const picksData = results[1].status==='fulfilled' ? results[1].value : null;
      renderOfficial(picksData,results[0].status==='fulfilled'?results[0].value:null);
      if (results[0].status==='rejected') throw results[0].reason;
      renderSchedule(results[0].value, Array.isArray(picksData?.picks)?picksData.picks:null, results[2].status==='fulfilled' ? results[2].value?.picks : null);
    } catch (error) {
      meta.textContent = 'NFL schedule is temporarily unavailable';
      grid.innerHTML = '<div class="panel schedule-empty">Could not load the schedule right now. <a href="https://www.espn.com/nfl/schedule" target="_blank" rel="noopener noreferrer">See NFL schedule ↗</a></div>';
    } finally {
      busy = false;
    }
  }
  refresh();
  window.addEventListener('hashchange', () => {if (location.hash==='#football') refresh();});
  document.addEventListener('visibilitychange', () => {if (!document.hidden && location.hash==='#football') refresh();});
  setInterval(() => {if (location.hash==='#football') refresh();}, 60*1000);
})();