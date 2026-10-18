/* おばけキャッチ — original-set objects, illustrated card faces and freestanding pieces.
   Reference: Zoch's Geistesblitz product photos and illustrated rules.
   Legacy object/color IDs remain stable; NAME and HEX in deck.js define their visible meaning. */
(function (root, factory) {
  var api = factory(root && root.NR_DECK ? root.NR_DECK : (typeof require === 'function' ? require('./deck.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NR_ART = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';
  var INK = '#282727', W = 250, H = 320, opts = { patterns: false }, uid = 0;
  var ASSET = 'assets/objects-v2.webp';
  // Exact viewports around each sprite, with margin for the hand-drawn motion marks.
  var BOUNDS = { fish: [50,40,440,500], crab: [540,45,490,495], turtle: [1090,22,420,520], chick: [42,575,478,420], pig: [530,560,510,450] };
  function esc(s) { return String(s).replace(/[&"<>]/g, function (x) { return {'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[x]; }); }
  function rgb(hex) { return [1,3,5].map(function (i) { return parseInt(hex.slice(i,i+2),16)/255; }); }
  function defs() {
    var s = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    D.COLORS.forEach(function(c) {
      s += '<filter id="nr-color-'+c+'" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feComponentTransfer>';
      rgb(D.HEX[c]).forEach(function(t,i) {
        // White is an opaque paper-white fill; only the darkest ink survives.
        // Separate tone curves apply to every object, including the color-swapped cards.
        var v = c === 'b' ? [.015,.025,.035,.12,1,1,1,1,1,1,1,1,1,1,1,1,1] :
          c === 'p' ? [.015,.03,.14,.42,.50,.56,.60,.66,.72] :
          [.015,.035,.09,t*.35,t*.58,t*.8,t,t*.87+.13,t*.65+.35];
        s += '<feFunc'+['R','G','B'][i]+' type="table" tableValues="'+v.join(' ')+'"/>';
      });
      // Remove the transparent atlas's faint exterior haze while keeping antialiased ink.
      s += '<feFuncA type="gamma" amplitude="1" exponent="5" offset="0"/></feComponentTransfer></filter>';
    });
    var lines = {r:'<circle cx="3" cy="3" r="1.5" fill="#1b1717"/>',y:'<path d="M0 3H8" stroke="#161b26" stroke-width="1.5"/>',g:'<path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="#142518" stroke-width="1.5"/>',b:'',p:'<path d="M0 4H8M4 0V8" stroke="#292929" stroke-width="1.1"/>'};
    D.COLORS.forEach(function(c) { s += '<pattern id="nr-pat-'+c+'" width="8" height="8" patternUnits="userSpaceOnUse">'+lines[c]+'</pattern>'; });
    return s+'</defs></svg>';
  }
  function sprite(kind) {
    return '<svg x="0" y="0" width="100" height="100" viewBox="'+BOUNDS[kind].join(' ')+'" preserveAspectRatio="xMidYMid meet" overflow="hidden"><image href="'+ASSET+'" x="0" y="0" width="1536" height="1024"/></svg>';
  }
  function animal(kind,c,t) {
    var s = '<g'+(t?' transform="'+t+'"':'')+'><g filter="url(#nr-color-'+c+')">'+sprite(kind)+'</g>';
    if(opts.patterns && c !== 'b') {
      var id = 'nr-mask-'+(++uid);
      s += '<defs><mask id="'+id+'" mask-type="alpha">'+sprite(kind)+'</mask></defs><rect width="100" height="100" fill="url(#nr-pat-'+c+')" opacity=".32" mask="url(#'+id+')"/>';
    }
    return s+'</g>';
  }
  // The objects interact on the card: a book on the ghost, a mouse on the chair, etc.
  var LAYOUT = [
    [[132,190,1.9,0,0],[65,253,.86,-12,0]],
    [[125,208,1.85,0,0],[143,139,1.25,-7,0]],
    [[137,207,1.9,0,0],[112,150,1.8,0,0]],
    [[126,188,2,0,0],[124,192,.98,-5,0]],
    [[124,250,1.8,0,0],[126,145,1.9,-3,0]],
    [[132,65,.94,-5,0],[125,182,2.16,-2,0]],
    [[127,248,1.9,0,0],[128,170,1.4,0,0]],
    [[189,216,1.18,4,0],[100,159,2,-5,0]],
    [[101,162,1.96,-4,0],[165,242,1.17,2,0]],
    [[125,153,2.06,-2,0],[124,232,1.1,-3,0]]
  ];
  function place(p) { return 'translate('+p[0]+' '+p[1]+') rotate('+p[3]+') scale('+(p[4]?-p[2]:p[2])+' '+p[2]+') translate(-50 -50)'; }
  function frame(extra,label) { return '<svg class="nr-card" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg"'+(label?' role="img" aria-label="'+esc(label)+'"':' aria-hidden="true"')+'>'+extra; }
  function cardFace(card,o) {
    o=o||{};
    var id='nr-paper-'+(++uid), L=LAYOUT[card.pair];
    var s=frame('<defs><radialGradient id="'+id+'"><stop stop-color="#fff581"/><stop offset=".7" stop-color="#ffe84a"/><stop offset="1" stop-color="#ffd020"/></radialGradient></defs>',o.label);
    s+='<rect x="1" y="1" width="248" height="318" rx="17" fill="#fffefa" stroke="#ded8cb" stroke-width="2"/>';
    s+='<path d="M24 14Q37 10 53 14L92 12Q109 9 124 13L177 12Q191 10 204 15Q233 10 235 32L236 86L233 124L236 165L234 207L237 257L233 287Q235 309 211 307L163 305L124 309L79 306L43 308Q16 310 16 285L14 245L17 196L14 155L17 111L14 70L16 35Q14 17 24 14Z" fill="url(#'+id+')" stroke="#d4a22c" stroke-width="1.25"/>';
    s+='<ellipse cx="130" cy="268" rx="86" ry="12" fill="#ba8012" opacity=".12"/>';
    // Keep the book visible above the ghost rather than underneath its head.
    if(card.pair===5) s+=animal(card.b,card.cb,place(L[1]))+animal(card.a,card.ca,place(L[0]));
    else s+=animal(card.a,card.ca,place(L[0]))+animal(card.b,card.cb,place(L[1]));
    if(o.no)s+='<text x="224" y="299" text-anchor="end" font-size="11" fill="#826015" font-family="sans-serif">'+card.no+'</text>';
    return s+'</svg>';
  }
  function cardBack() {
    // Plain blue reverse: no pictures, names, logos or decorative marks.
    return frame('') + '<rect x="1" y="1" width="248" height="318" rx="17" fill="#fffefa" stroke="#d9d6cf" stroke-width="2"/><rect x="12" y="12" width="226" height="296" rx="12" fill="#1f285d"/></svg>';
  }
  function piece(kind) {
    return '<svg class="nr-piece" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="60" cy="108" rx="35" ry="5" fill="#403a30" opacity=".16"/>'+animal(kind,D.TRUE_COLOR[kind],'translate(9 4) scale(1.02)')+'</svg>';
  }
  function icon(kind,c) { return '<svg class="nr-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+animal(kind,c||D.TRUE_COLOR[kind])+'</svg>'; }
  return {W:W,H:H,LAYOUT:LAYOUT,INK:INK,animal:animal,cardFace:cardFace,cardBack:cardBack,piece:piece,icon:icon,defs:defs,setPatterns:function(on){opts.patterns=!!on;},patterns:function(){return opts.patterns;}};
});
