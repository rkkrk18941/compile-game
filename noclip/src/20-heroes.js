// ---------------------------------------------------------------------------
// Heroes — an Honor of Kings style roster. A hero is a fixed kit: one gun whose
// magazine refills by itself a few seconds after it runs dry, one melee weapon,
// a passive, and three skills (two basic + an ultimate) on the fanned buttons.
// Weapons and ammo are no longer looted; the pouch still holds consumables.
// ---------------------------------------------------------------------------

// ---- new guns: stat variants that reuse the existing viewmodel builders
Object.assign(be, {
  sniper: { kind: "gun", name: "狙撃銃", dmg: 165, rate: 1.05, spread: 0.0015, pellets: 1, noise: 86, ammo: "762", give: 5, verb: "撃つ", pierce: 1 },
  lmg: { kind: "gun", name: "軽機関銃", dmg: 27, rate: 0.082, spread: 0.038, pellets: 1, noise: 80, ammo: "556", give: 60, verb: "撃つ", auto: !0 },
  spistol: { kind: "gun", name: "消音拳銃", dmg: 42, rate: 0.22, spread: 0.009, pellets: 1, noise: 13, ammo: "9mm", give: 15, verb: "撃つ" },
});
Object.assign(Wn, {
  sniper: { muzzle: [0, 0.055, -0.84], support: [0, 0.03, -0.34], twoHand: !0 },
  lmg: { muzzle: [0, 0.055, -0.72], support: [0, 0.03, -0.36], twoHand: !0 },
  spistol: { muzzle: [0, 0.05, -0.34], twoHand: !1 },
});
Object.assign(Q2, {
  sniper(s) {
    Q2.rifle(s);
    // long fluted barrel + muzzle brake
    s.tube("z", -0.84, -0.6, 0, 0.055, 0.0095, 0.0095, yt.GUN, 0, _t.black, 12);
    s.tube("z", -0.87, -0.83, 0, 0.055, 0.014, 0.014, yt.GUN, 0, _t.gun, 10, 3);
    // scope: tube, bells, turrets
    s.tube("z", -0.26, 0.04, 0, 0.132, 0.0175, 0.0175, yt.GUN, 0, _t.black, 16);
    s.tube("z", -0.33, -0.26, 0, 0.132, 0.026, 0.0175, yt.GUN, 0, _t.black, 16);
    s.tube("z", -0.333, -0.329, 0, 0.132, 0.024, 0.024, yt.GLASS, 0, [0.12, 0.22, 0.3], 16, 1);
    s.tube("z", 0.04, 0.09, 0, 0.132, 0.0175, 0.022, yt.GUN, 0, _t.black, 16);
    s.tube("y", 0.148, 0.165, -0.12, 0, 0.009, 0.009, yt.GUN, 0, _t.gun, 10, 2);
    s.cbox(-0.008, 0.088, -0.2, 0.008, 0.118, -0.18, 0.002, yt.GUN, 0, _t.gun);
    s.cbox(-0.008, 0.088, -0.02, 0.008, 0.118, 0.0, 0.002, yt.GUN, 0, _t.gun);
  },
  lmg(s) {
    Q2.rifle(s);
    s.tube("z", -0.72, -0.58, 0, 0.055, 0.0125, 0.0125, yt.GUN, 0, _t.black, 12);
    s.tube("z", -0.5, -0.36, 0, 0.055, 0.02, 0.02, yt.GUN, 0, _t.gun, 12);
    // box magazine under the receiver
    s.cbox(-0.032, -0.07, -0.16, 0.012, 0.03, -0.04, 0.006, yt.POLY, 0, _t.olive);
    s.cbox(-0.03, -0.072, -0.155, 0.01, -0.064, -0.045, 0.004, yt.GUN, 0, _t.gun);
    // folded bipod legs
    for (const x of [-0.012, 0.012]) s.cbox(x - 0.004, 0.028, -0.6, x + 0.004, 0.036, -0.42, 0.002, yt.GUN, 0, _t.black);
    // carry handle
    s.cbox(-0.006, 0.095, -0.2, 0.006, 0.104, -0.08, 0.002, yt.GUN, 0, _t.black);
  },
  spistol(s) {
    Q2.pistol(s);
    s.tube("z", -0.345, -0.165, 0, 0.05, 0.0155, 0.0155, yt.GUN, 0, _t.black, 14);
    s.tube("z", -0.347, -0.343, 0, 0.05, 0.006, 0.006, F.DARK, 0, _t.hole, 10, 1);
  },
});
Object.assign(qo, { sniper: 5, lmg: 60, spistol: 15 });
Object.assign(wA, { sniper: 2.6, lmg: 3.2, spistol: 1.2 });
Object.assign(wc, {
  sniper: Be('<path d="M1 11h18v2.5H1zM19 12h4"/><path d="M6 13.5l-1 4h2.5l1-4"/><rect x="7" y="7" width="8" height="2.5" rx="1"/><path d="M9 9.5v1.5M13 9.5v1.5"/>'),
  lmg: Be('<path d="M1 10h18v3.5H1zM19 11.5h4"/><rect x="7" y="13.5" width="5" height="4" rx="1"/><path d="M3 13.5l-1 4h2.5M17 13.5l2 5M15 13.5l-2 5"/>'),
  spistol: Be('<path d="M3 8h11v4H9l-1 3H5l1-3H3z"/><path d="M14 9h8v2h-8z"/><path d="M6 15l-1 5h3l1-5"/>'),
});
// No weapon/ammo loot any more: crates and floors drop consumables or money.
Y1 = (s) => $1(s);
s_ = (s) => $1(s);

// ---- skills
const heroIcon = (d) => Os(d);
Object.assign(Gr, {
  shockwave: {
    name: "衝撃波", desc: "前方の怪物を吹き飛ばして気絶させ、薄い壁を砕く", cd: 13,
    icon: heroIcon('<path d="M4 12h3M17 12h3"/><path d="M8 7a7 7 0 000 10M16 7a7 7 0 010 10"/><path d="M5 4a12 12 0 000 16M19 4a12 12 0 010 16"/>'),
  },
  cloak: {
    name: "光学迷彩", desc: "7秒間、怪物から見えなくなる。攻撃すると解ける", cd: 24,
    icon: heroIcon('<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" stroke-dasharray="3 2.5"/><circle cx="12" cy="12" r="2.5"/>'),
  },
  silence: {
    name: "静寂", ult: !0, desc: "9秒間、姿も足音も消え足が速くなる。周囲の怪物は見失って立ち尽くす", cd: 70,
    icon: heroIcon('<path d="M12 3a9 9 0 100 18 9 9 0 000-18z"/><path d="M7 15c1.5-1 3-1 5 0s3.5 1 5 0M9 9.5h.01M15 9.5h.01"/>'),
  },
  flareshot: {
    name: "照明弾", desc: "遠くまで飛ぶ発炎筒。暗がりの怪物を退け、周りを照らす", cd: 15,
    icon: heroIcon('<path d="M5 19l9-9"/><path d="M14 10c-1-4 3-7 3-7s4 3 2 8c-1 2-3 2-5-1z"/><path d="M4 14l2 2"/>'),
  },
  mine: {
    name: "感知地雷", desc: "足元に設置。怪物が近づくと炸裂する（最大3個）", cd: 16,
    icon: heroIcon('<ellipse cx="12" cy="15" rx="8" ry="3.5"/><path d="M4 15v-2c0-2 3.6-3.5 8-3.5s8 1.5 8 3.5v2"/><path d="M12 9.5V6M10 4h4"/>'),
  },
  healfield: {
    name: "救護フィールド", desc: "8秒間、範囲内の仲間と自分の体力を回復し続ける", cd: 22,
    icon: heroIcon('<circle cx="12" cy="12" r="9" stroke-dasharray="2.5 2.5"/><path d="M12 8v8M8 12h8"/>'),
  },
  revivepulse: {
    name: "蘇生の光", ult: !0, desc: "体力とスタミナを全快し、近くで倒れた仲間を蘇らせ、瘴気を払う", cd: 80,
    icon: heroIcon('<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/><path d="M12 3V1M4 5L2.5 3.5M20 5l1.5-1.5"/>'),
  },
  shield: {
    name: "防護盾", desc: "6秒間、受けるダメージを7割減らし、足止めも効かない", cd: 20,
    icon: heroIcon('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 7v10"/>'),
  },
  charge: {
    name: "突進", desc: "前方へ体当たり。ぶつかった怪物を吹き飛ばし、壁を突き破る", cd: 12,
    icon: heroIcon('<path d="M3 12h11"/><path d="M10 7l5 5-5 5"/><path d="M18 5v14M21 7v10"/>'),
  },
  turret: {
    name: "自動銃座", ult: !0, desc: "22秒間、近づく怪物を自動で撃ち続ける銃座を設置", cd: 70,
    icon: heroIcon('<path d="M12 13l-5 8M12 13l5 8M12 13v8"/><rect x="7" y="7" width="10" height="6" rx="1.5"/><path d="M17 9.5h5"/>'),
  },
  incendiary: {
    name: "焼夷手榴弾", desc: "着地点を9秒間燃やす炎の海にする", cd: 16,
    icon: heroIcon('<path d="M12 22c-4 0-6-2.6-6-6 0-4 4-6 4-10 3 2 4 5 4 7 1-1 1.5-2 1.5-3 2 2 2.5 4 2.5 6 0 3.4-2 6-6 6z"/>'),
  },
  purge: {
    name: "浄化", ult: !0, desc: "瘴気を大きく打ち消し、周囲の怪物を焼き払って気絶させる", cd: 80,
    icon: heroIcon('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>'),
  },
  sneak: {
    name: "忍び足", desc: "10秒間、足音がほぼ消え、見つかりにくくなる", cd: 18,
    icon: heroIcon('<path d="M7 19c-2 0-3-1.5-3-3 0-2 1.5-3 3-3s2.5 1.5 2.5 3-1 3-2.5 3zM16 13c-1.8 0-3-1.4-3-3s1.2-4 3-4 3 2 3 4-1.2 3-3 3z"/><path d="M5 9h.01M9 7h.01M14 3h.01M19 4h.01"/>'),
  },
  adrenaline: {
    name: "火事場の馬鹿力", ult: !0, desc: "12秒間、足が速くなり、殴る力が倍以上になり、疲れない", cd: 55,
    icon: heroIcon('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/><path d="M3 4l2 2M21 4l-2 2"/>'),
  },
});

