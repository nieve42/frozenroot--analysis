/* Frozen Root: display independently generated, frozen statistical forecasts.
   These are NOT the individually reviewed Root + user official pick ledger. */
(() => {
  'use strict';
  const specs = [
    {sport:'nfl', label:'NFL', page:'football', unit:'POINTS', field:'Points', icon:'🏈'},
    {sport:'nba', label:'NBA', page:'basketball', unit:'POINTS', field:'Points', icon:'🏀'},
    {sport:'nhl', label:'NHL', page:'hockey', unit:'GOALS', field:'Goals', icon:'🏒'}
  ];
  const byId = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day = date => {
    const x = new Date(String(date)+'T12:00:00Z');
    return Number.isFinite(x.valueOf())
      ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(x)
      : String(date||'');
  };
  const valid = x => Number.isInteger(x) && x>=0;
  function score(p,field,property){
    const s=p?.[property||'projectedScore'];
    const a=s?.['team'+field], b=s?.['opponent'+field];
    return valid(a)&&valid(b)?{team:a,opponent:b,total:a+b}:null;
  }
  function status(p) {
    const s=String(p.status||'pending').toLowerCase();
    return ['win','loss','pending','void','push'].includes(s)?s:'pending';
  }
  function latestCard(s,p){
    if(!p)return '<div class="loading">No automatic '+s.label+' picks have been published yet. The next scheduled update will make pregame forecasts for eligible games.</div>';
    const predicted=score(p,s.field);
    const actual=score(p,s.field,'actualScore');
    const projected=predicted?
      '<section class="run-projection"><div class="run-projection-heading"><span>'+s.icon+' PROJECTED FINAL SCORE</span><small>AUTOMATIC PREGAME FORECAST</small></div>'+
      '<div class="run-projection-scores">'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.team)+'</span><strong>'+predicted.team+'</strong></div>'+
      '<div class="run-score-separator">–</div>'+
      '<div class="run-team"><span class="run-team-name">'+safe(p.opponent)+'</span><strong>'+predicted.opponent+'</strong></div>'+
      '<div class="run-total"><span>TOTAL '+s.unit+'</span><strong>'+predicted.total+'</strong></div></div></section>' : '';
    const final=actual?
      '<section class="actual-final"><div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>VERIFIED RESULT</small></div>'+
      '<div class="actual-final-score"><span>'+safe(p.team)+'</span><strong>'+actual.team+' – '+actual.opponent+'</strong><span>'+safe(p.opponent)+'</span></div>'+
      '<div class="actual-final-winner">🏆 WINNER: '+safe(actual.team>actual.opponent?p.team:actual.team<actual.opponent?p.opponent:'TIE')+'</div></section>' : '';
    return '<div class="picktop"><span class="labelcyan">🤖 AUTO MODEL FORECAST · '+s.label+'</span>'+
      '<span class="pickdate">'+safe(day(p.date))+'</span></div>'+
      '<div class="pickbody"><span class="labelcyan">AUTOMATIC WINNER PICK</span>'+
      '<div class="picktitle">'+safe(p.team).toUpperCase()+'</div>'+
      '<div class="opp">VERSUS '+safe(p.opponent)+'</div>'+
      '<div class="pickchips"><span class="chip locked">❄ FROZEN PREGAME</span>'+
      '<span class="chip '+status(p)+'">'+safe(status(p).toUpperCase())+'</span>'+
      '<span class="chip">STATISTICAL MODEL · NOT CHATGPT</span>'+window.FrozenRootReliability.badge(p,s.sport,true)+'</div>'+
      projected+final+
      '<p class="nfl-info">'+safe(p.analysis||'Automatically calculated from verified previous game scores.')+'</p></div>'+
      '<div class="feature-note"><strong>MODEL NOTE</strong><span>'+safe(p.risk||'Estimated scores are uncertain and not betting advice.')+'</span></div>';
  }
  function historyRows(s,arr) {
    if(!arr.length)return '<tr><td colspan="6">No automatic pregame predictions have been published yet.</td></tr>';
    return arr.slice(0,40).map(p=>{
      const projected=score(p,s.field),actual=score(p,s.field,'actualScore');
      const predictedText=projected?
        '<strong class="projection-history-score">'+projected.team+' – '+projected.opponent+'</strong>'+
        '<small>'+projected.total+' total '+s.unit.toLowerCase()+' · FORECAST</small>':
        '<small class="actual-unavailable">Not recorded</small>';
      const actualText=actual?
        '<strong class="actual-history-score">'+actual.team+' – '+actual.opponent+'</strong>'+
        '<small class="actual-history-winner">WINNER: '+safe(actual.team>actual.opponent?p.team:actual.team<actual.opponent?p.opponent:'TIE')+'</small>':
        '<small class="actual-unavailable">'+(status(p)==='void'?'Canceled/void':'Not final')+'</small>';
      return '<tr><td>'+safe(day(p.date))+'</td><td><strong>'+safe(p.team)+'</strong>'+
        '<small>AUTO · FROZEN</small></td><td>'+safe(p.opponent)+'</td>'+
        '<td>'+predictedText+'</td><td>'+actualText+'</td>'+
        '<td><span class="status '+status(p)+'">'+safe(status(p).toUpperCase())+'</span></td></tr>';
    }).join('');
  }
  let busy={};
  async function refresh(s){
    const summary=byId(s.sport+'AutoSummary'),feature=byId(s.sport+'AutoLatest'),
          history=byId(s.sport+'AutoHistoryRows'),count=byId(s.sport+'AutoHistoryCount');
    const recordWins=byId(s.sport+'AutoRecordWins');
    const recordLosses=byId(s.sport+'AutoRecordLosses');
    const recordAccuracy=byId(s.sport+'AutoRecordAccuracy');
    const recordNote=byId(s.sport+'AutoRecordNote');
    if(!summary||!feature||!history||!count||busy[s.sport])return;
    busy[s.sport]=true;
    try {
      const results = await Promise.allSettled([
        fetch('./auto-'+s.sport+'-picks.json?t='+Date.now(),{cache:'no-store'}).then(r=>{
          if(!r.ok)throw Error('Automatic forecast unavailable');
          return r.json();
        }),
        fetch('./'+s.sport+'-schedule.json?t='+Date.now(),{cache:'no-store'}).then(r=>{
          if(!r.ok)throw Error('Schedule unavailable');
          return r.json();
        })
      ]);
      if(results[0].status!=='fulfilled')throw Error('Automatic forecasts not available');
      const data=results[0].value;
      const schedule=results[1].status==='fulfilled'?results[1].value:null;
      if(!Array.isArray(data.picks))throw Error('Unexpected prediction data');
      // Show a confirmed final result immediately if the new schedule has it,
      // even before the hourly workflow persists the pick's WIN or LOSS.
      const ordered=data.picks.map(p => ({
        ...p,...window.FrozenRootSportResult.get(p,schedule,s.field)
      })).sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date)));
      const activeSeason=window.FrozenRootSeason.current(s.sport);
      const activePicks=ordered.filter(p=>window.FrozenRootSeason.matches(s.sport,p.date));
      const wins=activePicks.filter(p=>p.status==='win').length;
      const losses=activePicks.filter(p=>p.status==='loss').length;
      const pending=activePicks.filter(p=>p.status==='pending').length;
      const voids=activePicks.filter(p=>p.status==='void').length;
      const seasonTitle=byId(s.sport+'AutoRecordSeason');
      if(seasonTitle)seasonTitle.textContent=activeSeason.label+' SEASON · WINNER ACCURACY';
      // Model accuracy counts how often the automated predicted winner was right.
      // Games still pending or void, and ties/pushes, never count as wins or losses.
      const graded=wins+losses;
      const percentage=graded?(100*wins/graded).toFixed(1)+'%':'—';
      if(recordWins)recordWins.textContent=String(wins);
      if(recordLosses)recordLosses.textContent=String(losses);
      if(recordAccuracy)recordAccuracy.textContent=percentage;
      if(recordNote)recordNote.textContent=graded
        ? activeSeason.label+' season · '+graded+' graded automatic pick'+(graded===1?'':'s')+
          ' · '+pending+' pending · '+voids+' void. Previous seasons: Season Archives.'
        : activeSeason.label+' season · no graded predictions yet · '+pending+
          ' awaiting results. Past seasons: Season Archives.';
      summary.textContent=activeSeason.label+' SEASON AUTO MODEL · '+wins+' wins · '+losses+' losses · '+percentage+
        ' win rate · '+pending+' awaiting results'+(voids?' · '+voids+' void':'')+
        '. Separate from official Root + owner selections.';
      count.textContent=ordered.length+' FROZEN FORECAST'+(ordered.length===1?'':'S')+' ALL SEASONS · LATEST 40';
      feature.innerHTML=latestCard(s,activePicks[0]);
      history.innerHTML=historyRows(s,ordered);
    } catch(e) {
      // Never show a fictitious 0-0 record when files are unavailable.
      if(recordWins)recordWins.textContent='—';
      if(recordLosses)recordLosses.textContent='—';
      if(recordAccuracy)recordAccuracy.textContent='—';
      if(recordNote)recordNote.textContent='Auto-pick results are temporarily unavailable.';
      summary.textContent='Automatic predictions temporarily unavailable.';
      feature.innerHTML='<div class="loading">Automatic '+s.label+' forecasts are unavailable; no winner or score has been assumed.</div>';
      history.innerHTML='<tr><td colspan="6">Automatic prediction archive unavailable.</td></tr>';
      count.textContent='UNAVAILABLE';
    }finally{busy[s.sport]=false;}
  }
  const updateCurrent=()=>specs.filter(s=>location.hash==='#'+s.page).forEach(refresh);
  for(const s of specs)refresh(s);
  window.addEventListener('hashchange',updateCurrent);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateCurrent();});
  setInterval(updateCurrent,60000);
})();
