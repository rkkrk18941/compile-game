// UI wiring and boot. Runs after every feature part (it is the last part).
  var ee = (s) => document.querySelector(s),
    z_ = "noclip.v1",
    Fe = {
      sens: 1,
      q: "auto",
      vol: 0.8,
      invert: 0,
      best: {},
      meta: null,
      load() {
        try {
          Object.assign(this, JSON.parse(localStorage.getItem(z_) || "{}"));
        } catch {}
      },
      save() {
        try {
          localStorage.setItem(
            z_,
            JSON.stringify({
              sens: this.sens,
              q: this.q,
              vol: this.vol,
              invert: this.invert,
              best: this.best,
              meta: this.meta,
              name: this.name,
              adm: this.adm,
            }),
          );
        } catch {}
      },
      texQ() {
        return this.q === "low" ? "low" : "high";
      },
    };
  Fe.load();
  var Li = new xp(Fe),
    Sp = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  for (let s of ["gesturestart", "gesturechange", "gestureend"])
    document.addEventListener(s, (t) => t.preventDefault(), { passive: !1 });
  document.addEventListener("dblclick", (s) => s.preventDefault(), {
    passive: !1,
  });
  var V_ = Sp && Math.min(screen.width, screen.height) < 900;
  Sp && document.body.classList.add("need-landscape");
  var ix = ee("#gl"),
    zn;
  try {
    zn = new oh({
      canvas: ix,
      antialias: !1,
      powerPreference: "high-performance",
      alpha: !1,
      stencil: !1,
    });
  } catch (s) {
    throw (
      (document.body.innerHTML =
        '<div style="padding:40px;color:#eee;font-family:sans-serif">WebGLが使えないため起動できませんでした。別のブラウザでお試しください。</div>'),
      s
    );
  }
  zn.outputColorSpace = br;
  zn.toneMapping = Ti;
  zn.setClearColor(0, 1);
  var rx = new ld(zn),
    uC = new hd(zn),
    vs = new ud(document.body);
  vs.sens = Fe.sens;
  vs.invertY = !!Fe.invert;
  var B_ = [
      "s-title",
      "s-howto",
      "s-settings",
      "s-pause",
      "s-loading",
      "s-result",
      "s-map",
      "s-heroes",
      "s-upgrades",
      "s-admin",
      "s-lobby",
    ],
    gi = {
      stack: [],
      show(s) {
        for (let t of B_) ee("#" + t).classList.toggle("show", t === s);
        this.cur = s;
      },
      hideAll() {
        for (let s of B_) ee("#" + s).classList.remove("show");
        this.cur = null;
      },
    },
    bt = new Td({
      renderer: zn,
      post: rx,
      baker: uC,
      input: vs,
      ui: gi,
      settings: Fe,
    });
  bt.meta = Li;
  O_(bt);
  var heroUI = new HeroSelect(Li, (id, mode) => heroPicked(id, mode)),
    fC = { low: 1, mid: 1.5, high: 2 },
    cr = 1;
  function dC() {
    return Fe.q === "auto" ? (V_ ? "mid" : "high") : Fe.q;
  }
  function Xr() {
    let s = window.innerWidth,
      t = window.innerHeight,
      e = dC(),
      n = Math.min(window.devicePixelRatio || 1, fC[e]) * cr;
    (zn.setPixelRatio(n),
      zn.setSize(s, t, !1),
      (ix.style.width = s + "px"),
      (ix.style.height = t + "px"));
    let i = e === "high" && !V_ ? 4 : 0;
    (rx.setSize(s * n, t * n, i), bt.resize(s, t));
  }
  window.addEventListener("resize", Xr);
  window.addEventListener("orientationchange", () => setTimeout(Xr, 200));
  Xr();
  var yp = 1 / 60,
    _p = 0;
  function pC(s) {
    ((yp = yp * 0.95 + s * 0.05),
      (_p += s),
      !(_p < 2 || Fe.q !== "auto") &&
        (yp > 1 / 38 && cr > 0.55
          ? ((cr = Math.max(0.55, cr - 0.1)), (_p = 0), Xr())
          : yp < 1 / 57 &&
            cr < 1 &&
            ((cr = Math.min(1, cr + 0.05)), (_p = 0), Xr())));
  }
  function ax() {
    ((ee("#set-sens").value = Fe.sens), (ee("#set-vol").value = Fe.vol));
    for (let s of ee("#set-quality").children)
      s.classList.toggle("on", s.dataset.v === Fe.q);
    for (let s of ee("#set-invert").children)
      s.classList.toggle("on", +s.dataset.v == +Fe.invert);
  }
  ee("#set-sens").addEventListener("input", (s) => {
    ((Fe.sens = +s.target.value), (vs.sens = Fe.sens), Fe.save());
  });
  ee("#set-vol").addEventListener("input", (s) => {
    ((Fe.vol = +s.target.value),
      bt.audio && bt.audio.setVolume(Fe.vol),
      Fe.save());
  });
  ee("#set-quality").addEventListener("click", (s) => {
    let t = s.target.dataset.v;
    t && ((Fe.q = t), (cr = 1), Fe.save(), ax(), Xr());
  });
  ee("#set-invert").addEventListener("click", (s) => {
    let t = s.target.dataset.v;
    t !== void 0 &&
      ((Fe.invert = +t), (vs.invertY = !!Fe.invert), Fe.save(), ax());
  });
  var G_ = "s-title";
  function wp(s, t) {
    ((G_ = t), ax(), gi.show(s));
  }
  document.querySelectorAll("[data-close]").forEach((s) =>
    s.addEventListener("click", () => {
      gi.show(G_);
    }),
  );
  ee("#b-howto").addEventListener("click", () => wp("s-howto", "s-title"));
  ee("#b-settings").addEventListener("click", () =>
    wp("s-settings", "s-title"),
  );
  ee("#b-howto2").addEventListener("click", () => wp("s-howto", "s-pause"));
  ee("#b-settings2").addEventListener("click", () =>
    wp("s-settings", "s-pause"),
  );
  ee("#b-resume").addEventListener("click", () => bt.resume());
  var bp = 0;
  ee("#b-quit").addEventListener("click", (s) => {
    let t = s.currentTarget;
    if (performance.now() - bp < 5e3) {
      ((bp = 0),
        (t.textContent =
          "あきらめてタイトルへ"),
        lx());
      return;
    }
    ((bp = performance.now()),
      (t.textContent =
        "もう一度押すと持ち物を失って戻る"),
      setTimeout(() => {
        performance.now() - bp >= 4900 &&
          (t.textContent =
            "あきらめてタイトルへ");
      }, 5e3));
  });
  ee("#b-again").addEventListener("click", () => {
    if (bt.isMulti()) {
      lx();
      return;
    }
    Zo(void 0, Li.m.hero, lastStart);
  });
  ee("#b-title").addEventListener("click", () => lx());
  ee("#map-close").addEventListener("click", () => bt.closeMap());
  ee("#s-map").addEventListener("click", (s) => {
    s.target.id === "s-map" && bt.closeMap();
  });
  // title → hero select → run. The lobby and the admin floor picker reuse the same screen.
  var heroBack = "s-title",
    lastStart = {};
  function openHeroes(mode = "solo", back = "s-title") {
    heroBack = back;
    heroUI.open(mode);
    gi.show("s-heroes");
  }
  function heroPicked(id, mode) {
    if (mode === "lobby") {
      bt.net.setMode(id);
      Ep();
      return;
    }
    lastStart = mode === "admin" ? { ...admStart } : {};
    Zo(void 0, id, lastStart);
  }
  ee("#b-start").addEventListener("click", () => openHeroes("solo", "s-title"));
  ee("#hs-back").addEventListener("click", () => {
    heroBack === "s-lobby" ? Ep() : (Tp(), gi.show(heroBack));
  });
  ee("#hs-upg").addEventListener("click", () => {
    renderUpgrades(Li);
    gi.show("s-upgrades");
  });
  ee("#upg").addEventListener("click", (s) => {
    let t = s.target.closest("[data-upg]");
    if (!t) return;
    let e = t.dataset.upg;
    if (renderUpgrades.armed !== e) {
      renderUpgrades.armed = e;
      renderUpgrades(Li);
      return;
    }
    renderUpgrades.armed = null;
    Li.buyUpgrade(e) || bt.toast("お金が足りない", 1200);
    renderUpgrades(Li);
  });
  ee("#b-upg-back").addEventListener("click", () => {
    renderUpgrades.armed = null;
    heroUI.open(heroUI.mode);
    gi.show("s-heroes");
  });
  // admin: PASS0702 unlocks starting from any floor / place (and warping from the pause menu)
  var admStart = { startDepth: 1, startTheme: null },
    admHash = (s) => {
      let t = 0xdeadbeef ^ 7702,
        e = 0x41c6ce57 ^ 7702;
      for (let n = 0, i; n < s.length; n++)
        ((i = s.charCodeAt(n)),
          (t = Math.imul(t ^ i, 2654435761)),
          (e = Math.imul(e ^ i, 1597334677)));
      return (
        (t = Math.imul(t ^ (t >>> 16), 2246822507)),
        (t ^= Math.imul(e ^ (e >>> 13), 3266489909)),
        (e = Math.imul(e ^ (e >>> 16), 2246822507)),
        (e ^= Math.imul(t ^ (t >>> 13), 3266489909)),
        4294967296 * (2097151 & e) + (t >>> 0)
      );
    };
  function admRender() {
    let s = !!Fe.adm;
    ((ee("#adm-lock").style.display = s ? "none" : ""),
      (ee("#adm-open").style.display = s ? "" : "none"),
      (ee("#adm-go").style.display = s ? "" : "none"),
      (ee("#adm-floors").innerHTML = [1, 2, 3, 4, 5]
        .map(
          (t) =>
            `<button type="button" data-f="${t}" class="${admStart.startDepth === t ? "on" : ""}">B${t}</button>`,
        )
        .join("")),
      (ee("#adm-places").innerHTML = [[null, "おまかせ"]]
        .concat(Object.values(ah).map((t) => [t.id, t.name]))
        .map(
          ([t, e]) =>
            `<button type="button" data-p="${t || ""}" class="${(admStart.startTheme || null) === t ? "on" : ""}">${e}</button>`,
        )
        .join("")),
      admWarpRender());
  }
  function admWarpRender() {
    let s = ee("#adm-warp");
    s &&
      ((s.style.display = Fe.adm ? "" : "none"),
      (s.querySelector(".seg").innerHTML = [1, 2, 3, 4, 5]
        .map((t) => `<button type="button" data-w="${t}">B${t}</button>`)
        .join("")));
  }
  ee("#b-admin").addEventListener("click", () => {
    ((ee("#adm-pass").value = ""),
      (ee("#adm-msg").textContent =
        "管理者パスワードを入れると、好きな階層・場所から潜れる。"),
      admRender(),
      gi.show("s-admin"));
  });
  function admTry() {
    let s = (ee("#adm-pass").value || "").trim().toUpperCase();
    admHash(s) === 5371110554231781
      ? ((Fe.adm = 1), Fe.save(), admRender())
      : ((ee("#adm-msg").textContent = "パスワードが違う"),
        ee("#adm-pass").select());
  }
  ee("#adm-ok").addEventListener("click", admTry);
  ee("#adm-pass").addEventListener("keydown", (s) => {
    s.key === "Enter" && admTry();
  });
  ee("#adm-floors").addEventListener("click", (s) => {
    let t = s.target.closest("[data-f]");
    t && ((admStart.startDepth = +t.dataset.f), admRender());
  });
  ee("#adm-places").addEventListener("click", (s) => {
    let t = s.target.closest("[data-p]");
    t && ((admStart.startTheme = t.dataset.p || null), admRender());
  });
  ee("#adm-go").addEventListener("click", () => openHeroes("admin", "s-admin"));
  ee("#adm-back").addEventListener("click", () => {
    (Tp(), gi.show("s-title"));
  });
  ee("#adm-warp").addEventListener("click", async (s) => {
    let t = s.target.closest("[data-w]");
    if (!t || !Fe.adm || !bt.fs) return;
    let e = +t.dataset.w;
    (bt.resume(),
      e !== bt.fs.depth &&
        (await bt.transition(e, e === 1 ? { kind: "elev" } : { kind: "up", idx: 0 })));
  });
  admWarpRender();
  ee("#b-portrait").addEventListener("click", () => {
    (document.body.classList.add("allow-portrait"), Xr());
  });
  function Tp() {
    let s = Fe.best || {},
      t = [];
    (s.money && t.push("最高 \xA5" + s.money.toLocaleString()),
      s.clears && t.push("生還 " + s.clears + "回"),
      (ee("#best-line").textContent = t.length
        ? t.join("　")
        : "到達した階層"),
      (ee("#bank-line").textContent = "\xA5" + Li.bank.toLocaleString()),
      document
        .querySelectorAll(".floors .fb")
        .forEach((e) =>
          e.classList.toggle("lit", +e.dataset.f <= (s.deepest || 0)),
        ));
  }
  Tp();
  (function () {
    let t = [
        "JAN",
        "FEB",
        "MAR",
        "APR",
        "MAY",
        "JUN",
        "JUL",
        "AUG",
        "SEP",
        "OCT",
        "NOV",
        "DEC",
      ],
      e = new Date(),
      n = e.getHours(),
      i = String(e.getMinutes()).padStart(2, "0");
    ee("#osd-date").textContent =
      `${n < 12 ? "AM" : "PM"} ${((n + 11) % 12) + 1}:${i}  ${t[e.getMonth()]}.${String(e.getDate()).padStart(2, "0")} ${e.getFullYear()}`;
    let r = performance.now();
    setInterval(() => {
      if (bt.state !== "title") return;
      let o = Math.floor((performance.now() - r) / 1e3);
      ee("#osd-tc").textContent =
        `${Math.floor(o / 3600)}:${String(Math.floor(o / 60) % 60).padStart(2, "0")}:${String(o % 60).padStart(2, "0")}`;
    }, 500);
  })();
  async function mC() {
    if (!Sp) return;
    let s = document.documentElement;
    try {
      !document.fullscreenElement && s.requestFullscreen
        ? await s.requestFullscreen({ navigationUI: "hide" })
        : s.webkitRequestFullscreen && s.webkitRequestFullscreen();
    } catch {}
    try {
      screen.orientation &&
        screen.orientation.lock &&
        (await screen.orientation.lock("landscape"));
    } catch {}
  }
  var nx = !1;
  async function Zo(s, t = Li.m.hero, e = {}) {
    nx ||
      ((nx = !0),
      mC(),
      bt.audio && bt.audio.unlock(),
      document.body.classList.remove("playing", "spectating"),
      (bt.spectating = !1),
      (bt.viewPos = null),
      (bt.loadout = Li.heroLoadout(t)),
      bt.newRun(s ?? (Math.random() * 1e9) >>> 0, e),
      e.startTheme && (bt.run.themes[(e.startDepth || 1) - 1] = e.startTheme),
      (bt.player.name = Fe.name || ""),
      (bt.fx.white = 0),
      (bt.fx.fade = 0),
      await bt.loadFloor(
        (e.join && e.depth) || e.startDepth || 1,
        e.join
          ? { kind: "pos", x: e.x, z: e.z }
          : (e.startDepth || 1) > 1
            ? { kind: "up", idx: 0 }
            : { kind: "elev" },
        !0,
      ),
      gi.hideAll(),
      document.body.classList.add("playing"),
      (bt.state = "play"),
      vs.clear(),
      (vs.enabled = !0),
      bt.banner(
        "B" + bt.fs.depth + "　" + bt.fs.theme.name,
        heroOf(t).name +
          "、潜行開始。地下五層まで潜り、B1のエレベーターへ戻って帰還せよ",
        0,
      ),
      gC(),
      (nx = !1));
  }
  function gC() {
    let s = ee("#hint");
    ((s.innerHTML = Sp
      ? "左をなぞって移動　／　右をなぞって見回す"
      : "WASD 移動 ・ マウス 視点 ・ クリック 攻撃 ・ Space 跳ぶ ・ C しゃがむ ・ Z 伏せ ・ E 調べる ・ M 地図"),
      (s.style.opacity = 1),
      setTimeout(() => {
        s.style.opacity = 0;
      }, 6500));
  }
  async function lx() {
    (bt.net && bt.net.active && bt.net.leave(),
      (bt.spectating = !1),
      (bt.viewPos = null),
      document.body.classList.remove("playing", "spectating"),
      vs.releaseAll(),
      (vs.enabled = !1),
      (bt.fx.white = 0),
      (bt.fx.fade = 0),
      bt.newRun((Math.random() * 1e9) >>> 0),
      await bt.loadFloor(1, { kind: "elev" }, !1),
      (bt._titlePath = null),
      (bt.state = "title"),
      Tp(),
      gi.show("s-title"),
      bt.audio && bt.audio.setPaused && bt.audio.setPaused(!1));
  }
  var heroLabel = (s) => (HEROES[s] ? HEROES[s].name + "・" + HEROES[s].role : "未選択"),
    Jo = () => (HEROES[Li.m.hero] ? Li.m.hero : HERO_LIST[0].id),
    xC = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (t) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[t],
      ),
    Uh = (s) => {
      ee("#lobby-status").textContent = s;
      let t = ee("#lobby-start .note2");
      t && (t.textContent = s);
    };
  function W_() {
    let s =
      (ee("#lobby-name").value || "").trim() ||
      Fe.name ||
      "探索者" + Math.floor(Math.random() * 90 + 10);
    return ((Fe.name = s.slice(0, 12)), Fe.save(), Fe.name);
  }
  function Ic(s) {
    ((ee("#lobby-start").style.display = s ? "none" : ""),
      (ee("#lobby-room").style.display = s ? "" : "none"),
      (ee("#b-lobby-go").style.display = s && bt.net.isHost ? "" : "none"));
  }
  function hx(s) {
    ((ee("#lobby-players").innerHTML = s
      .map(
        (t) =>
          `<div class="${t.host ? "host" : ""}"><span>${xC(t.name)}${t.id === bt.net.selfId ? "（あなた）" : ""}</span><span>${t.host ? "ホスト・" : ""}${heroLabel(t.mode)}</span></div>`,
      )
      .join("")),
      (ee("#lobby-mode").textContent = heroLabel(Jo())));
  }
  function Ep(s) {
    (Ic(bt.net.active),
      bt.net.active &&
        ((ee("#lobby-codeview").textContent = bt.net.code),
        hx(bt.net.playerList())),
      (ee("#lobby-name").value = Fe.name || ""),
      s && (ee("#lobby-code").value = s),
      (ee("#lobby-mode").textContent = heroLabel(Jo())),
      gi.show("s-lobby"));
  }
  ee("#b-coop").addEventListener("click", () => Ep());
  ee("#b-host").addEventListener("click", async (s) => {
    let t = s.currentTarget;
    if (!t.disabled) {
      t.disabled = !0;
      try {
        (await bt.net.host(W_()),
          bt.net.setMode(Jo()),
          (ee("#lobby-codeview").textContent = bt.net.code),
          Ic(!0),
          hx(bt.net.playerList()));
      } catch (e) {
        console.warn(e);
      }
      t.disabled = !1;
    }
  });
  ee("#b-join").addEventListener("click", async (s) => {
    let t = (ee("#lobby-code").value || "").trim().toUpperCase();
    if (t.length < 4) {
      Uh("部屋コードを入れて");
      return;
    }
    let e = s.currentTarget;
    if (!e.disabled) {
      e.disabled = !0;
      try {
        (await bt.net.join(t, W_()),
          (ee("#lobby-codeview").textContent = t),
          bt.net.started || (Ic(!0), bt.net.setMode(Jo())));
      } catch (n) {
        console.warn(n);
      }
      e.disabled = !1;
    }
  });
  ee("#b-copy").addEventListener("click", async () => {
    let s = bt.net.inviteLink();
    try {
      (await navigator.clipboard.writeText(s),
        Uh(
          "招待リンクをコピーした",
        ));
    } catch {
      Uh(s);
    }
  });
  ee("#b-lobby-loadout").addEventListener("click", () =>
    openHeroes("lobby", "s-lobby"),
  );
  ee("#b-lobby-go").addEventListener("click", () => {
    if (!bt.net.isHost || bt.net.started) return;
    let s = (Math.random() * 1e9) >>> 0;
    (bt.net.startAll(s), Zo(s, Jo(), { coop: !0 }));
  });
  ee("#b-lobby-back").addEventListener("click", () => {
    (bt.net.leave(), Ic(!1), Tp(), gi.show("s-title"));
  });
  ee("#spec-prev").addEventListener("click", () => bt.cycleSpectate(-1));
  ee("#spec-next").addEventListener("click", () => bt.cycleSpectate(1));
  bt.net.onStatus = (s) => Uh(s);
  bt.net.onPlayers = (s) => hx(s);
  bt.net.onStart = (s, t) => {
    Zo(s, Jo(), { coop: !0, ...t });
  };
  bt.net.onLost = (s) => {
    gi.cur === "s-lobby" && (Ic(!1), Uh(s));
  };
  var H_ = performance.now(),
    q_ = !0;
  function X_(s) {
    requestAnimationFrame(X_);
    let t = (s - H_) / 1e3;
    ((H_ = s),
      t > 0.1 && (t = 0.1),
      !(document.hidden || !q_) &&
        (bt.update(t), bt.render(), bt.state === "play" && pC(t)));
  }
  (async function () {
    (di.init(),
      /[?&]nopreload\b/.test(location.search) ||
        [
          "wanderer",
          "smiler",
          "crawler",
          "mannequin",
          "black",
          "hound",
          "skitter",
          "clinger",
          "tall",
          "butcher",
          "stringer",
          "nurse",
          "wraith",
          "headlight",
        ].forEach((e, n) => Fd(Vr[e], 20 - n)),
      Rc(15),
      bt.newRun((Math.random() * 1e9) >>> 0),
      await bt.loadFloor(1, { kind: "elev" }, !1),
      (bt.state = "title"),
      gi.show("s-title"));
    let t = new URLSearchParams(location.search).get("room");
    (t && Ep(t.toUpperCase()),
      requestAnimationFrame(X_),
      document.addEventListener("visibilitychange", () => {
        document.hidden && bt.state === "play" && bt.pause();
      }));
  })();
  window.__nc = {
    game: bt,
    input: vs,
    settings: Fe,
    THREE: tn,
    CELL: 4,
    tp(s, t, e) {
      (bt.player.pos.set(s, 0, t), e !== void 0 && (bt.player.yaw = e));
    },
    start: (s) => Zo(s),
    setDyn(s) {
      ((cr = s), Xr());
    },
    loop(s) {
      q_ = s;
    },
    sim(s, t = 1 / 30) {
      let e = Math.round(s / t);
      for (let n = 0; n < e; n++) bt.update(t);
      return [bt.player.pos.x, bt.player.pos.z];
    },
    perf(s = 5) {
      let t = performance.now();
      for (let n = 0; n < s; n++) bt.render();
      return (zn.getContext().finish(), (performance.now() - t) / s);
    },
    tpZone(s, t = 0) {
      let e = bt.fs.map,
        n = e.zones.filter((a) => a.id === s),
        i = n[t % n.length];
      if (!i) return null;
      let r = null,
        o = 1e9;
      for (let a of i.cells) {
        let c = a % e.W,
          l = (a / e.W) | 0,
          h = Math.hypot(c - i.cx, l - i.cy);
        h < o && e.floor[a] === 0 && e.feat[a] === 0 && ((o = h), (r = [c, l]));
      }
      return (
        bt.player.pos.set((r[0] + 0.5) * 4, 0, (r[1] + 0.5) * 4),
        (bt._lastCell = -1),
        r
      );
    },
    tpStair(s, t = 0) {
      let n = bt.fs.map.stairs.filter((o) => o.kind === s),
        i = n[t % n.length];
      if (!i) return null;
      let r = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ][i.dir];
      return (
        bt.player.pos.set((i.cx + 0.5 + r[0]) * 4, 0, (i.cy + 0.5 + r[1]) * 4),
        (bt.player.yaw = Math.atan2(r[0], r[1])),
        (bt._lastCell = -1),
        i
      );
    },
    spawn(s, t = 3.5) {
      let e = bt,
        n = e.player,
        i = e.monsters,
        r = i.makeMon(
          s,
          n.pos.x - Math.sin(n.yaw) * t,
          n.pos.z - Math.cos(n.yaw) * t,
          n.yaw,
          { home: 0 },
        );
      return (
        s === "maw" &&
          (r.def = {
            ...r.def,
            body: { ...r.def.body, ceil: e.fs.theme.ceilH },
          }),
        i.list.push(r),
        r
      );
    },
    nanCheck() {
      bt.render();
      let s = rx.rtScene,
        t = s.width,
        e = s.height,
        n = new Uint16Array(t * e * 4);
      try {
        zn.readRenderTargetPixels(s, 0, 0, t, e, n);
      } catch (c) {
        return "readfail " + c;
      }
      let i = 0,
        r = 0,
        o = null,
        a = 0;
      for (let c = 0; c < n.length; c++) {
        let l = n[c],
          h = l & 31744,
          u = l & 1023;
        if (h === 31744)
          u ? (i++, o || (o = [(c >> 2) % t, Math.floor((c >> 2) / t)])) : r++;
        else {
          let f = Pa.fromHalfFloat(l);
          f > a && (a = f);
        }
      }
      return { w: t, h: e, nan: i, inf: r, first: o, maxv: a };
    },
    meta: Li,
    heroes: heroUI,
    startRun: (s, t, e) => Zo(s, t, e),
    lobby: { openLobby: Ep, lobbyView: Ic },
    give(s, t = 1) {
      let e = bt.items;
      for (let n = 0; n < t; n++)
        if (
          !e.tryAuto({
            id: -1 - n,
            type: s,
            x: 0,
            z: 0,
            taken: !1,
            dropped: !1,
          })
        )
          return !1;
      return (e.renderAll(), e.inv);
    },
    act() {
      let s = bt.action;
      return s ? (bt.doAction(s), s.type) : null;
    },
    async goto(s, t) {
      return (
        t && (bt.run.themes[s - 1] = t),
        delete bt.run.floors[s],
        await bt.loadFloor(s, { kind: s === 1 ? "elev" : "up", idx: 0 }, !1, {
          prepare: !0,
        }),
        gi.hideAll(),
        (bt.state = "play"),
        (vs.enabled = !0),
        bt.fs.themeId
      );
    },
    stats() {
      let s = performance.now();
      for (let i = 0; i < 30; i++) bt.update(1 / 60);
      let t = (performance.now() - s) / 30;
      ((zn.info.autoReset = !1), zn.info.reset(), bt.render());
      let e = zn.info.render,
        n = {
          updateMs: +t.toFixed(2),
          calls: e.calls,
          tris: e.triangles,
          geos: zn.info.memory.geometries,
          tex: zn.info.memory.textures,
          progs: zn.info.programs.length,
          chunks: bt.world.chunks.size,
          rigs: bt.monsters.list.filter((i) => i.rig).length,
        };
      return ((zn.info.autoReset = !0), n);
    },
    bank: di,
    clearMon() {
      let s = bt.monsters;
      (s.clearRigs(), (s.list.length = 0));
    },
    info() {
      let s = bt,
        t = s.player;
      return {
        state: s.state,
        depth: s.fs && s.fs.depth,
        pos: [t.pos.x, t.pos.y, t.pos.z],
        yaw: t.yaw,
        hp: t.hp,
        money: s.run && s.run.money,
      };
    },
  };