const HERO_LIST = [
  {
    id: "minato", name: "ミナト", title: "第七潜行班・突撃兵", role: "突撃", color: "#e0b84a", price: 0, diff: 1,
    desc: "撃って、投げて、押し通る。迷ったらこの人。銃も手榴弾も素直で扱いやすい。",
    weapon: "rifle", melee: "knife", mag: 30, recharge: 6,
    stats: { maxHp: 120, maxStamina: 110, speedMul: 1, gunMul: 1.1 }, rechargeMul: 0.85,
    passive: { name: "戦場勘", desc: "銃のダメージ+10%、弾の充填が15%早い" },
    skills: ["frag", "stim", "rage"], items: { bandage: 2, water: 1 },
    bars: { hp: 0.66, mob: 0.55, fire: 0.75, brk: 0.45 },
  },
  {
    id: "haruka", name: "ハルカ", title: "救護班・衛生兵", role: "支援", color: "#6fd3a8", price: 0, diff: 2,
    desc: "仲間を生かす人。回復の場と閃光で、崩れかけた隊を立て直す。ひとりでも粘り強い。",
    weapon: "smg", melee: "crowbar", mag: 32, recharge: 5,
    stats: { maxHp: 105, maxStamina: 110, speedMul: 1.03, healMul: 1.5, regenCap: 0.8 },
    passive: { name: "応急手当", desc: "回復アイテムの効果+50%。何もしなくても体力が8割まで戻る" },
    skills: ["healfield", "flash", "revivepulse"], items: { medkit: 1, bandage: 4 },
    bars: { hp: 0.58, mob: 0.6, fire: 0.55, brk: 0.3 },
  },
  {
    id: "nanashi", name: "ナナシ", title: "迷い込んだ一般人", role: "生存", color: "#c9c3b4", price: 0, diff: 3,
    desc: "銃はない。鉄パイプと逃げ足だけ。見つからないことが最大の武器で、持ち帰るお金は多い。",
    weapon: null, melee: "pipe", mag: 0, recharge: 0,
    stats: { maxHp: 100, maxStamina: 145, speedMul: 1.08, moneyMul: 1.4, noiseMul: 0.85 }, pouchBonus: 2,
    passive: { name: "拾い屋", desc: "拾うお金が1.4倍。持ち物枠+2。足音が少し静か" },
    skills: ["sneak", "decoy", "adrenaline"], items: { bandage: 2, water: 2, energy: 1 },
    bars: { hp: 0.55, mob: 0.85, fire: 0.15, brk: 0.35 },
  },
  {
    id: "shino", name: "シノ", title: "偵察班・斥候", role: "潜入", color: "#8aa7ff", price: 40000, diff: 3,
    desc: "音を立てずに先へ進む。消音拳銃と光学迷彩で、怪物の脇をすり抜けて階段を探す。",
    weapon: "spistol", melee: "machete", mag: 15, recharge: 4,
    stats: { maxHp: 90, maxStamina: 130, speedMul: 1.12, noiseMul: 0.6, visMul: 0.8 },
    passive: { name: "忍び", desc: "足音-40%、見つかりにくい。足が速い" },
    skills: ["sonar", "cloak", "silence"], items: { bandage: 2, energy: 1, buzzer: 1 },
    bars: { hp: 0.45, mob: 0.95, fire: 0.45, brk: 0.3 },
  },
  {
    id: "kagura", name: "カグラ", title: "解体業者・工兵", role: "破壊", color: "#ff8a4c", price: 60000, diff: 2,
    desc: "道がなければ作る。ハンマーと爆薬で壁ごと突き抜ける。散弾銃は近くで最強。",
    weapon: "shotgun", melee: "hammer", mag: 8, recharge: 5,
    stats: { maxHp: 140, maxStamina: 100, speedMul: 0.96, dmgTaken: 0.9, wallMul: 2.5 },
    passive: { name: "破壊屋", desc: "壁へのダメージ2.5倍。受けるダメージ-10%" },
    skills: ["breach", "shockwave", "thermite"], items: { bandage: 2, bomb: 1 },
    bars: { hp: 0.78, mob: 0.45, fire: 0.7, brk: 1 },
  },
  {
    id: "rei", name: "レイ", title: "狙撃班・射手", role: "射手", color: "#d6e2ff", price: 90000, diff: 3,
    desc: "一発で終わらせる。狙撃銃は5発、頭に当てれば大物も沈む。罠と照明で間合いを作る。",
    weapon: "sniper", melee: "knife", mag: 5, recharge: 7,
    stats: { maxHp: 95, maxStamina: 100, speedMul: 1, headMul: 2.4 },
    passive: { name: "鷹の目", desc: "頭への命中ダメージ2.4倍（通常1.7倍）" },
    skills: ["flareshot", "mine", "barrage"], items: { bandage: 2, flare: 1 },
    bars: { hp: 0.5, mob: 0.55, fire: 0.9, brk: 0.5 },
  },
  {
    id: "yuzu", name: "ユズ", title: "除染班・化学兵", role: "制圧", color: "#b9d65a", price: 120000, diff: 2,
    desc: "瘴気の専門家。榴弾と炎で群れを焼き、浄化で一気に空気を取り戻す。",
    weapon: "launcher", melee: "crowbar", mag: 4, recharge: 10,
    stats: { maxHp: 110, maxStamina: 100, speedMul: 1, miasmaRes: 0.35, blastMul: 0.4 },
    passive: { name: "耐瘴体質", desc: "瘴気の害-35%。自分の爆発で受けるダメージ-60%" },
    skills: ["gas", "incendiary", "purge"], items: { gas: 2, bandage: 2 },
    bars: { hp: 0.6, mob: 0.5, fire: 0.85, brk: 0.8 },
  },
  {
    id: "gou", name: "ゴウ", title: "重装班・盾役", role: "重装", color: "#a58cff", price: 160000, diff: 1,
    desc: "歩く壁。重い機関銃を60発撃ち続け、盾と体当たりで仲間の前に立つ。",
    weapon: "lmg", melee: "axe", mag: 60, recharge: 9,
    stats: { maxHp: 175, maxStamina: 90, speedMul: 0.9, dmgTaken: 0.8, slowCap: 0.45 },
    passive: { name: "鉄壁", desc: "受けるダメージ-20%。足止めされても半分までしか遅くならない" },
    skills: ["shield", "charge", "turret"], items: { bandage: 3 },
    bars: { hp: 1, mob: 0.35, fire: 0.85, brk: 0.7 },
  },
];
const HEROES = Object.fromEntries(HERO_LIST.map((h) => [h.id, h]));
const heroOf = (id) => HEROES[id] || HERO_LIST[0];

