/* Frozen Root season buckets. No picks are removed at a reset. All dates are Pacific.
   Conservative reset windows after playoffs (adjust in code if the league calendar changes). */
(() => {
  'use strict';
  const cuts=Object.freeze({mlb:'11-15',nfl:'02-22',nba:'07-01',nhl:'07-01'});
  const names=Object.freeze({mlb:'November 15',nfl:'February 22',nba:'July 1',nhl:'July 1'});
  function localDate(now=new Date()) {
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(now);
    const val=type=>parts.find(p=>p.type===type)?.value||'';
    return val('year')+'-'+val('month')+'-'+val('day');
  }
  function seasonForDate(sport,dateStr) {
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr||''));
    if(!cuts[sport]||!m)return null;
    const year=Number(m[1]),monthDay=m[2]+'-'+m[3];
    if(sport==='mlb'){
      // The 2026 World Series ended on October 28. Games that day belong to
      // the finished 2026 season; new offseason picks begin the 2027 bucket.
      if(dateStr>='2026-10-29'&&dateStr<'2027-01-01')return 2027;
      return monthDay>=cuts[sport]?year+1:year;
    }
    return monthDay>=cuts[sport]?year:year-1;
  }
  const label=(sport,id)=>sport==='mlb'?String(id):String(id)+'–'+String(id+1).slice(-2);
  function current(sport,now=new Date()) {
    const today=localDate(now);
    // Close the 2026 MLB season immediately upon the World Series conclusion,
    // without reassigning the October 28 championship game to the 2027 season.
    const id=sport==='mlb'&&today==='2026-10-28' ? 2027 : seasonForDate(sport,today);
    return {id,label:label(sport,id),sport:sport.toUpperCase(),
      resetDate:(sport==='mlb'?id:id+1)+'-'+cuts[sport],
      resetName:names[sport]};
  }
  function matches(sport,day,now=new Date()){
    const id=seasonForDate(sport,day);
    return id!==null&&id===current(sport,now).id;
  }
  function totals(picks){
    const list=Array.isArray(picks)?picks:[];
    const wins=list.filter(p=>p.status==='win').length;
    const losses=list.filter(p=>p.status==='loss').length;
    const pending=list.filter(p=>p.status==='pending').length;
    const voids=list.filter(p=>p.status==='void').length;
    const pushes=list.filter(p=>p.status==='push').length;
    return {wins,losses,pending,voids,pushes,
      accuracy:wins+losses?(100*wins/(wins+losses)).toFixed(1)+'%':'—'};
  }
  window.FrozenRootSeason={localDate,seasonForDate,current,label,matches,totals};
})();