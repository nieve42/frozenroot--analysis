'use strict';
let state=null;
let sessionToken='';
const $ = id => document.getElementById(id);
const formatDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).toUpperCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// A score forecast is optional legacy data, but required for new official MLB picks.
 // Runs are always from the perspective of p.team (Root's pick) and p.opponent.
function projectedRuns(p){
  const projection=p && p.projectedScore;
  if(!projection)return null;
  const a=projection.teamRuns, b=projection.opponentRuns;
  return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0
    ? {teamRuns:a,opponentRuns:b,totalRuns:a+b}:null;
}

/* Actual results are separate from pregame projections and shown only for settled games. */
function finalScoreData(p){
  if(!p || !['win','loss','push'].includes(p.status))return null;
  const value=p.actualScore;
  const valid=n=>Number.isInteger(n)&&n>=0;
  if(value && valid(value.teamRuns) && valid(value.opponentRuns))
    return {teamRuns:value.teamRuns,opponentRuns:value.opponentRuns};
  // Support historical verified scores published as team-named text.
  if(typeof p.finalScore!=='string')return null;
  const getRuns=name=>{
    const start=p.finalScore.toLowerCase().indexOf(String(name).toLowerCase());
    if(start<0)return null;
    const following=p.finalScore.slice(start+String(name).length).match(/^\s*(\d+)/);
    return following ? Number(following[1]) : null;
  };
  const teamRuns=getRuns(p.team),opponentRuns=getRuns(p.opponent);
  return valid(teamRuns)&&valid(opponentRuns)?{teamRuns,opponentRuns}:null;
}
function finalWinner(p,s){
  return s.teamRuns===s.opponentRuns?'TIE GAME':(s.teamRuns>s.opponentRuns?p.team:p.opponent);
}
function actualScoreMarkup(p){
  const s=finalScoreData(p);
  if(!s)return '';
  const winner=finalWinner(p,s);
  return '<section class="actual-final" aria-label="Actual final score">'+
    '<div class="actual-final-heading"><span>✓ ACTUAL FINAL SCORE</span><small>VERIFIED RESULT</small></div>'+
    '<div class="actual-final-score"><span>'+escapeHtml(p.team)+'</span><strong>'+s.teamRuns+' – '+s.opponentRuns+'</strong><span>'+escapeHtml(p.opponent)+'</span></div>'+
    '<div class="actual-final-winner">'+(winner==='TIE GAME'?'TIE GAME':'🏆 WINNER: '+escapeHtml(winner))+'</div>'+
    '</section>';
}
function actualScoreHistory(p){
  const s=finalScoreData(p);
  if(!s)return '<small class="actual-unavailable">'+(p.status==='void'?'Canceled / void':'Not final')+'</small>';
  return '<strong class="actual-history-score">'+s.teamRuns+' – '+s.opponentRuns+'</strong>'+
    '<small class="actual-history-winner">'+(s.teamRuns===s.opponentRuns?'TIE GAME':'WINNER: '+escapeHtml(finalWinner(p,s)))+'</small>';
}