// ---- meta: hero unlocks + the run loadout a hero produces
Object.assign(xp.prototype, {
  heroUnlocked(id) {
    const h = HEROES[id];
    return !!h && (h.price === 0 || (this.m.heroes || []).includes(id));
  },
  unlockHero(id) {
    const h = HEROES[id];
    if (!h) return !1;
    if (this.heroUnlocked(id)) return !0;
    if (this.m.bank < h.price) return !1;
    this.m.bank -= h.price;
    (this.m.heroes || (this.m.heroes = [])).push(id);
    this.save();
    return !0;
  },
  heroLoadout(id) {
    const h = heroOf(id),
      up = this.stats();
    const stats = {
      ...h.stats,
      maxHp: h.stats.maxHp + 20 * this.level("hp"),
      maxStamina: h.stats.maxStamina,
      miasmaRes: Math.min(0.9, (h.stats.miasmaRes || 0) + up.miasmaRes),
    };
    return {
      mode: "hero",
      hero: h.id,
      pouchSize: this.pouchSize() + (h.pouchBonus || 0),
      stats,
      weapons: [h.weapon, h.melee].filter(Boolean),
      gun: h.weapon ? { type: h.weapon, mag: h.mag, recharge: h.recharge * (h.rechargeMul || 1) } : null,
      ammo: {},
      items: Object.entries(h.items || {}),
      skills: h.skills.slice(),
      armor: null,
    };
  },
});
delete ex.cap;

// ---- items: the inventory a hero starts with; tap the weapon button to swap gun/melee
{
  const onNewRun = Rd.prototype.onNewRun;
  Rd.prototype.onNewRun = function () {
    const lo = this.game.loadout;
    if (!lo || lo.mode !== "hero") return onNewRun.call(this);
    this.inv = {
      weapons: [null, null],
      wsel: 0,
      ammo: { "9mm": 0, 357: 0, "12g": 0, 556: 0, "40mm": 0, 762: 0 },
      pouch: new Array(lo.pouchSize).fill(null),
    };
    lo.weapons.forEach((type, i) => {
      const w = { type };
      if (lo.gun && type === lo.gun.type) Object.assign(w, { mag: lo.gun.mag, magMax: lo.gun.mag, recharge: lo.gun.recharge });
      this.inv.weapons[i] = w;
    });
    for (const [t, n] of lo.items || []) this.addConsumable(t, n, !0);
    this.use = null;
    this.buildPouchUI();
    this.renderAll();
    this.game.combat && this.game.combat.onEquip(this.equipped());
  };
  const cycleWeapon = Rd.prototype.cycleWeapon;
  Rd.prototype.cycleWeapon = function () {
    const lo = this.game.loadout;
    if (!lo || lo.mode !== "hero") return cycleWeapon.call(this);
    const inv = this.inv,
      next = inv.wsel === 0 && inv.weapons[1] ? 1 : 0;
    if (next === inv.wsel || !inv.weapons[next]) return;
    inv.wsel = next;
    this.renderAll();
    this.game.combat && this.game.combat.onEquip(this.equipped());
    this.game.audio && this.game.audio.sfx("rack", { vol: 0.35, rate: 1.4 });
  };
  const renderWeapons = Rd.prototype.renderWeapons;
  Rd.prototype.renderWeapons = function () {
    const lo = this.game.loadout;
    if (!lo || lo.mode !== "hero") return renderWeapons.call(this);
    const inv = this.inv;
    if (!inv) return;
    const cur = this.equipped(),
      def = cur ? be[cur.type] : e_,
      gun = inv.weapons.find((w) => w && w.magMax),
      icon = document.getElementById("atk-icon");
    icon && (icon.innerHTML = i_[cur ? def.kind : "fist"] || i_.melee);
    const atk = document.getElementById("btn-attack");
    if (atk) {
      let am = atk.querySelector(".ammo"),
        ring = atk.querySelector(".ring");
      am || ((am = document.createElement("span")), (am.className = "ammo"), atk.appendChild(am));
      ring || ((ring = document.createElement("i")), (ring.className = "ring"), atk.appendChild(ring));
      am.textContent = cur && cur.magMax ? `${cur.mag}/${cur.magMax}` : "";
    }
    const btn = this.weaponBtn;
    if (btn) {
      const other = inv.weapons[inv.wsel === 0 ? 1 : 0],
        cnt = gun && gun !== cur ? `${gun.mag}<small>/${gun.magMax}</small>` : "";
      btn.innerHTML =
        (other ? wc[other.type] || "" : "") +
        (cnt ? `<span class="cnt">${cnt}</span>` : "") +
        `<span class="wdots">${inv.weapons.filter(Boolean).map((w, i) => `<i class="${i === inv.wsel ? "on" : ""}"></i>`).join("")}</span>`;
      btn.classList.toggle("single", !other);
      btn.style.display = other ? "" : "none";
      btn.setAttribute("aria-label", other ? `${be[other.type].name}に持ち替える（今: ${def.name}）` : def.name);
    }
  };
}

// ---- combat: guns never use reserve ammo; an empty magazine recharges on a timer
{
  const P = Id.prototype;
  P.gunItem = function () {
    const inv = this.game.items && this.game.items.inv;
    return inv ? inv.weapons.find((w) => w && w.magMax) : null;
  };
  P.startRecharge = function (manual) {
    const g = this.game,
      w = this.gunItem();
    if (!w || this.recharge || w.mag >= w.magMax) return;
    const p = g.player,
      frac = 1,
      dur = Math.max(0.6, w.recharge * frac) / (p.buffs.adren > 0 ? 1.3 : 1);
    this.recharge = { t: 0, dur, w, s1: !1, s2: !1 };
    g.audio && g.audio.sfx("mag_out", { vol: 0.5 });
    manual && g.feed(`弾を充填（${dur.toFixed(1)}秒）`);
  };
  P.updateRecharge = function (dt) {
    const r = this.recharge,
      g = this.game;
    r.t += dt;
    const f = r.t / r.dur;
    if (!r.s1 && f > 0.55) (r.s1 = !0), g.audio && g.audio.sfx("mag_in", { vol: 0.55 });
    if (!r.s2 && f > 0.86) (r.s2 = !0), g.audio && g.audio.sfx("rack", { vol: 0.45 });
    if (r.t >= r.dur) {
      r.w.mag = r.w.magMax;
      this.recharge = null;
      g.items.renderWeapons();
    }
  };
  const update = P.update;
  P.update = function (dt) {
    const g = this.game;
    if (!(g.loadout && g.loadout.mode === "hero")) return update.call(this, dt);
    this.recharge && this.updateRecharge(dt);
    if (g.input.take("reload")) this.startRecharge(!0);
    this.autoReloadT = 0;
    this.reload = null;
    const cur = g.items.equipped(),
      rc = !!(this.recharge && cur === this.recharge.w);
    document.body.classList.toggle("recharging", rc);
    if (this.recharge) {
      const atk = document.getElementById("btn-attack");
      atk && atk.style.setProperty("--p", Math.min(1, this.recharge.t / this.recharge.dur).toFixed(3));
    }
    update.call(this, dt);
  };
  const attack = P.attack;
  P.attack = function () {
    const g = this.game;
    if (!(g.loadout && g.loadout.mode === "hero")) return attack.call(this);
    g.skills && g.skills.breakStealth();
    const cur = g.items.equipped(),
      def = this.def();
    if (def.kind === "melee" || !cur || !cur.magMax) return attack.call(this);
    if (!cur.mag || (this.recharge && this.recharge.w === cur)) {
      this.cool = 0.3;
      this.recharge || this.startRecharge(!1);
      g.audio && g.audio.sfx("click", { vol: 0.6 });
      return;
    }
    cur.mag--;
    this.cool = def.rate;
    this.anim = 0;
    this.animDur = Math.max(0.12, Math.min(def.rate, 0.5));
    this.animKind = "recoil";
    def.kind === "launcher" ? this.fireLauncher(def) : this.fire(def, cur.type);
    g.items.renderWeapons();
    cur.mag || this.startRecharge(!1);
  };
  const startReload = P.startReload;
  P.startReload = function (manual) {
    const g = this.game;
    if (g.loadout && g.loadout.mode === "hero") return this.startRecharge(!!manual);
    return startReload.call(this, manual);
  };
  const onNewRun = P.onNewRun;
  P.onNewRun = function () {
    this.recharge = null;
    document.body.classList.remove("recharging");
    return onNewRun.call(this);
  };
  // wall damage scales with the hero's demolition passive
  const damageWall = P.damageWall;
  P.damageWall = function (edge, v, dmg, p, n, noise, o = {}) {
    const m = (!o.remote && this.game.player.stats.wallMul) || 1;
    return damageWall.call(this, edge, v, dmg * m, p, n, noise, o);
  };
}
// sniper rounds punch through the first monster
{
  const raycast = Vd.prototype.raycast;
  Vd.prototype.raycastAll = function (o, d, max) {
    const hits = [],
      skip = new Set();
    for (let i = 0; i < 3; i++) {
      const saved = [];
      for (const m of skip) saved.push([m, m.dead]), (m.dead = !0);
      const h = raycast.call(this, o, d, max);
      for (const [m, dd] of saved) m.dead = dd;
      if (!h) break;
      hits.push(h);
      skip.add(h.m);
    }
    return hits;
  };
}

