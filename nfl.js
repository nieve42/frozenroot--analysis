/* Frozen Root — dedicated NFL schedule. Never modifies MLB state or official picks. */
(() => {
  'use strict';
  const grid = document.getElementById('nflGames');
  if (!grid) return;
  const meta = document.getElementById('nflMeta');
  const dates = document.getElementById('nflDateRange');
  const summary = document.getElementById('nflPickSummary');
  const safe = text => String(text ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
  const pacificDay = date => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Los_Angeles', year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date);
    const val = k => parts.find(x => x.type===k)?.value || '';
    return [val('year'),val('month'),val('day')].join('-');
  };
  const nowDay = () => pacificDay(new Date());
  const shiftUTC = (day, offset) => {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0,10);
  };
  const currentWeek = () => {
    const today = nowDay();
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    const start = shiftUTC(today, -((weekday - 2 + 7) % 7));
    return {start, end:shiftUTC(start,6)};
  };
  const dateLabel = day => new Date(day + 'T12:00:00').toLocaleDateString('en-US', {
    weekday:'short',month:'short',day:'numeric'
  });
  const shortDay = day => new Date(day + 'T12:00:00').toLocaleDateString('en-US', {
    month:'short',day:'numeric'
  });
  const kickoff = utc => {
    if (!utc || isNaN(Date.parse(utc))) return 'TIME TBD';
    return new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Los_Angeles',weekday:'short',hour:'numeric',
      minute:'2-digit',timeZoneName:'short'
    }).format(new Date(utc));
  };
  const off = status => /cancel|postpon|suspend/i.test(status);
  const final = status => /final|complete/i.test(status);
  const live = status => /progress|half|quarter|end of/i.test(status);
  let loaded = false;
  async function reload() {
    if (loaded) return;
    loaded = true;
    try {
      const [slateResult,picksResult] = await Promise.allSettled([
        fetch('./nfl-schedule.json?ts=' + Date.now(),{cache:'no-store'}).then(r => {
          if (!r.ok) throw Error('No NFL schedule published');
          return r.json();
        }),
        fetch('./nfl-picks.json?ts=' + Date.now(),{cache:'no-store'}).then(r => {
          if (!r.ok) throw Error('No NFL picks published');
          return r.json();
        })
      ]);
      if (picksResult.status==='fulfilled' && Array.isArray(picksResult.value?.picks)) renderOfficial(picksResult.value.picks);
      else renderOfficial(null);
      if (slateResult.status !== 'fulfilled') throw slateResult.reason;
      const slate = slateResult.value;
      if (!Array.isArray(slate.games)) throw Error('Invalid NFL schedule');
      const picks = picksResult.status==='fulfilled' && Array.isArray(picksResult.value.picks)
        ? picksResult.value.picks : null;
      render(slate,picks);
    } catch(e) {
      meta.textContent = 'Football data not available yet.';
      grid.innerHTML = '<div class="panel schedule-empty">The NFL feed is not ready right now. No predictions have been assumed. <a href="https://www.espn.com/nfl/schedule" target="_blank" rel="noopener noreferrer">View the NFL schedule ↗</a></div>';
    } finally { loaded=false; }
  }
  function renderOfficial(picks) {
    const feature = document.getElementById('nflOfficialPick');
    const history = document.getElementById('nflHistoryRows');
    const count = document.getElementById('nflHistoryCount');
    if (!feature || !history || !count) return;
    if (!picks) {
      feature.innerHTML = '<div class="loading">Unable to verify official NFL picks.</div>';
      history.innerHTML = '<tr><td colspan="4">Football pick history is temporarily unavailable.</td></tr>';
      count.textContent = 'STATUS UNAVAILABLE';
      return;
    }
    const locked = picks.filter(p => p.locked===true).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    count.textContent = locked.length + ' LOCKED PICK' + (locked.length===1?'':'S');
    if (!locked.length) {
      feature.innerHTML = '<div class="loading">No official NFL picks have been locked yet.</div>';
      history.innerHTML = '<tr><td colspan="4">No locked football picks yet.</td></tr>';
      return;
    }
    const p=locked[0];
    const date=safe(dateLabel(p.date));
    const state=String(p.status||'pending').toLowerCase();
    const statusClass=['win','loss','pending','push','void'].includes(state)?state:'pending';
    feature.innerHTML =
      '<div class="picktop"><span class="labelcyan">🏈 ROOT’S OFFICIAL NFL SELECTION</span><span class="pickdate">'+date+' · '+safe(p.series||'NFL')+'</span></div>'+
      '<div class="pickbody"><span class="labelcyan">MONEYLINE WINNER</span><div class="picktitle">'+safe(p.team).toUpperCase()+'</div>'+
      '<div class="opp">VERSUS '+safe(p.opponent)+'</div>'+
      '<div class="pickchips"><span class="chip locked">❄ OFFICIALLY LOCKED</span><span class="chip '+statusClass+'">'+safe(state.toUpperCase())+'</span><span class="chip">HYPOTHETICAL 
    const today = nowDay();
    const week = currentWeek();
    const refreshed = slate.generatedAt ? new Date(slate.generatedAt) : null;
    const ageHours = refreshed && !isNaN(refreshed.getTime())
      ? (Date.now()-refreshed.getTime())/36e5 : Infinity;
    const wrongWeek = slate.startDate !== week.start || slate.endDate !== week.end;
    const stale = ageHours > 26;
    meta.textContent = 'SOURCE: ESPN NFL SCHEDULE' +
      (refreshed && !isNaN(refreshed.getTime()) ? ' · Last updated ' +
        refreshed.toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT' : '') +
      (stale ? ' · FEED MAY BE OUTDATED' : '');
    dates.textContent = shortDay(week.start).toUpperCase()+' – '+shortDay(week.end).toUpperCase()+' · RESETS TUESDAY';
    // Never display games from last week after the Tuesday rollover, even if
    // GitHub Actions has not yet finished its new-week refresh.
    if (wrongWeek) {
      meta.textContent = 'NEW NFL WEEK · Awaiting updated schedule';
      grid.innerHTML = '<div class="panel schedule-empty">Last week’s schedule has cleared. The new Tuesday–Monday NFL slate is updating; please check back shortly.</div>';
      return;
    }
    if (picks) {
      const locked = picks.filter(p => p.locked);
      const w=locked.filter(p=>p.status==='win').length, l=locked.filter(p=>p.status==='loss').length,
        pending=locked.filter(p=>p.status==='pending').length;
      summary.textContent = locked.length ? 'NFL ONLY · '+w+' wins · '+l+' losses · '+pending+' awaiting results. Does not affect the MLB record.' :
        'No official NFL picks locked yet. Future football picks and results will be tracked separately from MLB.';
    } else {
      summary.textContent = 'NFL official picks could not be verified. Football games listed here are not predictions.';
    }
    const weeklyGames = slate.games.filter(g => {
      if (!g.dateUTC || isNaN(Date.parse(g.dateUTC))) return false;
      const day=pacificDay(new Date(g.dateUTC));
      return day>=week.start && day<=week.end;
    }).sort((a,b)=>a.dateUTC.localeCompare(b.dateUTC));
    if (!weeklyGames.length) {
      grid.innerHTML='<div class="panel schedule-empty">No NFL games are currently listed for this Tuesday–Monday week.</div>';
      return;
    }
    // Keep completed games visible through Monday, then clear the entire week on Tuesday.
    const sections = new Map();
    weeklyGames.forEach(g => {
      const day=pacificDay(new Date(g.dateUTC));
      if (!sections.has(day)) sections.set(day,[]);
      sections.get(day).push(g);
    });
    let html='';
    for (const [day,games] of sections) {
      html+='<div class="nfl-day-heading">'+safe(dateLabel(day).toUpperCase())+(day===today?' · TODAY':'')+'</div>';
      for (const g of games) {
        const official = picks && picks.find(p => p.locked && String(p.gameId)===String(g.id));
        const status=String(g.status||'Scheduled');
        let badge = '❄ PICK PENDING', kind='await-pick';
        if(off(status)) {badge='CANCELED / POSTPONED — NO PENDING PICK';kind='off';}
        else if(official) {badge='❄ OFFICIAL NFL PICK: '+official.team+' ('+official.status+')';kind='official';}
        else if(final(status)) {badge='FINAL — NO OFFICIAL PICK';kind='final';}
        else if(live(status)) {badge='IN PROGRESS — NO OFFICIAL PICK';kind='final';}
        else if(!picks) {badge='PICK STATUS UNAVAILABLE';kind='off';}
        const score=final(status)||live(status) ?
          '<div class="football-score">'+safe(g.awayScore ?? '—')+' – '+safe(g.homeScore ?? '—')+'</div>' : '';
        html+='<article class="schedule-game">'+
          '<div class="schedule-game-head"><span>NFL · '+safe(g.id)+'</span><span>'+safe(kickoff(g.dateUTC))+'</span></div>'+
          '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
          '<p class="schedule-game-state">'+safe(status)+'</p>'+score+
          '<div class="schedule-status '+kind+'">'+safe(badge)+'</div></article>';
      }
    }
    grid.innerHTML=html;
  }
  reload();
  window.addEventListener('hashchange',()=>{if(location.hash==='#football') reload();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && location.hash==='#football') reload();});
  setInterval(()=>{if(location.hash==='#football') reload();},15*60*1000);
  let displayedWeek = currentWeek().start;
  // Already-open browser tabs must clear the previous slate after Tuesday 12:01 PT.
  // Timers may be throttled while the tab is backgrounded; visibilitychange retries.
  setInterval(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date());
    const hour = Number(parts.find(p=>p.type==='hour')?.value ?? '0');
    const minute = Number(parts.find(p=>p.type==='minute')?.value ?? '0');
    const weekStart = currentWeek().start;
    if (weekStart !== displayedWeek && hour*60+minute >= 1) {
      displayedWeek=weekStart;
      dates.textContent = 'NEW NFL WEEK';
      grid.innerHTML = '<div class="panel schedule-empty">Loading the new week’s football games...</div>';
      reload();
    }
  }, 30000);
})();+safe(p.stake ?? 1)+' UNIT</span></div>'+
      '<p class="nfl-info">'+safe(p.analysis||'Official selection locked before kickoff.')+'</p></div>'+
      '<div class="feature-note"><strong>RISK / PROCESS</strong><span>'+safe(p.risk||'Prediction, not a guaranteed result.')+'</span></div>';
    history.innerHTML=locked.map(entry=>{
      const status=String(entry.status||'pending').toLowerCase();
      const cls=['win','loss','pending','push','void'].includes(status)?status:'pending';
      return '<tr><td>'+safe(dateLabel(entry.date))+'</td><td><strong>'+safe(entry.team)+'</strong><small>OFFICIAL · LOCKED</small></td><td>'+safe(entry.opponent)+'</td><td><span class="status '+cls+'">'+safe(status.toUpperCase())+'</span></td></tr>';
    }).join('');
  }
  function render(slate,picks) {
    const today = nowDay();
    const week = currentWeek();
    const refreshed = slate.generatedAt ? new Date(slate.generatedAt) : null;
    const ageHours = refreshed && !isNaN(refreshed.getTime())
      ? (Date.now()-refreshed.getTime())/36e5 : Infinity;
    const wrongWeek = slate.startDate !== week.start || slate.endDate !== week.end;
    const stale = ageHours > 26;
    meta.textContent = 'SOURCE: ESPN NFL SCHEDULE' +
      (refreshed && !isNaN(refreshed.getTime()) ? ' · Last updated ' +
        refreshed.toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT' : '') +
      (stale ? ' · FEED MAY BE OUTDATED' : '');
    dates.textContent = shortDay(week.start).toUpperCase()+' – '+shortDay(week.end).toUpperCase()+' · RESETS TUESDAY';
    // Never display games from last week after the Tuesday rollover, even if
    // GitHub Actions has not yet finished its new-week refresh.
    if (wrongWeek) {
      meta.textContent = 'NEW NFL WEEK · Awaiting updated schedule';
      grid.innerHTML = '<div class="panel schedule-empty">Last week’s schedule has cleared. The new Tuesday–Monday NFL slate is updating; please check back shortly.</div>';
      return;
    }
    if (picks) {
      const locked = picks.filter(p => p.locked);
      const w=locked.filter(p=>p.status==='win').length, l=locked.filter(p=>p.status==='loss').length,
        pending=locked.filter(p=>p.status==='pending').length;
      summary.textContent = locked.length ? 'NFL ONLY · '+w+' wins · '+l+' losses · '+pending+' awaiting results. Does not affect the MLB record.' :
        'No official NFL picks locked yet. Future football picks and results will be tracked separately from MLB.';
    } else {
      summary.textContent = 'NFL official picks could not be verified. Football games listed here are not predictions.';
    }
    const weeklyGames = slate.games.filter(g => {
      if (!g.dateUTC || isNaN(Date.parse(g.dateUTC))) return false;
      const day=pacificDay(new Date(g.dateUTC));
      return day>=week.start && day<=week.end;
    }).sort((a,b)=>a.dateUTC.localeCompare(b.dateUTC));
    if (!weeklyGames.length) {
      grid.innerHTML='<div class="panel schedule-empty">No NFL games are currently listed for this Tuesday–Monday week.</div>';
      return;
    }
    // Keep completed games visible through Monday, then clear the entire week on Tuesday.
    const sections = new Map();
    weeklyGames.forEach(g => {
      const day=pacificDay(new Date(g.dateUTC));
      if (!sections.has(day)) sections.set(day,[]);
      sections.get(day).push(g);
    });
    let html='';
    for (const [day,games] of sections) {
      html+='<div class="nfl-day-heading">'+safe(dateLabel(day).toUpperCase())+(day===today?' · TODAY':'')+'</div>';
      for (const g of games) {
        const official = picks && picks.find(p => p.locked && String(p.gameId)===String(g.id));
        const status=String(g.status||'Scheduled');
        let badge = '❄ PICK PENDING', kind='await-pick';
        if(off(status)) {badge='CANCELED / POSTPONED — NO PENDING PICK';kind='off';}
        else if(official) {badge='❄ OFFICIAL NFL PICK: '+official.team+' ('+official.status+')';kind='official';}
        else if(final(status)) {badge='FINAL — NO OFFICIAL PICK';kind='final';}
        else if(live(status)) {badge='IN PROGRESS — NO OFFICIAL PICK';kind='final';}
        else if(!picks) {badge='PICK STATUS UNAVAILABLE';kind='off';}
        const score=final(status)||live(status) ?
          '<div class="football-score">'+safe(g.awayScore ?? '—')+' – '+safe(g.homeScore ?? '—')+'</div>' : '';
        html+='<article class="schedule-game">'+
          '<div class="schedule-game-head"><span>NFL · '+safe(g.id)+'</span><span>'+safe(kickoff(g.dateUTC))+'</span></div>'+
          '<h3>'+safe(g.away)+' <span class="game-versus">@</span> '+safe(g.home)+'</h3>'+
          '<p class="schedule-game-state">'+safe(status)+'</p>'+score+
          '<div class="schedule-status '+kind+'">'+safe(badge)+'</div></article>';
      }
    }
    grid.innerHTML=html;
  }
  reload();
  window.addEventListener('hashchange',()=>{if(location.hash==='#football') reload();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && location.hash==='#football') reload();});
  setInterval(()=>{if(location.hash==='#football') reload();},15*60*1000);
  let displayedWeek = currentWeek().start;
  // Already-open browser tabs must clear the previous slate after Tuesday 12:01 PT.
  // Timers may be throttled while the tab is backgrounded; visibilitychange retries.
  setInterval(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date());
    const hour = Number(parts.find(p=>p.type==='hour')?.value ?? '0');
    const minute = Number(parts.find(p=>p.type==='minute')?.value ?? '0');
    const weekStart = currentWeek().start;
    if (weekStart !== displayedWeek && hour*60+minute >= 1) {
      displayedWeek=weekStart;
      dates.textContent = 'NEW NFL WEEK';
      grid.innerHTML = '<div class="panel schedule-empty">Loading the new week’s football games...</div>';
      reload();
    }
  }, 30000);
})();