function projectionMarkup(p){
  const projected=projectedRuns(p);
  if(!projected) return '<div class="run-projection missing"><div class="run-projection-heading"><span>❄ PROJECTED FINAL SCORE</span><small>PREGAME FORECAST</small></div><p>No score forecast was saved for this older pick.</p></div>';
  return '<section class="run-projection" aria-label="Projected final score: '+escapeHtml(p.team)+' '+projected.teamRuns+', '+escapeHtml(p.opponent)+' '+projected.opponentRuns+'">'+
    '<div class="run-projection-heading"><span>❄ PROJECTED FINAL SCORE</span><small>ROOT\'S PREGAME PREDICTION · NOT THE ACTUAL RESULT</small></div>'+
    '<div class="run-projection-scores">'+
    '<div class="run-team"><span class="run-team-name">'+escapeHtml(p.team)+'</span><strong>'+projected.teamRuns+'</strong></div>'+
    '<div class="run-score-separator">–</div>'+
    '<div class="run-team"><span class="run-team-name">'+escapeHtml(p.opponent)+'</span><strong>'+projected.opponentRuns+'</strong></div>'+
    '<div class="run-total"><span>PROJECTED TOTAL RUNS</span><strong>'+projected.totalRuns+'</strong></div>'+
    '</div></section>';
}
function projectionHistory(p){
  const x=projectedRuns(p);
  if(!x)return '<span class="projection-unavailable">Not recorded</span>';
  return '<strong class="projection-history-score">'+x.teamRuns+' – '+x.opponentRuns+'</strong>'+
    '<small>'+x.totalRuns+' total runs · FORECAST</small>';
}
function stats(){
  // The preserved 2026 baseline must never roll into a new MLB season.
  const season=window.FrozenRootSeason.current('mlb');
  const isCurrent=date=>window.FrozenRootSeason.matches('mlb',date);
  const baseline=state.baseline||{wins:0,losses:0,pushes:0,asOf:'0000-01-01'};
  const useBaseline=isCurrent(baseline.asOf);
  const currentPicks=state.picks.filter(p=>isCurrent(p.date)&&(!useBaseline||p.date>baseline.asOf));
  const wins=(useBaseline?(Number(baseline.wins)||0):0)+currentPicks.filter(p=>p.status==='win').length;
  const losses=(useBaseline?(Number(baseline.losses)||0):0)+currentPicks.filter(p=>p.status==='loss').length;
  const pushes=(useBaseline?(Number(baseline.pushes)||0):0)+currentPicks.filter(p=>p.status==='push').length;
  const pending=state.picks.filter(p=>isCurrent(p.date)&&p.status==='pending').length;
  return {wins,losses,pushes,pending,season,rate:wins+losses?((wins/(wins+losses))*100).toFixed(1)+'%':'—'};
}
function featured(){
  return state.picks.filter(p=>window.FrozenRootSeason.matches('mlb',p.date))
    .sort((a,b)=>b.date.localeCompare(a.date))[0];
}
function render(){
  if(!state)return;
  const s=stats();
  $('wins').textContent=s.wins;$('losses').textContent=s.losses;$('rate').textContent=s.rate;$('pending').textContent=s.pending;
  if($('mlbSeasonLabel'))$('mlbSeasonLabel').textContent=s.season.label+' · CURRENT SEASON';
  if($('mlbSeasonNote'))$('mlbSeasonNote').textContent='Season '+s.season.label+
    ' · record resets after the postseason on November 15. Historical results remain in Season Archives.';
  $('lastUpdated').textContent='DATA UPDATED '+formatDate(state.lastUpdated);
  const p=featured();
  if (!p) $('featuredPick').innerHTML='<div class="loading">No MLB pick has been locked for the '+s.season.label+' season yet. Past seasons are preserved in Season Archives.</div>';
  if (p) $('featuredPick').innerHTML=`<div class="picktop"><span class="labelcyan">✳ OFFICIAL ROOT SELECTION</span><span class="pickdate">${formatDate(p.date)} &nbsp; / &nbsp; ${escapeHtml(p.series)}</span></div><div class="pickbody"><span class="labelcyan">MONEYLINE WINNER</span><div class="picktitle">${escapeHtml(p.team.toUpperCase())}</div><div class="opp">VERSUS ${escapeHtml(p.opponent.toUpperCase())}</div>${projectionMarkup(p)}${actualScoreMarkup(p)}<div class="pickchips"><span class="chip locked">❄ OFFICIALLY LOCKED</span><span class="chip ${escapeHtml(p.status)}">${p.status.toUpperCase()}</span><span class="chip">HYPOTHETICAL ${p.stake} UNIT</span></div><div class="opp">${escapeHtml(p.analysis)}</div></div><div class="feature-note"><strong>RISK / PROCESS</strong><span>${escapeHtml(p.risk)}</span></div>`;
  const sorted=[...state.picks].sort((a,b)=>b.date.localeCompare(a.date));
  $('historyRows').innerHTML=sorted.map(p=>`<tr><td>${formatDate(p.date)}</td><td><strong>${escapeHtml(p.team)}</strong><small>OFFICIAL · LOCKED</small></td><td>${escapeHtml(p.opponent)}<br><small>${escapeHtml(p.series)}</small></td><td>${projectionHistory(p)}</td><td>${actualScoreHistory(p)}</td><td><span class="status ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td><td>${p.stake}</td></tr>`).join('');
  $('historyCount').textContent=sorted.length+' TRACKED PICKS';
  $('historyFoot').textContent=`Current MLB ${s.season.label} record: ${s.wins} wins / ${s.losses} losses. The verified historical baseline ${state.baseline.wins}-${state.baseline.losses}-${state.baseline.pushes} through ${formatDate(state.baseline.asOf)} stays in the original MLB season record. Older picks remain in the archive; pending results never increase wins or losses.`;
  const pending=sorted.filter(p=>p.status==='pending');
}
function showPage(page){
  const allowed=['dashboard','history','method','control','football','basketball','hockey','seasons'];
  if(!allowed.includes(page))page='dashboard';
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  document.querySelectorAll('.navlink').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('pageName').textContent=({dashboard:'MLB PREDICTIONS AND RECORD',history:'PICK HISTORY',method:'THE SYSTEM',control:'PUBLISHING',football:'NFL / FOOTBALL',basketball:'NBA / BASKETBALL',hockey:'NHL / HOCKEY',seasons:'SEASON ARCHIVES'})[page];
  if($('sportIndicator')) $('sportIndicator').textContent=page==='football'?'FOOTBALL / NFL':page==='basketball'?'BASKETBALL / NBA':page==='hockey'?'HOCKEY / NHL':page==='seasons'?'HISTORICAL RECORD BOOK':'BASEBALL INTELLIGENCE';
  if(page==='dashboard')window.scrollTo({top:0,behavior:'instant'});
}
async function getState(){const r=await fetch('./site.json',{cache:'no-store'});if(!r.ok)throw Error('Cannot load the published predictions');state=await r.json();render();}
window.addEventListener('hashchange',()=>showPage(location.hash.replace('#','')));
showPage(location.hash.replace('#',''));
getState().catch(err=>{$('featuredPick').innerHTML='<div class="loading">Could not load published predictions. Open this site through GitHub Pages, not directly as a local file.</div>';});

let activeMlbSeason=window.FrozenRootSeason.current('mlb').id;
function checkMlbSeasonRollover(){
  const year=window.FrozenRootSeason.current('mlb').id;
  if(year!==activeMlbSeason){
    activeMlbSeason=year;
    if(state)render();
  }
}
setInterval(checkMlbSeasonRollover,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkMlbSeasonRollover();});