// ---- audio: sounds for the new kit
{
  const gen = Ed.prototype.gen;
  Ed.prototype.gen = function () {
    gen.call(this);
    const b = this.bufs,
      env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
    b.sniper = [0, 1].map(() =>
      this.mk(1.8, (out, n, sr) => {
        const lp = new ce(sr, 8e3),
          lo = new ce(sr, 700);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          out[i] =
            lp.run(At()) * env(t, 3e-4, 0.02) * 2.8 +
            Math.sin(2 * Math.PI * (95 - t * 60) * t) * env(t, 0.001, 0.12) * 1.8 +
            lo.run(At()) * env(t, 0.02, 0.6) * 0.9;
        }
      }),
    );
    b.lmg = b.rifle;
    b.spistol = [0, 1].map(() =>
      this.mk(0.35, (out, n, sr) => {
        const bp = new _e(sr);
        bp.set(1900, 1.4);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          out[i] = bp.run(At())[1] * env(t, 3e-4, 0.012) * 1.4 + Math.sin(2 * Math.PI * 220 * t) * env(t, 5e-4, 0.02) * 0.3;
        }
      }),
    );
    b.whoosh = [
      this.mk(0.9, (out, n, sr) => {
        const bp = new _e(sr);
        for (let i = 0; i < n; i++) {
          const t = i / sr,
            k = Math.sin(Math.PI * Math.min(1, t / 0.9));
          bp.set(300 + 2200 * k, 1.3);
          out[i] = bp.run(At())[1] * k * k;
        }
      }),
    ];
    b.heal = [
      this.mk(1.6, (out, n, sr) => {
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          let v = 0;
          [523.3, 659.3, 784, 1046.5].forEach((f, k) => {
            const u = t - k * 0.09;
            u > 0 && (v += Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 2.2) * 0.25);
          });
          out[i] = v;
        }
      }),
    ];
    b.shieldhum = [
      this.mk(1.2, (out, n, sr) => {
        let ph = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          ph += (140 + 60 * Math.min(1, t * 4)) / sr;
          out[i] = (Math.sin(2 * Math.PI * ph) + 0.4 * Math.sin(6 * Math.PI * ph)) * env(t, 0.05, 0.5);
        }
      }),
    ];
    b.burn = this.mk(3, (out, n, sr) => {
      const lp = new ce(sr, 900);
      for (let i = 0; i < n; i++) {
        const t = i / sr,
          crack = Math.random() < 0.004 ? At() * 3 : 0;
        out[i] = lp.run(At()) * (0.7 + 0.3 * Math.sin(t * 7)) + crack;
      }
    });
  };
}

// ---- monsters respect cloak / silence / sneak
{
  const V = Vd.prototype,
    canSee = V.canSee;
  V.canSee = function (m, d, dx, dz) {
    const g = this.game,
      tgt = this.T || g.player;
    if (tgt === g.player && (g.player.visMul ?? 1) <= 0.01 && d > 1.3) return !1;
    return canSee.call(this, m, d, dx, dz);
  };
  V.visOf = function (t) {
    return t.remote ? t.vis : this.vis * (this.game.player.visMul ?? 1);
  };
}
{
  const upd = _d.prototype.update;
  _d.prototype.update = function (dt, input, map) {
    upd.call(this, dt, input, map);
    this.noise *= this.noiseMul ?? 1;
  };
}

