/* FrozenRoot all-sports landing page. Records always retain league and
   official-vs-automatic separation. Only published game/pick data is shown. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sports=[
    {key:'mlb',label:'MLB',icon:'⚾',page:'dashboard',kind:'AUTOMATIC MODEL PICKS'},
    {key:'nfl',label:'NFL',icon:'🏈',page:'football',kind:'AUTOMATIC MODEL PICKS'},
    {key:'nba',label:'NBA',icon:'🏀',page:'basketball',kind:'AUTOMATIC MODEL PICKS'},
    {key:'nhl',label:'NHL',icon:'🏒',page:'hockey',kind:'AUTOMATIC MODEL PICKS'}
  ];
  const localDay=(when=new Date())=>window.FrozenRootSeason.localDate(when);
  const fmtWhen=date=>{
    const d=new Date(date);
    return Number.isNaN(d.valueOf())?'TIME UNAVAILABLE':new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
    }).format(d)+' PT';
  };
  const prettyDay=date=>new Intl.DateTimeFormat('en-US',{
    timeZone:'UTC',month:'short',day:'numeric',year:'numeric'
  }).format(new Date(date+'T12:00:00Z'));
  const validPicks=data=>data&&Array.isArray(data.picks)?data.picks:null;
  const validGames=data=>data&&Array.isArray(data.games)?data.games:null;
  async function read(name){
    const r=await fetch('./'+name+'?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw Error(name+' unavailable');
    return r.json();
  }
  function mlbTotals(data){
    const picks=validPicks(data);
    if(!picks)return null;
    const baseline=data.baseline||{wins:0,losses:0,asOf:''};
    const hasBase=window.FrozenRootSeason.matches('mlb',baseline.asOf);
    const current=picks.filter(p=>p.recordEligible!==false&&window.FrozenRootSeason.matches('mlb',p.date));
    const additional=current.filter(p=>!hasBase||p.date>baseline.asOf);
    const wins=(hasBase?Number(baseline.wins)||0:0)+additional.filter(p=>p.status==='win').length;
    const losses=(hasBase?Number(baseline.losses)||0:0)+additional.filter(p=>p.status==='loss').length;
    const pending=current.filter(p=>p.status==='pending').length;
    return {wins,losses,pending,accuracy:wins+losses?(100*wins/(wins+losses)).toFixed(1)+'%':'—'};
  }
  function autoTotals(key,data,schedule){
    const picks=validPicks(data);
    if(!picks)return null;
    const suffix=key==='nhl'?'Goals':key==='mlb'?'Runs':'Points';
    const current=picks.filter(p=>window.FrozenRootSeason.matches(key,p.date));
    const outcomes=current.map(p=>window.FrozenRootSportResult.get(p,schedule,suffix).status);
    const wins=outcomes.filter(s=>s==='win').length;
    const losses=outcomes.filter(s=>s==='loss').length;
    const pending=outcomes.filter(s=>s==='pending').length;
    return {wins,losses,pending,accuracy:wins+losses?(100*wins/(wins+losses)).toFixed(1)+'%':'—'};
  }
  function sportCard(s,stats){
    const season=window.FrozenRootSeason.current(s.key);
    if(!stats)return '<a href="#'+s.page+'" class="overview-record">'+
      '<div class="overview-record-top"><span>'+s.icon+' '+s.label+'</span><span>↗</span></div>'+
      '<small>'+s.kind+'</small><div class="overview-record-numbers">—</div>'+
      '<p>Data unavailable · view sport</p></a>';
    return '<a href="#'+s.page+'" class="overview-record">'+
      '<div class="overview-record-top"><span>'+s.icon+' '+s.label+'</span><span>↗</span></div>'+
      '<small>'+s.kind+' · '+safe(season.label)+'</small>'+
      '<div class="overview-record-numbers"><b>'+stats.wins+'</b><span>W</span><i>–</i><b>'+stats.losses+'</b><span>L</span></div>'+
      '<div class="overview-record-footer"><span>'+safe(stats.accuracy)+' ACCURACY</span>'+
      '<span>'+stats.pending+' AWAITING</span></div></a>';
  }
  const statusKind=(p,game,sport,schedule)=>{
    if(/cancel|postpon/i.test(String(game?.status||'')))return 'void';
    if(!p)return /final|complete|closed/i.test(String(game?.status||''))?'no-pick':'pick-pending';
    if(sport==='mlb')return p.postStartLock&&p.status==='pending'?'post-start':(['win','loss','push','void'].includes(p.status)?p.status:'pending');
    return window.FrozenRootSportResult.get(p,schedule,sport==='nhl'?'Goals':'Points').status;
  };
  function findPick(s,game,files){
    if(s.key==='mlb'){
      const picks=validPicks(files['site.json'])||[];
      const day=files['schedule.json']?.date;
      return picks.find(p=>p.locked===true&&p.date===day&&
        ((p.team===game.away&&p.opponent===game.home)||
         (p.team===game.home&&p.opponent===game.away)))||null;
    }
    const official=validPicks(files[s.key+'-picks.json'])||[];
    const auto=validPicks(files['auto-'+s.key+'-picks.json'])||[];
    return official.find(p=>p.locked===true&&String(p.gameId)===String(game.id))||
           auto.find(p=>p.automated===true&&String(p.gameId)===String(game.id))||null;
  }
  function getForecast(p,s){
    const suffix=s.key==='mlb'?'Runs':s.key==='nhl'?'Goals':'Points';
    const a=p?.projectedScore?.['team'+suffix],b=p?.projectedScore?.['opponent'+suffix];
    return Number.isInteger(a)&&Number.isInteger(b)?a+' – '+b:null;
  }
  function gameCard(s,game,files){
    const p=findPick(s,game,files);
    const slate=files[s.key==='mlb'?'schedule.json':s.key+'-schedule.json'];
    const status=statusKind(p,game,s.key,slate);
    const off=['void','no-pick','pick-pending'].includes(status);
    const auto=!!p?.automated;
    const tag=status==='post-start'?'POST-START LOCK':status==='pick-pending'?'PICK PENDING':status==='no-pick'?'FINAL · NO PICK':status==='void'?'VOID / CANCELED':
      status.toUpperCase();
    const team=p?.team||null;
    const forecast=p?getForecast(p,s):null;
    const date=game.dateUTC||game.startUTC;
    const time=date?fmtWhen(date):safe(prettyDay(slate.date||localDay()));
    const reliability=p&&!p.postStartLock?window.FrozenRootReliability.badge(p,s.key,auto):'';
    return '<article class="overview-game">'+
      '<div class="overview-game-top"><span>'+s.icon+' '+s.label+'</span><span>'+safe(time)+'</span></div>'+
      '<h3>'+safe(game.away)+' <span>vs</span> '+safe(game.home)+'</h3>'+
      '<div class="overview-game-pick">'+(off?'No active winner selection':safe(team)+' to win')+
      ' <span class="overview-outcome overview-outcome-'+safe(status)+'">'+safe(tag)+'</span></div>'+
      (p?'<p class="overview-pick-type">'+(auto?'🤖 AUTOMATIC STATISTICAL FORECAST':p.postStartLock?'◷ POST-START OWNER LOCK · RECORD EXCLUDED':'❄ OFFICIAL ROOT SELECTION')+'</p>':
        '<p class="overview-pick-type">No locked selection for this matchup</p>')+
      (forecast?'<p class="overview-game-score">'+(p.postStartLock?'POST-START PROJECTION':'PREDICTED SCORE')+' <strong>'+safe(forecast)+'</strong></p>':'')+
      (p?'<div class="overview-reliability">'+reliability+'</div>':'')+
      '<a href="#'+s.page+'" class="overview-game-link">View '+s.label+' details →</a></article>';
  }
  function schedulePanel(s,files,today){
    const slate=files[s.key==='mlb'?'schedule.json':s.key+'-schedule.json'];
    const games=validGames(slate);
    const label=s.key==='nfl'?'NEXT NFL GAMES':'TODAY · '+s.label;
    if(!games)return '<section class="overview-sport-feed"><div class="overview-feed-top"><h3>'+
      s.icon+' '+label+'</h3><a href="#'+s.page+'">View section →</a></div>'+
      '<p class="overview-empty">Schedule feed unavailable.</p></section>';
    if(s.key==='mlb'&&slate.date!==today ||
       (s.key==='nba'||s.key==='nhl')&&slate.date!==today ||
       s.key==='nfl'&&!(slate.startDate<=today&&slate.endDate>=today))
      return '<section class="overview-sport-feed"><div class="overview-feed-top"><h3>'+
        s.icon+' '+label+'</h3><a href="#'+s.page+'">View section →</a></div>'+
        '<p class="overview-empty">Awaiting current schedule refresh.</p></section>';
    let list=games.filter(g=>{
      if(s.key==='mlb')return true;
      const d=new Date(g.dateUTC);
      if(Number.isNaN(d.valueOf()))return false;
      return s.key==='nfl' ? d.getTime()>=Date.now()-2*60*60*1000 : localDay(d)===today;
    }).sort((a,b)=>String(a.dateUTC||a.startUTC).localeCompare(String(b.dateUTC||b.startUTC)));
    if(s.key==='nfl'&&!list.length)list=games.slice(-2);
    const selected=list.slice(0,2);
    return '<section class="overview-sport-feed"><div class="overview-feed-top"><h3>'+
      s.icon+' '+label+'</h3><a href="#'+s.page+'">View all →</a></div>'+
      (selected.length?'<div class="overview-game-list">'+selected.map(g=>gameCard(s,g,files)).join('')+'</div>':
        '<p class="overview-empty">No games currently listed for this date.</p>')+'</section>';
  }
  let busy=false;
  async function render(){
    if(busy)return;
    const records=byId('overviewRecords'),feed=byId('overviewFeed'),stamp=byId('overviewDate');
    if(!records||!feed)return;
    busy=true;
    const today=window.FrozenRootSeason.localDate();
    if(stamp)stamp.textContent=prettyDay(today).toUpperCase()+' · PACIFIC';
    try {
      const names=[
        'site.json','schedule.json','auto-mlb-picks.json',
        'auto-nfl-picks.json','nfl-schedule.json','nfl-picks.json',
        'auto-nba-picks.json','nba-schedule.json','nba-picks.json',
        'auto-nhl-picks.json','nhl-schedule.json','nhl-picks.json'
      ];
      const values=await Promise.allSettled(names.map(read));
      const files={};
      for(let i=0;i<names.length;i++)if(values[i].status==='fulfilled')files[names[i]]=values[i].value;
      const stats={
        mlb:autoTotals('mlb',files['auto-mlb-picks.json'],files['schedule.json']),
        nfl:autoTotals('nfl',files['auto-nfl-picks.json'],files['nfl-schedule.json']),
        nba:autoTotals('nba',files['auto-nba-picks.json'],files['nba-schedule.json']),
        nhl:autoTotals('nhl',files['auto-nhl-picks.json'],files['nhl-schedule.json'])
      };
      records.innerHTML=sports.map(s=>sportCard(s,stats[s.key])).join('');
      feed.innerHTML=sports.map(s=>schedulePanel(s,files,today)).join('');
      const loaded=values.filter(v=>v.status==='fulfilled').length;
      byId('overviewDataNote').textContent=loaded===names.length?
        'Published schedules and prediction files checked just now. Auto-model records are independent of official Root picks.':
        loaded+' of '+names.length+' data feeds loaded. Missing information is marked unavailable rather than estimated.';
    }catch(err){
      records.innerHTML='<p class="overview-empty">Record data temporarily unavailable.</p>';
      feed.innerHTML='<p class="overview-empty">Upcoming games temporarily unavailable.</p>';
      byId('overviewDataNote').textContent='Unable to refresh published data.';
    }finally{busy=false;}
  }
  render();
  window.addEventListener('hashchange',()=>{if(location.hash==='#overview')render();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash==='#overview')render();});
  setInterval(()=>{if(location.hash==='#overview'||!location.hash)render();},5*60*1000);
})();