/* Fast UI settlement for NFL, NBA and NHL. Never guesses: only final ESPN scores.
   Backend workflow persists the same result in each sport's JSON history. */
(() => {
  'use strict';
  function value(n) {
    if (n === null || n === undefined || n === '') return null;
    const v = Number(n);
    return Number.isInteger(v) && v >= 0 ? v : null;
  }
  function get(p, schedule, suffix) {
    const raw = String(p?.status || 'pending').toLowerCase();
    const saved = p?.actualScore;
    const savedTeam = value(saved?.['team'+suffix]);
    const savedOpponent = value(saved?.['opponent'+suffix]);
    if (['win','loss','push'].includes(raw) &&
        savedTeam !== null && savedOpponent !== null) {
      return {status:raw,actualScore:saved};
    }
    if (raw === 'void') return {status:'void',actualScore:null};
    if (['win','loss','push'].includes(raw)) return {status:raw,actualScore:null};
    const game = schedule?.games?.find(g => String(g.id) === String(p?.gameId));
    if (!game) return {status:'pending',actualScore:null};
    const state = String(game.status||'').toLowerCase();
    if (/cancel|postpon/.test(state)) return {status:'void',actualScore:null};
    if (!/final|complete|closed/.test(state)) return {status:'pending',actualScore:null};
    const away = value(game.awayScore), home = value(game.homeScore);
    if (away === null || home === null) return {status:'pending',actualScore:null};
    const key = x => String(x||'').trim().toLowerCase();
    let team,opponent;
    if (key(p.team) === key(game.away) && key(p.opponent) === key(game.home)) {
      team=away; opponent=home;
    } else if (key(p.team) === key(game.home) && key(p.opponent) === key(game.away)) {
      team=home; opponent=away;
    } else {
      return {status:'pending',actualScore:null};
    }
    return {
      status:team>opponent?'win':team<opponent?'loss':'push',
      actualScore:{['team'+suffix]:team,['opponent'+suffix]:opponent}
    };
  }
  window.FrozenRootSportResult = {get};
})();