// ---- hero skills
{
  const K = Kd.prototype,
    baseUse = K.use,
    baseUpdate = K.update,
    baseRender = K.render,
    baseNewRun = K.onNewRun;

  K.onNewRun = function () {
    const g = this.game,
      lo = g.loadout;
    this.clearHeroFx && this.clearHeroFx();
    if (!lo || lo.mode !== "hero") {
      document.body.classList.remove("hero");
      return baseNewRun.call(this);
    }
    this.slots = lo.skills.slice(0, 3);
    this.cd = [0, 0, 0];
    this.pending = [];
    this.sonarT = 0;
    this.rageT = 0;
    this.eff = {};
    this.mines = [];
    this.turrets = [];
    this.fields = [];
    this.fires = [];
    this.dash = null;
    this.base = { ...g.player.stats };
    document.body.classList.add("sf", "hero");
    this.render(!0);
  };
  K.clearHeroFx = function () {
    const g = this.game;
    for (const m of this.mines || []) g.scene.remove(m.mesh);
    for (const t of this.turrets || []) g.scene.remove(t.mesh);
    for (const f of this.fires || []) f.light && g.removePersistentLight(f.light);
    for (const f of this.fields || []) f.light && g.removePersistentLight(f.light);
    this.mines = [];
    this.turrets = [];
    this.fires = [];
    this.fields = [];
    this.eff = {};
    this.dash = null;
    document.body.classList.remove("cloaked", "shielded");
  };
  K.onFloorExit = function () {
    this.clearHeroFx();
    this.game.player && this.applyMods && this.applyMods();
  };
  K.breakStealth = function () {
    const e = this.eff;
    if (e && e.cloak > 0) (e.cloak = 0), this.game.feed("迷彩が解けた", "#8aa7ff");
  };
  // stat multipliers from active effects, rebuilt every frame on top of the hero's base
  K.applyMods = function () {
    const g = this.game,
      p = g.player,
      b = this.base || p.stats,
      e = this.eff || {};
    let speed = 1, melee = 1, gun = 1, taken = 1, noise = b.noiseMul ?? 1, vis = b.visMul ?? 1;
    if (e.rage > 0) (speed *= 1.35), (melee *= 1.6), (gun *= 1.6), (taken *= 0.5);
    if (e.adren > 0) (speed *= 1.3), (melee *= 2.2), (gun *= 1.2), (taken *= 0.65);
    if (e.shield > 0) taken *= 0.3;
    if (e.sneak > 0) (noise *= 0.15), (vis *= 0.5), (speed *= 1.12);
    if (e.cloak > 0) (vis = 0), (noise *= 0.35);
    if (e.silence > 0) (vis = 0), (noise = 0), (speed *= 1.25);
    p.stats.speedMul = (b.speedMul ?? 1) * speed;
    p.stats.meleeMul = (b.meleeMul ?? 1) * melee;
    p.stats.gunMul = (b.gunMul ?? 1) * gun;
    p.stats.dmgTaken = (b.dmgTaken ?? 1) * taken;
    p.noiseMul = noise;
    p.visMul = vis;
    if (e.shield > 0) p.slow = 0;
    if (e.rage > 0 || e.adren > 0) (p.buffs.adren = Math.max(p.buffs.adren, 0.2)), (p.stamina = Math.max(p.stamina, p.stats.maxStamina * 0.5));
    document.body.classList.toggle("cloaked", e.cloak > 0 || e.silence > 0);
    document.body.classList.toggle("shielded", e.shield > 0);
  };

  K.use = function (i) {
    const g = this.game,
      lo = g.loadout;
    if (!lo || lo.mode !== "hero") return baseUse.call(this, i);
    const p = g.player,
      id = this.slots[i];
    if (!id || p.dead || g.state !== "play") return;
    if (this.cd[i] > 0) {
      g.audio && g.audio.sfx("click", { vol: 0.5 });
      return;
    }
    const fn = HERO_SKILL_FX[id];
    let ok;
    if (fn) ok = fn.call(this, g, p);
    else {
      // the original special-forces skills
      const cd = this.cd[i];
      baseUse.call(this, i);
      ok = this.cd[i] !== cd;
      if (!ok) return;
    }
    if (ok === !1) return;
    this.cd[i] = Gr[id].cd;
    id !== "cloak" && id !== "sneak" && id !== "silence" && this.breakStealth();
    this.render(!0);
  };

  K.update = function (dt) {
    const g = this.game,
      lo = g.loadout;
    if (!lo || lo.mode !== "hero") return baseUpdate.call(this, dt);
    baseUpdate.call(this, dt);
    const e = this.eff;
    for (const k in e) {
      if (e[k] > 0) {
        e[k] -= dt;
        if (e[k] <= 0) {
          e[k] = 0;
          const end = { rage: "オーバードライブ終了", adren: "力が抜けた", shield: "盾が消えた", cloak: "迷彩が切れた", silence: "静寂が終わった", sneak: "忍び足が終わった" }[k];
          end && g.feed(end);
        }
      }
    }
    this.applyMods();
    this.dash && this.updateDash(dt);
    this.updateMines(dt);
    this.updateTurrets(dt);
    this.updateFields(dt);
    this.updateFires(dt);
  };

  K.render = function (force) {
    baseRender.call(this, force);
    for (let i = 0; i < 3; i++) {
      const b = this.btns[i];
      b && b.classList.toggle("ready", !!this.slots[i] && this.cd[i] <= 0);
    }
  };

  // -- dash
  K.updateDash = function (dt) {
    const g = this.game,
      p = g.player,
      d = this.dash,
      map = g.fs.map;
    d.t += dt;
    const step = Math.min(dt, 0.03),
      v = 15;
    const ahead = ni(map, p.pos.x, p.pos.z, d.dx, d.dz, 0.8, "move");
    if (ahead.kind === "wall" && ahead.dist < 0.55 && !d.broke) {
      d.broke = !0;
      const hit = { x: p.pos.x + d.dx * ahead.dist, y: 1.1, z: p.pos.z + d.dz * ahead.dist };
      g.combat.damageWall(ahead.edge, ahead.value, 9, hit, { x: ahead.nx, y: 0, z: ahead.nz }, 70, {});
      p.shake = Math.max(p.shake, 0.9);
    }
    const q = { x: p.pos.x + d.dx * v * step, z: p.pos.z + d.dz * v * step };
    yc(map, q, p.radius);
    p.pos.x = q.x;
    p.pos.z = q.z;
    p.vel.x = d.dx * v;
    p.vel.z = d.dz * v;
    if (g.monsters)
      for (const m of g.monsters.list) {
        if (m.dead || d.hit.has(m)) continue;
        const ox = m.pos.x - p.pos.x,
          oz = m.pos.z - p.pos.z,
          dist = Math.hypot(ox, oz);
        if (dist < 1.3 + (m.def.radius || 0.4)) {
          d.hit.add(m);
          g.monsters.damage(m, 70, p.pos, "melee", { stun: 1.8 });
          if (!m.remote && m.def.behavior !== "boss") {
            const k = { x: m.pos.x + d.dx * 2.2, z: m.pos.z + d.dz * 2.2 };
            yc(map, k, m.def.radius || 0.4);
            m.pos.x = k.x;
            m.pos.z = k.z;
          }
          g.combat.blood(m.pos.x, (m.def.height || 1.6) * 0.6, m.pos.z, 10, m.def.blood);
          g.audio && g.audio.sfx("hit_flesh", { vol: 1, rate: 0.7 });
          p.shake = Math.max(p.shake, 0.6);
        }
      }
    if (d.t >= 0.38) this.dash = null;
  };

  // -- mines
  K.updateMines = function (dt) {
    const g = this.game;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.t += dt;
      m.led.visible = m.t < 1.2 ? Math.sin(m.t * 20) > 0 : Math.sin(m.t * 6) > 0.6;
      if (m.t < 1.2 || !g.monsters) continue;
      const trig = g.monsters.list.some(
        (o) => !o.dead && o.def.behavior !== "flyer" && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 2.3 + (o.def.radius || 0.4),
      );
      if (trig) {
        g.scene.remove(m.mesh);
        this.mines.splice(i, 1);
        g.combat.explode(m.pos.clone(), 4.6, 320, { selfMul: 0.2 });
      }
    }
  };

  // -- turrets
  K.updateTurrets = function (dt) {
    const g = this.game,
      map = g.fs && g.fs.map;
    if (!map) return;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.t += dt;
      t.cool -= dt;
      if (t.t > t.life) {
        g.scene.remove(t.mesh);
        this.turrets.splice(i, 1);
        g.feed("銃座が止まった");
        continue;
      }
      let best = null,
        bd = 20;
      if (g.monsters)
        for (const m of g.monsters.list) {
          if (m.dead) continue;
          const d = Math.hypot(m.pos.x - t.pos.x, m.pos.z - t.pos.z);
          if (d < bd && nn(map, t.pos.x, t.pos.z, m.pos.x, m.pos.z)) (bd = d), (best = m);
        }
      const head = t.mesh.userData.head;
      if (best) {
        const want = Math.atan2(-(best.pos.x - t.pos.x), -(best.pos.z - t.pos.z));
        let dy = want - t.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        t.yaw += dy * Math.min(1, dt * 10);
        if (Math.abs(dy) < 0.25 && t.cool <= 0) {
          t.cool = 0.11;
          const y = (best.pos.y || 0) + (best.def.height || 1.6) * 0.6;
          g.monsters.damage(best, 15, t.pos, "shot");
          const mx = t.pos.x - Math.sin(t.yaw) * 0.55,
            mz = t.pos.z - Math.cos(t.yaw) * 0.55;
          for (let k = 0; k < 5; k++) {
            const f = k / 5;
            g.combat.add.spawn(mx + (best.pos.x - mx) * f, 1.05 + (y - 1.05) * f, mz + (best.pos.z - mz) * f, 0, 0, 0, 1, 0.75, 0.4, 1, 3, 0.05);
          }
          g.combat.blood(best.pos.x, y, best.pos.z, 3, best.def.blood);
          g.addLight(new L(mx, 1.1, mz), [1, 0.7, 0.35], 4, 6, 0.05);
          g.audio && g.audio.sfx("smg", { pos: t.pos, vol: 0.55, range: 50, vary: 0.1 });
          g.emitNoise(t.pos.x, t.pos.z, 40, "gun", !0);
        }
      } else t.yaw += dt * 0.6;
      head.rotation.y = t.yaw;
    }
  };

  // -- heal fields
  K.updateFields = function (dt) {
    const g = this.game,
      p = g.player;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.t += dt;
      f.netT -= dt;
      if (f.t > f.life) {
        f.light && g.removePersistentLight(f.light);
        this.fields.splice(i, 1);
        continue;
      }
      if (!p.dead && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < f.r) p.hp = Math.min(p.maxHp, p.hp + f.rate * dt);
      if (f.netT <= 0 && g.isMulti()) (f.netT = 1), g.net.fx(g.fs.depth, "heal", f.pos, { r: f.r, amt: f.rate });
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2,
          r = f.r * Math.sqrt(Math.random());
        g.combat.add.spawn(f.pos.x + Math.cos(a) * r, 0.05, f.pos.z + Math.sin(a) * r, 0, 0.6 + Math.random() * 0.6, 0, 0.35, 1, 0.6, 1, 4, 0.9, -0.1);
      }
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        g.combat.add.spawn(f.pos.x + Math.cos(a) * f.r, 0.05, f.pos.z + Math.sin(a) * f.r, 0, 0.3, 0, 0.35, 1, 0.6, 1, 5, 0.6, 0);
      }
    }
  };

  // -- fire pools
  K.updateFires = function (dt) {
    const g = this.game,
      p = g.player;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      f.tick -= dt;
      const k = Math.min(1, (f.life - f.t) / 1.5);
      if (f.light) (f.light.i = (2.4 + Math.random() * 0.9) * k), f.light.pos.set(f.pos.x, 0.8, f.pos.z);
      if (f.t > f.life) {
        f.light && g.removePersistentLight(f.light);
        f.snd && f.snd.src.stop();
        this.fires.splice(i, 1);
        continue;
      }
      for (let n = 0; n < 3; n++)
        if (Math.random() < dt * 30 * k) {
          const a = Math.random() * Math.PI * 2,
            r = f.r * Math.sqrt(Math.random());
          g.combat.add.spawn(f.pos.x + Math.cos(a) * r, 0.05, f.pos.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4, 1, 0.42 + Math.random() * 0.25, 0.08, 1, 9, 0.55, -1.5, 0.6);
        }
      Math.random() < dt * 6 * k && g.combat.dust.spawn(f.pos.x + (Math.random() - 0.5) * f.r, 0.6, f.pos.z + (Math.random() - 0.5) * f.r, 0, 0.7, 0, 0.1, 0.09, 0.08, 0.35, 40, 4, -0.05, 0.4, 25);
      if (f.tick <= 0) {
        f.tick = 0.25;
        if (g.monsters && !f.remote)
          for (const m of g.monsters.list)
            !m.dead && Math.hypot(m.pos.x - f.pos.x, m.pos.z - f.pos.z) < f.r + (m.def.radius || 0.4) && g.monsters.damage(m, 8, f.pos, "fire", { quiet: !0 });
        !p.dead && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < f.r * 0.85 && p.pos.y < 0.5 && g.hurtPlayer(3 * (p.stats.blastMul ?? 1), f.pos, "炎", { quiet: !0 });
      }
    }
  };
  K.addFire = function (pos, remote) {
    const g = this.game,
      f = { pos: pos.clone().setY(0), r: 3.6, t: 0, life: 9, tick: 0, remote };
    f.light = g.addPersistentLight(new L(pos.x, 0.8, pos.z), [1, 0.5, 0.18], 2.8, 11);
    g.audio && (f.snd = g.audio.sfx("burn", { pos, vol: 0.7, range: 40, loop: !0 }));
    g.combat.decal({ x: pos.x, y: 0.004, z: pos.z }, { x: 0, y: 1, z: 0 }, Xe.SCORCH, 3.4, { alpha: 0.9 });
    g.emitNoise(pos.x, pos.z, 50, "fire", !0);
    this.fires.push(f);
  };
}

