'use strict';
let state=null;
let sessionToken='';
const $ = id => document.getElementById(id);
const formatDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).toUpperCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function stats(){
  const wins=state.baseline.wins + state.picks.filter(p=>p.status==='win'&&p.date>state.baseline.asOf).length;
  const losses=state.baseline.losses + state.picks.filter(p=>p.status==='loss'&&p.date>state.baseline.asOf).length;
  const pushes=state.baseline.pushes + state.picks.filter(p=>p.status==='push'&&p.date>state.baseline.asOf).length;
  return {wins,losses,pushes,pending:state.picks.filter(p=>p.status==='pending').length,rate:wins+losses?((wins/(wins+losses))*100).toFixed(1)+'%':'—'};
}
function featured(){
  return [...state.picks].sort((a,b)=>b.date.localeCompare(a.date))[0];
}
function render(){
  if(!state)return;
  const s=stats();
  $('wins').textContent=s.wins;$('losses').textContent=s.losses;$('rate').textContent=s.rate;$('pending').textContent=s.pending;
  $('lastUpdated').textContent='DATA UPDATED '+formatDate(state.lastUpdated);
  const p=featured();
  if (p) $('featuredPick').innerHTML=`<div class="picktop"><span class="labelcyan">✳ OFFICIAL ROOT SELECTION</span><span class="pickdate">${formatDate(p.date)} &nbsp; / &nbsp; ${escapeHtml(p.series)}</span></div><div class="pickbody"><span class="labelcyan">MONEYLINE WINNER</span><div class="picktitle">${escapeHtml(p.team.toUpperCase())}</div><div class="opp">VERSUS ${escapeHtml(p.opponent.toUpperCase())}</div><div class="pickchips"><span class="chip locked">❄ OFFICIALLY LOCKED</span><span class="chip ${escapeHtml(p.status)}">${p.status.toUpperCase()}</span><span class="chip">HYPOTHETICAL $${p.stake} UNIT</span></div><div class="opp">${escapeHtml(p.analysis)}</div></div><div class="feature-note"><strong>RISK / PROCESS</strong><span>${escapeHtml(p.risk)}</span></div>`;
  const sorted=[...state.picks].sort((a,b)=>b.date.localeCompare(a.date));
  $('historyRows').innerHTML=sorted.map(p=>`<tr><td>${formatDate(p.date)}</td><td><strong>${escapeHtml(p.team)}</strong><small>OFFICIAL · LOCKED</small></td><td>${escapeHtml(p.opponent)}<br><small>${escapeHtml(p.series)}</small></td><td><span class="status ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td><td>$${p.stake}</td></tr>`).join('');
  $('historyCount').textContent=sorted.length+' TRACKED PICKS';
  $('historyFoot').textContent=`Historical settled baseline: ${state.baseline.wins}-${state.baseline.losses}-${state.baseline.pushes} through ${formatDate(state.baseline.asOf)}. The entries shown are recent locked picks; the baseline includes older games not individually reproduced here. Pending results are not counted as wins or losses.`;
  const pending=sorted.filter(p=>p.status==='pending');
}
function showPage(page){
  const allowed=['dashboard','history','method','control'];
  if(!allowed.includes(page))page='dashboard';
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  document.querySelectorAll('.navlink').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('pageName').textContent=({dashboard:'OVERVIEW',history:'PICK HISTORY',method:'THE SYSTEM',control:'PUBLISHING'})[page];
  if(page==='dashboard')window.scrollTo({top:0,behavior:'instant'});
}
async function getState(){const r=await fetch('./site.json',{cache:'no-store'});if(!r.ok)throw Error('Cannot load the published predictions');state=await r.json();render();}
window.addEventListener('hashchange',()=>showPage(location.hash.replace('#','')));
showPage(location.hash.replace('#',''));
getState().catch(err=>{$('featuredPick').innerHTML='<div class="loading">Could not load published predictions. Open this site through GitHub Pages, not directly as a local file.</div>';});
