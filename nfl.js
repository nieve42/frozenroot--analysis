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
  function renderOfficial(data) {
    if (!feature || !history || !historyCount) return;
    if (!data || !Array.isArray(data.picks)) {
      feature.innerHTML = '<div class="loading">Official NFL pick data temporarily unavailable.</div>';
      history.innerHTML = '<tr><td colspan="4">Unable to load pick history.</td></tr>';
      historyCount.textContent = 'UNAVAILABLE';
      if (summary) summary.textContent = 'Official NFL record temporarily unavailable.';
      return;
    }
    const locked = data.picks.filter(p => p.locked === true)
      .sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const wins = locked.filter(p => p.status === 'win').length;
    const losses = locked.filter(p => p.status === 'loss').length;
    const pending = locked.filter(p => p.status === 'pending').length;
    if (summary) summary.textContent = 'NFL ONLY · '+wins+' wins · '+losses+' losses · '+pending+
      ' awaiting results. Separate from the MLB record.';
    historyCount.textContent = locked.length+' LOCKED PICK'+(locked.length===1?'':'S');
    if (!locked.length) {
      feature.innerHTML = '<div class="loading">No official NFL picks have been locked yet.</div>';
      history.innerHTML = '<tr><td colspan="4">No locked football picks yet.</td></tr>';
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
      '<span class="chip">HYPOTHETICAL $'+safe(p.stake??1)+' UNIT</span></div>'+
      '<p class="nfl-info">'+safe(p.analysis||'Official selection locked before kickoff.')+'</p></div>'+
      '<div class="feature-note"><strong>RISK / PROCESS</strong><span>'+
      safe(p.risk||'Prediction, not a guaranteed result.')+'</span></div>';
    history.innerHTML = locked.map(pick => {
      const outcome = String(pick.status||'pending').toLowerCase();
      return '<tr><td>'+safe(labelDay(pick.date))+'</td>'+
        '<td><strong>'+safe(pick.team)+'</strong><small>OFFICIAL · LOCKED</small></td>'+
        '<td>'+safe(pick.opponent)+'</td>'+
        '<td><span class="status '+statusClass(outcome)+'">'+safe(outcome.toUpperCase())+
        '</span></td></tr>';
    }).join('');
  }
  function renderSchedule(data, picks) {
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
        const state = String(g.status||'Scheduled');
        let badge='❄ PICK PENDING', kind='await-pick';
        if (isOff(state)) {badge='CANCELED / POSTPONED — NO PENDING PICK';kind='off';}
        else if (official) {badge='❄ OFFICIAL NFL PICK: '+official.team+' ('+official.status+')';kind='official';}
        else if (isFinal(state)) {badge='FINAL — NO OFFICIAL PICK';kind='final';}
        else if (isLive(state)) {badge='IN PROGRESS — NO OFFICIAL PICK';kind='final';}
        else if (!Array.isArray(picks)) {badge='PICK STATUS UNAVAILABLE';kind='off';}
        const score = (isFinal(state)||isLive(state)) && g.awayScore!=null && g.homeScore!=null ?
          '<div class="football-score">'+safe(g.awayScore)+' – '+safe(g.homeScore)+'</div>' : '';
        html += '<article class="schedule-game">'+
          '<div class="schedule-game-head"><span>NFL · '+safe(g.id)+'</span><span>'+safe(gameTime(g.dateUTC))+'</span></div>'+
          '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
          '<p class="schedule-game-state">'+safe(state)+'</p>'+score+
          '<div class="schedule-status '+kind+'">'+safe(badge)+'</div></article>';
      }
    }
    grid.innerHTML = html;
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const results = await Promise.allSettled([readJson('nfl-schedule.json'),readJson('nfl-picks.json')]);
      const picksData = results[1].status==='fulfilled' ? results[1].value : null;
      renderOfficial(picksData);
      if (results[0].status==='rejected') throw results[0].reason;
      renderSchedule(results[0].value, Array.isArray(picksData?.picks)?picksData.picks:null);
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