// the incendiary flies like a canister and ignites when its fuse runs out
{
  const bh0 = bh;
  bh = (s) => bh0(s === "incend" ? "flash" : s);
  const P = Id.prototype,
    updateProjs = P.updateProjs;
  P.updateProjs = function (dt) {
    updateProjs.call(this, dt);
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const o = this.projs[i];
      if (o.type !== "incend" || o.t < o.def.fuse) continue;
      const pos = o.pos.clone();
      this.removeProj(i);
      this.game.skills && this.game.skills.addFire(pos, o.remote);
      this.game.audio && this.game.audio.sfx("explosion", { pos, vol: 0.5, rate: 1.7, range: 60 });
      this.game.addLight(pos.clone().setY(0.8), [1, 0.55, 0.2], 10, 12, 0.5);
      !o.remote && this.game.isMulti() && this.game.net.fx(this.game.fs.depth, "fire", pos);
    }
  };
}

// skill bodies; `this` is the skills system. Return false to keep the skill ready.
const HERO_SKILL_FX = {
  rage(g, p) {
    this.eff.rage = 10;
    p.stamina = p.stats.maxStamina;
    g.fx.pulse = 1;
    g.feed("オーバードライブ！", "#ffb080");
    g.audio && g.audio.sfx("sting_red", { vol: 0.7, rate: 1.5, important: !0 });
  },
  adrenaline(g, p) {
    this.eff.adren = 12;
    p.stamina = p.stats.maxStamina;
    p.exhausted = !1;
    g.fx.pulse = 1;
    g.feed("火事場の馬鹿力！", "#ffb080");
    g.audio && g.audio.sfx("heart", { vol: 1, important: !0 });
    g.audio && g.audio.sfx("sting_red", { vol: 0.5, rate: 1.8, important: !0 });
  },
  shield(g, p) {
    this.eff.shield = 6;
    g.feed("防護盾 展開", "#a58cff");
    g.audio && g.audio.sfx("shieldhum", { vol: 0.8, important: !0 });
    g.addLight(new L(p.pos.x, 1.2, p.pos.z), [0.5, 0.45, 1], 4, 6, 0.6);
  },
  sneak(g) {
    this.eff.sneak = 10;
    g.feed("忍び足", "#c9c3b4");
    g.audio && g.audio.sfx("whoosh", { vol: 0.35, rate: 0.7 });
  },
  cloak(g) {
    this.eff.cloak = 7;
    g.feed("光学迷彩", "#8aa7ff");
    g.audio && g.audio.sfx("whoosh", { vol: 0.7, rate: 1.3, important: !0 });
    // anything already chasing loses the trail
    if (g.monsters)
      for (const m of g.monsters.list)
        !m.dead && !m.remote && m.state === "chase" && m.def.behavior !== "boss" && ((m.state = "search"), (m.st = 2 + Math.random() * 2), (m.alert = 0.3));
  },
  silence(g, p) {
    this.eff.silence = 9;
    g.fx.static = Math.max(g.fx.static, 0.5);
    g.feed("静寂", "#8aa7ff");
    g.audio && g.audio.sfx("sting_blue", { vol: 0.8, rate: 1.4, important: !0 });
    if (g.monsters) {
      g.monsters.stunArea(p.pos, 25, 2.5, !0);
      for (const m of g.monsters.list)
        if (!m.dead && !m.remote && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 25 && m.def.behavior !== "ambush") {
          const a = Math.random() * Math.PI * 2;
          m.state = "investigate";
          m.alert = 0;
          m.tgt = { x: m.pos.x + Math.cos(a) * 12, z: m.pos.z + Math.sin(a) * 12, run: !1 };
        }
    }
  },
  shockwave(g, p) {
    const map = g.fs.map,
      fx = -Math.sin(p.yaw),
      fz = -Math.cos(p.yaw),
      R = 6.5;
    if (g.monsters)
      for (const m of g.monsters.list) {
        if (m.dead) continue;
        const ox = m.pos.x - p.pos.x,
          oz = m.pos.z - p.pos.z,
          d = Math.hypot(ox, oz);
        if (d > R || (ox * fx + oz * fz) / Math.max(d, 0.01) < -0.2 || !nn(map, p.pos.x, p.pos.z, m.pos.x, m.pos.z)) continue;
        const k = 1 - d / R;
        g.monsters.damage(m, 30 + 40 * k, p.pos, "explosion", { stun: 2.2 });
        if (!m.remote && m.def.behavior !== "boss") {
          const q = { x: m.pos.x + (ox / Math.max(d, 0.1)) * 3 * k, z: m.pos.z + (oz / Math.max(d, 0.1)) * 3 * k };
          yc(map, q, m.def.radius || 0.4);
          m.pos.x = q.x;
          m.pos.z = q.z;
        }
      }
    const hit = ni(map, p.pos.x, p.pos.z, fx, fz, 2.8, "move");
    hit.kind === "wall" &&
      g.combat.damageWall(hit.edge, hit.value, 7, { x: p.pos.x + fx * hit.dist, y: 1.2, z: p.pos.z + fz * hit.dist }, { x: hit.nx, y: 0, z: hit.nz }, 80, {});
    for (let i = 0; i < 46; i++) {
      const a = p.yaw + Math.PI + (Math.random() - 0.5) * 2.4,
        s = 5 + Math.random() * 6;
      g.combat.dust.spawn(p.pos.x - fx * 0.5, 0.25 + Math.random() * 1.2, p.pos.z - fz * 0.5, -Math.sin(a) * s * -1, Math.random() * 0.6, -Math.cos(a) * s * -1, 0.7, 0.68, 0.62, 0.25, 30, 1.4, -0.05, 1.6, 10);
    }
    p.shake = Math.max(p.shake, 0.8);
    g.fx.static = Math.max(g.fx.static, 0.25);
    g.audio && g.audio.sfx("explosion", { vol: 0.75, rate: 1.9, important: !0 });
    g.emitNoise(p.pos.x, p.pos.z, 70, "explosion");
  },
  charge(g, p) {
    if (p.inDuct) return g.toast("狭くて突進できない", 900), !1;
    this.dash = { t: 0, dx: -Math.sin(p.yaw), dz: -Math.cos(p.yaw), hit: new Set(), broke: !1 };
    p.stamina = Math.max(0, p.stamina - 15);
    g.audio && g.audio.sfx("whoosh", { vol: 0.9, rate: 0.8, important: !0 });
    g.emitNoise(p.pos.x, p.pos.z, 30, "melee");
  },
  flareshot(g) {
    return g.combat.throwItem("flare", { ...be.flare, speed: 22, dur: 40 });
  },
  incendiary(g) {
    return g.combat.throwItem("incend", { name: "焼夷手榴弾", fuse: 1.15, speed: 13, noise: 60 });
  },
  mine(g, p) {
    if (p.inDuct) return g.toast("狭くて置けない", 900), !1;
    const pos = new L(p.pos.x - Math.sin(p.yaw) * 0.7, 0.01, p.pos.z - Math.cos(p.yaw) * 0.7);
    if (!rr(g.fs.map, pos.x, pos.z)) return g.toast("ここには置けない", 900), !1;
    const mesh = heroMineMesh(g),
      led = mesh.userData.led;
    mesh.position.copy(pos);
    mesh.rotation.y = Math.random() * 6.28;
    g.scene.add(mesh);
    this.mines.push({ pos, mesh, led, t: 0 });
    while (this.mines.length > 3) g.scene.remove(this.mines.shift().mesh);
    g.audio && g.audio.sfx("beep", { pos, vol: 0.6 });
    g.feed("地雷を設置", "#d6e2ff");
  },
  turret(g, p) {
    if (p.inDuct) return g.toast("狭くて置けない", 900), !1;
    const map = g.fs.map,
      fx = -Math.sin(p.yaw),
      fz = -Math.cos(p.yaw),
      hit = ni(map, p.pos.x, p.pos.z, fx, fz, 1.6, "move"),
      dist = hit.kind ? Math.max(0.5, hit.dist - 0.5) : 1.2,
      pos = new L(p.pos.x + fx * dist, 0, p.pos.z + fz * dist);
    if (!rr(map, pos.x, pos.z)) return g.toast("ここには置けない", 900), !1;
    const mesh = heroTurretMesh(g);
    mesh.position.copy(pos);
    g.scene.add(mesh);
    this.turrets.push({ pos, mesh, t: 0, life: 22, cool: 0.6, yaw: p.yaw });
    while (this.turrets.length > 1) g.scene.remove(this.turrets.shift().mesh);
    g.audio && g.audio.sfx("rack", { pos, vol: 0.9 });
    g.feed("自動銃座 起動", "#a58cff");
  },
  healfield(g, p) {
    const pos = new L(p.pos.x, 0, p.pos.z),
      f = { pos, r: 5, t: 0, life: 8, rate: 9 * (p.stats.healMul ?? 1), netT: 0 };
    f.light = g.addPersistentLight(new L(pos.x, 1, pos.z), [0.35, 1, 0.6], 1.6, 7);
    this.fields.push(f);
    setTimeout(() => f.light && (g.removePersistentLight(f.light), (f.light = null)), 8000);
    g.audio && g.audio.sfx("heal", { vol: 0.8, important: !0 });
    g.feed("救護フィールド", "#6fd3a8");
  },
  revivepulse(g, p) {
    p.hp = p.maxHp;
    p.stamina = p.stats.maxStamina;
    p.exhausted = !1;
    p.buffs.filter = Math.max(p.buffs.filter || 0, 30);
    g.fx.white = Math.max(g.fx.white, 0.35);
    setTimeout(() => (g.fx.white = 0), 260);
    g.addLight(new L(p.pos.x, 1.4, p.pos.z), [0.6, 1, 0.75], 14, 16, 1.2);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2,
        s = 3 + Math.random() * 5;
      g.combat.add.spawn(p.pos.x, 0.4, p.pos.z, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, 0.4, 1, 0.65, 1, 7, 0.8, -0.5, 1.2);
    }
    heroCleanse(g, 18);
    if (g.isMulti()) {
      g.net.fx(g.fs.depth, "heal", p.pos, { r: 15, amt: 999 });
      g.net.fx(g.fs.depth, "cleanse", p.pos, { amt: 18 });
      let n = 0;
      for (const t of g.net.deadTeammates())
        if (t.deathD === g.fs.depth && Math.hypot(p.pos.x - t.dx, p.pos.z - t.dz) < 15) g.net.revive(t), n++;
      n && g.feed(`${n}人を蘇らせた`, "#9cffb0");
    }
    g.audio && g.audio.sfx("revive", { vol: 1, important: !0 });
    g.feed("蘇生の光", "#6fd3a8");
  },
  purge(g, p) {
    heroCleanse(g, 35);
    g.isMulti() && g.net.fx(g.fs.depth, "cleanse", p.pos, { amt: 35 });
    if (g.monsters)
      for (const m of g.monsters.list) {
        if (m.dead) continue;
        const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
        d < 15 && nn(g.fs.map, p.pos.x, p.pos.z, m.pos.x, m.pos.z) && g.monsters.damage(m, 160 * (1 - (d / 15) * 0.5), p.pos, "explosion", { stun: 3 });
      }
    g.addLight(new L(p.pos.x, 1.4, p.pos.z), [0.7, 1, 0.3], 22, 18, 1.4);
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2,
        s = 4 + Math.random() * 9;
      g.combat.add.spawn(p.pos.x, 0.6, p.pos.z, Math.cos(a) * s, Math.random() * 3, Math.sin(a) * s, 0.75, 1, 0.3, 1, 9, 0.7, -0.2, 1.4);
    }
    g.fx.static = Math.max(g.fx.static, 0.4);
    p.shake = Math.max(p.shake, 0.7);
    g.audio && g.audio.sfx("flashbang", { vol: 0.8, rate: 0.6, important: !0 });
    g.feed("浄化", "#b9d65a");
  },
};

