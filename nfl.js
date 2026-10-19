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
  const dateLabel = day => new Date(day + 'T12:00:00').toLocaleDateString('en-US', {
    weekday:'short',month:'short',day:'numeric'
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
  function render(slate,picks) {
    const today = nowDay();
    const refreshed = slate.generatedAt ? new Date(slate.generatedAt) : null;
    const ageHours = refreshed && !isNaN(refreshed.getTime())
      ? (Date.now()-refreshed.getTime())/36e5 : Infinity;
    const stale = ageHours > 26 || slate.startDate !== today;
    meta.textContent = 'SOURCE: ESPN NFL SCHEDULE' +
      (refreshed && !isNaN(refreshed.getTime()) ? ' · Last updated ' +
        refreshed.toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT' : '') +
      (stale ? ' · SCHEDULE MAY BE OUTDATED' : '');
    dates.textContent = 'NEXT 7 DAYS';
    if (picks) {
      const locked = picks.filter(p => p.locked);
      const w=locked.filter(p=>p.status==='win').length, l=locked.filter(p=>p.status==='loss').length,
        pending=locked.filter(p=>p.status==='pending').length;
      summary.textContent = locked.length ? 'NFL ONLY · '+w+' wins · '+l+' losses · '+pending+' awaiting results. Does not affect the MLB record.' :
        'No official NFL picks locked yet. Future football picks and results will be tracked separately from MLB.';
    } else {
      summary.textContent = 'NFL official picks could not be verified. Football games listed here are not predictions.';
    }
    const future = slate.games.filter(g => {
      if (!g.dateUTC || isNaN(Date.parse(g.dateUTC))) return false;
      const day=pacificDay(new Date(g.dateUTC));
      return day>=today && day<=slate.endDate;
    }).sort((a,b)=>a.dateUTC.localeCompare(b.dateUTC));
    if (!future.length) {
      grid.innerHTML='<div class="panel schedule-empty">No NFL games currently listed for the upcoming week. Check back for new matchups.</div>';
      return;
    }
    const sections = new Map();
    future.forEach(g => {
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
})();