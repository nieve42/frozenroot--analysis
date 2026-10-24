/* Season Archives: independent end-of-season MLB NFL NBA NHL records.
   No renaming/rewriting/rotating a pick. Totals come from permanent JSON history. */
(() => {
  'use strict';
  const sys=window.FrozenRootSeason;
  const settle=window.FrozenRootSportResult;
  const sports=[
    {id:'mlb',title:'BASEBALL · MLB',icon:'⚾',container:'seasonArchiveMlb'},
    {id:'nfl',title:'FOOTBALL · NFL',icon:'🏈',container:'seasonArchiveNfl'},
    {id:'nba',title:'BASKETBALL · NBA',icon:'🏀',container:'seasonArchiveNba'},
    {id:'nhl',title:'HOCKEY · NHL',icon:'🏒',container:'seasonArchiveNhl'}
  ];
  const byId=id=>document.getElementById(id);
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function read(path){
    const response=await fetch('./'+path+'?t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw Error('Could not load '+path);
    return response.json();
  }
  const scoreField=id=>id==='nhl'?'Goals':'Points';
  function gradedPicks(sport,picks,schedule){
    const list=Array.isArray(picks)?picks:[];
    if(sport==='mlb')return list;
    return list.map(p=>({...p,...settle.get(p,schedule,scoreField(sport))}));
  }
  function bySeason(sport,picks,id){
    return picks.filter(p=>sys.seasonForDate(sport,p.date)===id);
  }
  function mlbTotals(data,id){
    const picks=data.picks||[],baseline=data.baseline||{};
    const baselineYear=sys.seasonForDate('mlb',baseline.asOf);
    const baselineUsed=baselineYear===id;
    const rows=bySeason('mlb',picks,id).filter(p=>!baselineUsed||p.date>baseline.asOf);
    const count=sys.totals(rows);
    if(baselineUsed){
      count.wins+=Number(baseline.wins)||0;
      count.losses+=Number(baseline.losses)||0;
      count.pushes+=Number(baseline.pushes)||0;
    }
    count.accuracy=count.wins+count.losses
      ?(100*count.wins/(count.wins+count.losses)).toFixed(1)+'%':'—';
    return count;
  }
  function recordRow(kind,counts){
    return '<div class="season-record-row"><span>'+safe(kind)+'</span>'+
      '<b>'+counts.wins+' W / '+counts.losses+' L <small>· '+counts.accuracy+'</small></b></div>';
  }
  function sportRows(sport,id,data,schedule){
    if(sport==='mlb')return recordRow('Root + owner tracked picks',mlbTotals(data.official,id));
    const auto=gradedPicks(sport,data.automatic.picks,schedule);
    const official=gradedPicks(sport,data.official.picks,schedule);
    return recordRow('Automatic model',sys.totals(bySeason(sport,auto,id)))+
           recordRow('Official Root picks',sys.totals(bySeason(sport,official,id)));
  }
  function historicYears(sport,data){
    const dates=[
      ...(data.official?.picks||[]).map(p=>p.date),
      ...(data.automatic?.picks||[]).map(p=>p.date)
    ];
    if(sport==='mlb'&&data.official.baseline?.asOf)dates.push(data.official.baseline.asOf);
    return [...new Set(dates.map(d=>sys.seasonForDate(sport,d)).filter(x=>Number.isInteger(x)))].sort((a,b)=>b-a);
  }
  function paint(spec,data,schedule){
    const sport=spec.id,current=sys.current(sport);
    const allYears=historicYears(sport,data);
    const finishedYears=allYears.filter(id=>id<current.id);
    const curr=sportRows(sport,current.id,data,schedule);
    const past=finishedYears.length ? finishedYears.map(id=>
      '<div class="season-year-entry"><h3>❄ '+safe(sys.label(sport,id))+' SEASON · FINAL RECORD</h3>'+
      sportRows(sport,id,data,schedule)+'</div>').join('') :
      '<p class="season-archive-empty">No completed season is in the archive yet. The first finished season will appear here automatically after the season rollover.</p>';
    byId(spec.container).innerHTML=
      '<div class="season-sport-header"><h2>'+safe(spec.icon)+' '+safe(spec.title)+'</h2>'+
      '<span>INDEPENDENT HISTORY</span></div>'+
      '<div class="season-season-current"><strong>'+safe(current.label)+' SEASON · ACTIVE</strong>'+
      curr+'<p class="season-archive-empty">Next reset: '+safe(current.resetName)+
      ' after the usual postseason window.</p></div>'+
      '<div class="season-archive-label">COMPLETED SEASONS · SAVED RECORDS</div>'+past;
  }
  let busy=false;
  async function refresh(){
    if(busy)return;
    busy=true;
    try{
      const files=[
        'site.json',
        'nfl-picks.json','auto-nfl-picks.json','nfl-schedule.json',
        'nba-picks.json','auto-nba-picks.json','nba-schedule.json',
        'nhl-picks.json','auto-nhl-picks.json','nhl-schedule.json'
      ];
      const result=await Promise.allSettled(files.map(read));
      const byName=Object.fromEntries(files.map((file,i)=>[file,result[i]]));
      function file(name){
        const item=byName[name];
        if(item.status!=='fulfilled')throw Error('Unavailable: '+name);
        return item.value;
      }
      for(const spec of sports){
        try{
          const id=spec.id;
          const official=file(id==='mlb'?'site.json':id+'-picks.json');
          const automatic=id==='mlb'?null:file('auto-'+id+'-picks.json');
          if(!Array.isArray(official.picks)||id!=='mlb'&&!Array.isArray(automatic.picks))
            throw Error('Missing pick history');
          const schedule=id==='mlb'?null:byName[id+'-schedule.json']?.value;
          paint(spec,{official,automatic},schedule);
        }catch(error){
          byId(spec.container).innerHTML='<h2>'+safe(spec.icon)+' '+safe(spec.title)+'</h2>'+
            '<p class="season-archive-empty">Season record temporarily unavailable; prior results are not erased.</p>';
        }
      }
      const checked=byId('seasonArchiveLastChecked');
      if(checked)checked.textContent='SEASONAL RECORDS · AUTO-UPDATED';
    }finally{busy=false;}
  }
  const onRoute=()=>{if(location.hash==='#seasons')refresh();};
  refresh();
  window.addEventListener('hashchange',onRoute);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)onRoute();});
  setInterval(onRoute,60000);
})();