function heroCleanse(g, amt) {
  const fs = g.fs;
  if (!fs) return;
  if (!g.isMulti() || g.net.ownsFloor(fs.depth)) fs.miasma = Math.max(0, (fs.miasma || 0) - amt);
}

// remote hero effects arrive on the net "fx" channel
function heroNetFx(g, kind, pos, msg) {
  const p = g.player;
  if (kind === "heal") {
    if (!p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < (msg.r || 5)) {
      p.hp = Math.min(p.maxHp, p.hp + Math.min(msg.amt || 9, 999));
      msg.amt > 100 && g.feed("仲間に回復された", "#9cffb0");
    }
  } else if (kind === "cleanse") heroCleanse(g, msg.amt || 0);
  else if (kind === "fire") g.skills && g.skills.addFire(pos, !0);
}

function heroMineMesh(g) {
  const b = new ks();
  b.cylY(0, 0, 0.13, 0, 0.05, F.METAL, 0, [0.16, 0.17, 0.15], 14);
  b.cylY(0, 0, 0.1, 0.05, 0.07, F.METAL, 0, [0.12, 0.13, 0.11], 14);
  b.box(-0.03, 0.07, -0.01, 0.03, 0.085, 0.01, F.METAL, 0, [0.3, 0.3, 0.3]);
  const root = new te(b.build(), g.combat.projMat),
    lb = new ks();
  lb.box(-0.012, 0.07, 0.04, 0.012, 0.09, 0.064, F.EMIS, 0, [6, 0.2, 0.1]);
  const led = new te(lb.build(), g.combat.projMat);
  root.add(led);
  root.userData.led = led;
  return root;
}
function heroTurretMesh(g) {
  const b = new ks(),
    c = [0.12, 0.13, 0.12];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.tube("y", 0, 0.75, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.018, 0.012, F.METAL, 0, c, 6);
  }
  b.cylY(0, 0, 0.07, 0.6, 0.85, F.METAL, 0, [0.2, 0.2, 0.21], 10);
  const root = new te(b.build(), g.combat.projMat),
    hb = new ks();
  hb.cbox(-0.14, 0.82, -0.2, 0.14, 1.04, 0.22, 0.02, F.METAL, 0, [0.27, 0.3, 0.24]);
  hb.tube("z", -0.62, -0.2, 0, 0.94, 0.024, 0.02, F.METAL, 0, [0.05, 0.05, 0.05], 10);
  hb.box(-0.06, 1.04, -0.05, 0.06, 1.1, 0.12, F.METAL, 0, [0.1, 0.1, 0.1]);
  hb.box(-0.03, 0.9, -0.205, 0.03, 0.94, -0.198, F.EMIS, 0, [0.3, 3, 0.4]);
  const head = new te(hb.build(), g.combat.projMat);
  root.add(head);
  root.userData.head = head;
  return root;
}

