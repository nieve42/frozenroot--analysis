/* Frozen Root Prediction System — verified MLB slate plus frozen automatic and official picks. */
(() => {
  'use strict';
  const box = document.getElementById('todayGames');
  if (!box) return;
  const dateLabel = document.getElementById('scheduleDate');
  const meta = document.getElementById('scheduleMeta');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localDate = () => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
    const part = name => parts.find(p => p.type === name)?.value || '';
    return part('year') + '-' + part('month') + '-' + part('day');
  };
  const cancelled = status => /cancel|postpon|suspend|no game/i.test(status || '');
  const finished = status => /final|completed|game over/i.test(status || '');
  const gameFromAPI = g => ({
    gamePk: g.gamePk,
    away: g.teams?.away?.team?.name || 'Away TBD',
    home: g.teams?.home?.team?.name || 'Home TBD',
    startUTC: g.gameDate || null,
    status: g.status?.detailedState || 'Scheduled',
    series: g.seriesDescription || '',
    gameType: g.gameType || '',
    gameNumber: g.seriesGameNumber || null,
    awayScore: g.teams?.away?.score ?? null,
    homeScore: g.teams?.home?.score ?? null
  });
  async function getSchedule(day) {
    // Prefer live MLB data; a final result need not wait for the next scheduled GitHub publication.
    let saved=null;
    try {
      const response=await fetch('./schedule.json?ts='+Date.now(),{cache:'no-store'});
      if(response.ok){
        const payload=await response.json();
        if(payload.date===day && Array.isArray(payload.games))saved=payload;
      }
    } catch (_) {}
    try {
      const endpoint='https://statsapi.mlb.com/api/v1/schedule?sportId=1&date='+encodeURIComponent(day);
      const response=await fetch(endpoint,{cache:'no-store'});
      if(!response.ok)throw Error('Live MLB schedule not available');
      const data=await response.json();
      if(!Array.isArray(data.dates))throw Error('Unexpected MLB schedule response');
      return {date:day,fetchedAt:new Date().toISOString(),source:'MLB Stats API (live)',
        games:data.dates.flatMap(d=>Array.isArray(d.games)?d.games.map(gameFromAPI):[])};
    } catch(error){
      if(saved)return saved;
      throw error;
    }
  }
  const gameTime = utc => {
    if (!utc) return 'TIME TBD';
    const d = new Date(utc);
    if (isNaN(d.getTime())) return 'TIME TBD';
    return new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles', hour:'numeric', minute:'2-digit', timeZoneName:'short'}).format(d);
  };
  function render(data, picks, autoPicks) {
    if (data.date !== localDate()) return;
    const today = localDate();
    dateLabel.textContent = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}).toUpperCase();
    const timestamp = data.fetchedAt ? new Date(data.fetchedAt) : null;
    meta.textContent = 'SCHEDULE SOURCE: MLB STATS API' + (timestamp && !isNaN(timestamp.getTime()) ? '  ·  Checked ' + timestamp.toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' PT' : '');
    if (!data.games.length) {
      box.innerHTML = '<div class="panel schedule-empty">No MLB games listed for today. No pending picks have been created.</div>';
      return;
    }
    const ordered = [...data.games].sort((a,b) => (a.startUTC || '').localeCompare(b.startUTC || ''));
    box.innerHTML = ordered.map(g => {
      const official = Array.isArray(picks) && picks.find(p => p.locked && p.date === today &&
        [p.team, p.opponent].every(n => [g.away, g.home].some(t => t.toLowerCase() === String(n).toLowerCase())));
      const auto = Array.isArray(autoPicks) && autoPicks.find(p => p.automated && String(p.gameId) === String(g.gamePk));
      const existing = official || auto;
      const off = cancelled(g.status);
      let badge = '❄ PICK PENDING', badgeClass = 'await-pick';
      if (off) { badge = 'GAME CANCELED / POSTPONED — NO PENDING PICK'; badgeClass='off'; }
      else if (existing) { badge=(auto && !official?'🤖 AUTOMATIC PREGAME PICK: ':existing.postStartLock?'◷ POST-START PICK LOCKED: ':'❄ OFFICIAL PICK LOCKED: ') + existing.team; badgeClass='official'; }
      else if (finished(g.status)) { badge='FINAL — NO OFFICIAL PICK'; badgeClass='final'; }
      else if (!Array.isArray(picks)) { badge='PICK STATUS UNAVAILABLE'; badgeClass='off'; }
      const label = safe(g.away) + ' <span class="game-versus">@</span> ' + safe(g.home);
      const series = g.series ? '<span>' + safe(g.series) + '</span>' : '';
      const projected = existing?.projectedScore;
      const valid = projected && Number.isInteger(projected.teamRuns) && Number.isInteger(projected.opponentRuns) &&
        projected.teamRuns >= 0 && projected.opponentRuns >= 0;
      const forecast = valid ?
        '<div class="mlb-slate-score" aria-label="Projected final score">' +
        '<div class="mlb-slate-score-heading">❄ PROJECTED FINAL SCORE <small>' + (existing.postStartLock?'POST-START · NOT PREGAME':'NOT THE ACTUAL RESULT') + '</small></div>' +
        '<div class="mlb-slate-score-matchup"><span>' + safe(existing.team) + '</span><strong>' +
        projected.teamRuns + ' – ' + projected.opponentRuns + '</strong><span>' +
        safe(existing.opponent) + '</span></div>' +
        '<div class="mlb-slate-score-total">PROJECTED TOTAL · ' + (projected.teamRuns + projected.opponentRuns) + ' RUNS</div></div>' : '';
      const final=finished(g.status) && !off;
      const hasScores=g.awayScore!=null && g.homeScore!=null &&
        Number.isInteger(Number(g.awayScore)) && Number.isInteger(Number(g.homeScore));
      let awayScore=hasScores?Number(g.awayScore):null;
      let homeScore=hasScores?Number(g.homeScore):null;
      if(final && !hasScores && existing && ['win','loss','push'].includes(existing.status) &&
        Number.isInteger(existing.actualScore?.teamRuns) && Number.isInteger(existing.actualScore?.opponentRuns)){
        const pickIsAway=String(g.away).toLowerCase()===String(existing.team).toLowerCase();
        awayScore=pickIsAway?existing.actualScore.teamRuns:existing.actualScore.opponentRuns;
        homeScore=pickIsAway?existing.actualScore.opponentRuns:existing.actualScore.teamRuns;
      }
      const winner=awayScore===homeScore?'TIE GAME':(awayScore>homeScore?g.away:g.home);
      const actual=final && awayScore!==null && homeScore!==null ?
        '<section class="actual-final" aria-label="Actual final score">'+
        '<div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>GAME COMPLETE</small></div>'+
        '<div class="actual-final-score"><span>'+safe(g.away)+'</span><strong>'+awayScore+' – '+homeScore+'</strong><span>'+safe(g.home)+'</span></div>'+
        '<div class="actual-final-winner">'+(winner==='TIE GAME'?'TIE GAME':'🏆 WINNER: '+safe(winner))+'</div></section>' : '';
      return '<article class="schedule-game">' +
        '<div class="schedule-game-head"><span>GAME ' + safe(g.gamePk || 'TBD') + '</span><span>' + safe(gameTime(g.startUTC)) + '</span></div>' +
        '<h3>' + label + '</h3><p class="schedule-game-state">' + safe(g.status) + (series ? ' · ' + series : '') + '</p>' +
        '<div class="schedule-status ' + badgeClass + '">' + safe(badge) + '</div>' + (existing && !existing.postStartLock ? '<div class="slate-reliability">'+window.FrozenRootReliability.badge(existing,'mlb',!!(auto && !official))+'</div>' : '') + forecast + actual + '</article>';
    }).join('');
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    const day = localDate();
    try {
      const results = await Promise.allSettled([
        getSchedule(day),
        fetch('./site.json?ts=' + Date.now(), {cache:'no-store'}).then(r => {if (!r.ok) throw Error('official picks not available');return r.json();}),
        fetch('./auto-mlb-picks.json?ts=' + Date.now(), {cache:'no-store'}).then(r => {if (!r.ok) throw Error('automatic picks not available');return r.json();})
      ]);
      if (results[0].status !== 'fulfilled') throw results[0].reason;
      const picks = results[1].status === 'fulfilled' && Array.isArray(results[1].value?.picks) ? results[1].value.picks : null;
      const autoPicks = results[2].status === 'fulfilled' && Array.isArray(results[2].value?.picks) ? results[2].value.picks : null;
      render(results[0].value, picks, autoPicks);
    } catch (_) {
      dateLabel.textContent = day;
      meta.textContent = 'Schedule could not be verified right now.';
      box.innerHTML = '<div class="panel schedule-empty">Today’s games are temporarily unavailable. Please check back soon; no predictions have been assumed.</div>';
    } finally { busy = false; }
  }
  refresh();
  setInterval(refresh, 15 * 60 * 1000);
  // Refresh an already-open page when the date changes at 12:01 AM Pacific.
  // Browser timers may be throttled in background tabs; visibilitychange covers that case.
  let watchedDay = localDate();
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Los_Angeles', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  });
  setInterval(() => {
    const day = localDate();
    if (day === watchedDay) return;
    const parts = clock.formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    if (hour * 60 + minute >= 1) {
      watchedDay = day;
      refresh();
    }
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      watchedDay = localDate();
      refresh();
    }
  });
})();