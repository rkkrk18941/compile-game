/* WebGL-free tabletop, driven only by the same private seat view as the 3D table. */
const C = window.PD_CARDS;
const COLORS = ['#f0b44c', '#5cc0ff', '#ff7a9a'];
export function createFlatScene(host, opts = {}) {
  const board = document.createElement('div'); board.className = 'flat-board';
  const field = document.createElement('div'); field.className = 'flat-field';
  const windBox = document.createElement('div'); windBox.className = 'flat-wind';
  const seats = document.createElement('div'); seats.className = 'flat-seats';
  const peekBox = document.createElement('div'); peekBox.className = 'flat-peek'; peekBox.hidden = true;
  board.append(field, windBox, seats, peekBox); host.append(board);
  let v = null, title = true, speed = 1, picks = new Set(), mode = 'peek', selected = -1;
  const clone = x => JSON.parse(JSON.stringify(x));
  const pause = ms => new Promise(r => setTimeout(r, ms * speed));
  const cardImage = (value, alt = '') => {
    const img = document.createElement('img'); img.src = value == null ? C.backURL(240) : C.faceURL(value, 320);
    img.alt = alt; img.draggable = false; return img;
  };
  function symbols(n, key) {
    const wrap = document.createElement('div'); wrap.className = 'flat-metal';
    for (let i = 0; i < n + (key ? 1 : 0); i++) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
      const use = document.createElementNS('http://www.w3.org/2000/svg','use');
      use.setAttribute('href', i === n ? '#k' : '#g'); svg.append(use); wrap.append(svg);
    }
    return wrap;
  }
  function draw() {
    board.classList.toggle('is-title', title);
    field.replaceChildren(); windBox.replaceChildren(); seats.replaceChildren();
    if (title || !v) {
      [0,4,1,9,7,6].forEach((value,i) => {
        const img = cardImage(value); img.style.setProperty('--tilt', `${[-9,3,8,-4,7,-7][i]}deg`); field.append(img);
      }); return;
    }
    field.classList.toggle('three-rows', v.n === 3);
    v.slots.forEach((s,i) => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.slot = i;
      btn.className = 'flat-slot'; btn.disabled = !picks.has(i) || s.by >= 0;
      if (s.by >= 0) { btn.classList.add('empty'); btn.setAttribute('aria-hidden','true'); }
      btn.classList.toggle('can-pick', picks.has(i) && s.by < 0); btn.classList.toggle('selected', i === selected);
      btn.setAttribute('aria-label', `場札 ${i+1}${s.open && s.v != null ? `：${s.v}` : ''}を${mode === 'peek' ? '見る' : '取る'}`);
      btn.append(cardImage(s.open ? s.v : null));
      if (!s.open && (s.mine || s.seen?.length)) {
        const badge = document.createElement('span'); badge.className = 'flat-seen';
        badge.textContent = s.mine && s.v != null ? `確認済 ${s.v}` : '確認済'; btn.append(badge);
      }
      btn.onclick = () => opts.onPick?.(i); field.append(btn);
    });
    const windLabel = document.createElement('span'); windLabel.textContent = '風向き';
    windBox.append(cardImage(v.wind, v.wind == null ? '風向き判定カード（裏向き）' : `風向き判定カード ${v.wind}`), windLabel);
    for (let p = 0; p < v.n; p++) {
      const seat = document.createElement('div'); seat.className = `flat-seat seat-${(p-v.me+v.n)%v.n}`; seat.dataset.p = p;
      const hand = document.createElement('div'); hand.className = 'flat-hand';
      v.slots.filter(s=>s.by === p).forEach(s => hand.append(cardImage(p === v.me || s.open || s.recv ? s.v : null)));
      seat.append(hand, symbols(v.players[p].gears, v.key === p)); seats.append(seat);
    }
    board.dataset.players = v.n; opts.onFrame?.();
  }
  function anchors() {
    const r = board.getBoundingClientRect(); const point = (x,y) => ({x:r.width*x,y:r.height*y});
    const out = {seats:[],hands:[],slots:[],dial:null,unused:null}; if (!v) return out;
    for (let p=0;p<v.n;p++) {
      const rel=(p-v.me+v.n)%v.n, x=rel===0||v.n===2 ? .5 : rel===1 ? .25 : .75;
      out.seats[p]=point(x,rel===0?.85:.12); out.hands[p]=point(x,rel===0?.78:.29);
    }
    return out;
  }
  const api = {
    setHost(el) { el.append(board); draw(); }, setTitleMode(on) { title=on; draw(); }, setSpeed(k) { speed=k; }, setSfx() {},
    sync(view) { v=clone(view);title=false;draw(); }, remember(view) { const next=clone(view); if(v?.round===view.round) next.slots.forEach((s,i)=>{ if(s.by>=0 && v.slots[i]?.open) s.open=true; }); v=next; draw(); },
    async deal(view) { api.sync(view); await pause(300); },
    async peek(p,slot,value) {
      if(p === v.me && value != null) { peekBox.replaceChildren(cardImage(value,`場札 ${value}`));peekBox.hidden=false;await pause(1200);peekBox.hidden=true; }
      else await pause(300);
    },
    markSeen(slot,seen,value) { if(v?.slots[slot]) {Object.assign(v.slots[slot],{seen:seen.slice(),mine:value!=null,v:value});draw();} },
    async take(p,slot,value) {Object.assign(v.slots[slot],{by:p,v:value,mine:p===v.me,open:p===v.me});draw();await pause(300);},
    async reveal(list) {for(const s of list)Object.assign(v.slots[s.slot],{v:s.v,open:true});draw();await pause(300);},
    async showHands(hands) {for(const list of Object.values(hands))for(const s of list)Object.assign(v.slots[s.slot],{v:s.v,open:true});draw();await pause(300);},
    async recv(p,slot,value) {Object.assign(v.slots[slot],{by:p,v:value,open:true,recv:true});draw();await pause(300);},
    async wind(value) {v.wind=value;draw();await pause(400);},
    async loseGears(p,count) {v.players[p].gears=Math.max(0,v.players[p].gears-count);draw();await pause(300);},
    async moveKey(p) {v.key=p;draw();await pause(300);},
    setPickable(list,m,sel) {picks=new Set(list||[]);mode=m||'take';selected=sel??-1;draw();},
    anchors, fit() {opts.onFrame?.();}, seatColor:p=>COLORS[p%3],
    dispose() {observer.disconnect();board.remove();}, debug() {return {renderer:'flat',titleMode:title,nSeats:v?.n};}
  };
  const observer=new ResizeObserver(()=>opts.onFrame?.());observer.observe(board);draw();return api;
}