// ---- hero select screen
class HeroSelect {
  constructor(meta, onPick) {
    this.meta = meta;
    this.onPick = onPick;
    this.sel = meta.m.hero && HEROES[meta.m.hero] ? meta.m.hero : HERO_LIST[0].id;
    this.armed = null;
    this.mode = "solo";
    this.root = document.getElementById("hs");
    this.roster = document.getElementById("hs-roster");
    this.info = document.getElementById("hs-info");
    this.go = document.getElementById("hs-go");
    this.roster.addEventListener("click", (e) => {
      const c = e.target.closest("[data-hero]");
      c && this.select(c.dataset.hero);
    });
    this.go.addEventListener("click", () => this.confirm());
  }
  open(mode = "solo") {
    this.mode = mode;
    this.armed = null;
    this.renderRoster();
    this.select(this.sel, !0);
  }
  art(id) {
    return `assets/heroes/${id}.webp`;
  }
  renderRoster() {
    const m = this.meta;
    this.roster.innerHTML = HERO_LIST.map((h) => {
      const lock = !m.heroUnlocked(h.id);
      return `<button type="button" class="hs-card${h.id === this.sel ? " on" : ""}${lock ? " locked" : ""}" data-hero="${h.id}" style="--c:${h.color}" role="option" aria-selected="${h.id === this.sel}" aria-label="${h.name} ${h.role}${lock ? " 未解放" : ""}">
        <span class="em">${h.name[0]}</span><img src="${this.art(h.id)}" alt="" loading="lazy" onerror="this.remove()">
        ${lock ? `<span class="lk">¥${(h.price / 1e4).toFixed(0)}万</span>` : ""}<span class="nm">${h.name}</span></button>`;
    }).join("");
  }
  select(id, quiet) {
    if (!HEROES[id]) return;
    if (this.sel !== id) this.armed = null;
    this.sel = id;
    const h = HEROES[id],
      m = this.meta;
    this.root.style.setProperty("--hc", h.color);
    for (const c of this.roster.querySelectorAll(".hs-card")) {
      const on = c.dataset.hero === id;
      c.classList.toggle("on", on);
      c.setAttribute("aria-selected", on);
      c.classList.toggle("locked", !m.heroUnlocked(c.dataset.hero));
    }
    const img = document.getElementById("hs-portrait"),
      em = document.getElementById("hs-emblem");
    img.classList.remove("on");
    em.textContent = h.name[0];
    em.style.display = "";
    img.onload = () => (img.classList.add("on"), (em.style.display = "none"));
    img.onerror = () => img.classList.remove("on");
    img.src = this.art(id);
    document.getElementById("hs-role").textContent = `${h.role}　${"★".repeat(h.diff)}${"☆".repeat(3 - h.diff)}`;
    document.getElementById("hs-name").textContent = h.name;
    document.getElementById("hs-title").textContent = h.title;
    document.getElementById("hs-bank").textContent = "¥" + m.bank.toLocaleString();
    const w = h.weapon && be[h.weapon],
      ml = be[h.melee],
      rc = (h.recharge * (h.rechargeMul || 1)).toFixed(h.rechargeMul ? 1 : 0),
      bar = (k, v) => `<div class="hs-stat"><span>${k}</span><div class="bar"><i style="transform:scaleX(${v})"></i></div></div>`,
      sk = h.skills
        .map((s, i) => {
          const d = Gr[s];
          return `<div class="hs-sk${d.ult ? " ult" : ""}"><span class="ic">${d.icon}</span><div><div class="nm">${d.name}<em>${d.ult ? "必殺" : "スキル" + (i + 1)}</em><span class="cd">CD ${d.cd}秒</span></div><div class="ds">${d.desc}</div></div></div>`;
        })
        .join("");
    this.info.innerHTML = `
      <div class="hs-desc">${h.desc}</div>
      <div class="hs-stats">${bar("体力", h.bars.hp)}${bar("機動", h.bars.mob)}${bar("火力", h.bars.fire)}${bar("破壊", h.bars.brk)}</div>
      ${
        w
          ? `<div class="hs-box">${wc[h.weapon] || ""}<div><div class="t">${w.name}</div><div class="d">撃ち尽くすと${rc}秒で自動充填（長押し・Rで早めに充填）</div></div><div class="ammo">${h.mag}<small>発</small></div></div>`
          : `<div class="hs-box">${wc.fist}<div><div class="t">銃なし</div><div class="d">撃てない。見つからずに進むのが仕事</div></div></div>`
      }
      <div class="hs-skills">${sk}</div>
      <div class="hs-box">${wc[h.melee] || ""}<div><div class="t">${(ml?.name || "爆薬専任")}</div><div class="d">近接武器。壁も殴って壊せる（弾は使わない）</div></div></div>
      <div class="hs-box"><svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z"/></svg><div><div class="t">${h.passive.name}<span style="font-size:10px;color:var(--ink-dim);margin-left:8px">パッシブ</span></div><div class="d">${h.passive.desc}</div></div></div>`;
    this.renderGo();
    quiet || this.meta.m.hero === id || (this.meta.m.hero = id);
  }
  renderGo() {
    const h = HEROES[this.sel],
      m = this.meta,
      lock = !m.heroUnlocked(h.id),
      g = this.go;
    g.classList.toggle("buy", lock);
    g.disabled = !1;
    if (lock) {
      g.textContent = this.armed === h.id ? `もう一度押して解放（¥${h.price.toLocaleString()}）` : `解放する ¥${h.price.toLocaleString()}`;
      m.bank < h.price && ((g.textContent = `あと ¥${(h.price - m.bank).toLocaleString()} 必要`), (g.disabled = !0));
    } else g.textContent = this.mode === "lobby" ? "このキャラにする" : this.mode === "admin" ? "この階層から出撃" : "出撃する";
  }
  confirm() {
    const h = HEROES[this.sel],
      m = this.meta;
    if (!m.heroUnlocked(h.id)) {
      if (this.armed !== h.id) return (this.armed = h.id), this.renderGo();
      if (!m.unlockHero(h.id)) return this.renderGo();
      this.armed = null;
      this.renderRoster();
      this.select(h.id);
      return;
    }
    m.m.hero = h.id;
    m.save();
    this.onPick && this.onPick(h.id, this.mode);
  }
}

// ---- upgrades screen (account-wide, applies to every hero)
function renderUpgrades(meta) {
  const root = document.getElementById("upg");
  document.getElementById("bank-upg").textContent = "¥" + meta.bank.toLocaleString();
  root.innerHTML = Object.keys(ex)
    .map((k) => {
      const u = ex[k],
        lv = meta.level(k),
        max = lv >= u.max,
        armed = renderUpgrades.armed === k;
      return `<button type="button" class="card${max ? " on" : ""}" data-upg="${k}" ${max ? "disabled" : ""}><span>${u.name}</span><span class="c">${max ? "最大" : (armed ? "もう一度で購入 " : "") + "¥" + u.price[lv].toLocaleString()}　Lv${lv}/${u.max}</span></button>`;
    })
    .join("");
}
