/* FrozenRoot qualitative prediction reliability labels.
   These are NOT calibrated probabilities or betting recommendations. */
(() => {
  'use strict';
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function manual(p) {
    const note = String(p?.risk || '');
    let level = 'unrated', label = 'UNRATED';
    if (/\blow\s+confidence\b/i.test(note)) {level='low';label='LOW';}
    else if (/\bmoderate\s+confidence\b|\bmedium\s+confidence\b/i.test(note)) {
      level='moderate';label='MODERATE';
    } else if (/\bhigh\s+confidence\b/i.test(note) &&
               !/\b(?:not|without|no)\s+(?:a\s+)?high\s+confidence\b/i.test(note)) {
      level='high';label='HIGH';
    }
    return {
      level,label,type:'MANUAL',
      detail:level==='unrated'
        ? 'No explicit pregame confidence label was recorded for this official selection.'
        : 'Taken from the original pregame risk note; judgment-based, not a validated win probability.'
    };
  }
  function auto(p,sport) {
    const suffix = sport==='nhl'?'Goals':'Points';
    const a=p?.projectedScore?.['team'+suffix], b=p?.projectedScore?.['opponent'+suffix];
    const margin = Number.isInteger(a)&&Number.isInteger(b) ? Math.abs(a-b) : null;
    const match=String(p?.analysis||'').match(/Past result samples:\s*[^,\n]+?\s+(\d+)\s*,\s*[^.\n]+?\s+(\d+)\s*\./i);
    const minimum=match ? Math.min(Number(match[1]),Number(match[2])) : null;
    // A larger projected edge + both teams' historical samples can support a
    // stronger *model signal*, but never a claim of proven high reliability.
    if (margin===null || minimum===null) return {
      level:'unrated',label:'UNRATED',type:'AUTO',
      detail:'The model did not publish enough scoring/sample metadata to assess its signal.'
    };
    const stronger=margin>=3 && minimum>=8;
    return {
      level:stronger?'moderate':'low',
      label:stronger?'MODERATE':'LOW',
      type:'AUTO',
      detail:'Statistical signal only: predicted margin '+margin+'; at least '+minimum+
        ' previous games sampled per team. Not calibrated; excludes confirmed lineups and injuries.'
    };
  }
  function badge(p,sport,isAuto) {
    const r=isAuto?auto(p,sport):manual(p);
    return '<span class="reliability-badge reliability-'+r.level+
      '" title="'+escape(r.detail)+'" aria-label="'+escape('Prediction reliability: '+r.label+'. '+r.detail)+'">'+
      '<span aria-hidden="true">◈</span> '+escape(r.type==='AUTO'?'MODEL SIGNAL':'PREGAME CONFIDENCE')+
      ': '+escape(r.label)+'</span>';
  }
  window.FrozenRootReliability={manual,auto,badge};
})();