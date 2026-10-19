
(function () {
  'use strict';
  var allBoxes = Array.prototype.slice.call(document.querySelectorAll('.box'));
  var boxes = allBoxes.slice();
  var wide = window.matchMedia('(min-width: 900px)');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var KEY = 'playroom.last';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function open(box, opts) {
    opts = opts || {};
    allBoxes.forEach(function (b) {
      var on = b === box;
      b.classList.toggle('open', on);
      b.querySelector('.spine-open').setAttribute('aria-expanded', String(on));
      b.querySelector('.cover').hidden = !on;
    });
    if (box && opts.scroll && !wide.matches) {
      var top = box.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: top, behavior: reduce.matches ? 'auto' : 'smooth' });
    }
  }
  function closeAll() { open(null); }

  boxes.forEach(function (box) {
    box.querySelector('.spine-open').addEventListener('click', function () {
      // phones: tapping the open box closes it; wide screens always keep one open
      if (box.classList.contains('open') && !wide.matches) closeAll();
      else open(box, { scroll: true });
    });
    box.querySelectorAll('a[href]').forEach(function (a) {
      a.addEventListener('click', function () { store(KEY, box.dataset.id); });
    });
  });

  var SETTINGS_API = 'https://playroom-settings.kd37yg.chatgpt.site';
  var SETTINGS_KEY = 'playroom.shared-settings.v1';
  var currentSettings = {version:0,order:[],hidden:[]};
  function applySettings(data) {
    if (rolling) { setTimeout(function(){applySettings(data);},500);return; }
    if (!data || !Array.isArray(data.order) || !Array.isArray(data.hidden)) return;
    if (Number(data.version)<Number(currentSettings.version)) return;
    currentSettings = data;
    var active = allBoxes.filter(function(b){return b.classList.contains('open');})[0];
    var ordered = data.order.map(function(id){return allBoxes.filter(function(b){return b.dataset.id===id;})[0];}).filter(Boolean);
    // Games added after the shared order was saved are new: keep them on top of the pile, as the page lists them.
    var fresh = allBoxes.filter(function(b){return ordered.indexOf(b)<0;});
    ordered = fresh.concat(ordered);
    var shelf=document.getElementById('shelf'), ledge=shelf.querySelector('.ledge');
    ordered.forEach(function(b){b.hidden=data.hidden.indexOf(b.dataset.id)>=0;shelf.insertBefore(b,ledge);});
    boxes=ordered.filter(function(b){return !b.hidden;});
    boxes.forEach(function(b,i){b.querySelector('.spine').style.gridRow=String(i+1);});
    ledge.style.gridRow=String(boxes.length+1);
    shelf.querySelector('.dice').style.gridRow=String(boxes.length+2);
    shelf.style.gridTemplateRows='repeat('+(boxes.length+2)+',auto) 1fr';
    document.querySelector('.lede').textContent='ブラウザでそのまま遊べるゲームを、'+boxes.length+'個積んであります。箱を選ぶと中身が見られます。';
    if(active && boxes.indexOf(active)<0)open(boxes[0]||null);
    else if(!active&&boxes.length)open(boxes[0]);
    store(SETTINGS_KEY,JSON.stringify(data));
  }
  try {var cached=store(SETTINGS_KEY);if(cached)applySettings(JSON.parse(cached));}catch(e){}
  fetch(SETTINGS_API+'/api/settings',{cache:'no-store',signal:AbortSignal.timeout(8000)}).then(function(r){if(!r.ok)throw Error();return r.json();}).then(applySettings).catch(function(){});

  // open the last game played, otherwise the newest one
  var last = store(KEY);
  var start = boxes.filter(function (b) { return b.dataset.id === last; })[0];
  if (start && start !== boxes[0]) {
    var badge = document.createElement('span');
    badge.className = 'sticker last'; badge.textContent = '前回遊んだ';
    start.querySelector('.spine').insertBefore(badge, start.querySelector('.spine-open'));
  }
  open(start || boxes[0]);
  wide.addEventListener && wide.addEventListener('change', function () {
    if (wide.matches && !boxes.some(function (b) { return b.classList.contains('open'); })) open(boxes[0]);
  });

  // dice
  var diceBtn = document.getElementById('diceBtn'), out = document.getElementById('diceOut'), pips = document.getElementById('pips');
  var FACES = [[[14,14]],[[8.5,8.5],[19.5,19.5]],[[8.5,8.5],[14,14],[19.5,19.5]],[[8.5,8.5],[19.5,8.5],[8.5,19.5],[19.5,19.5]],[[8.5,8.5],[19.5,8.5],[14,14],[8.5,19.5],[19.5,19.5]],[[8.5,8],[19.5,8],[8.5,14],[19.5,14],[8.5,20],[19.5,20]]];
  function face(n) { pips.innerHTML = FACES[n].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4"/>'; }).join(''); }
  var rolling = false;
  diceBtn.addEventListener('click', function () {
    if (rolling || !boxes.length) return;
    rolling = true; out.textContent = '';
    var target = Math.floor(Math.random() * boxes.length);
    var steps = reduce.matches ? 1 : 9 + target + boxes.length;
    var i = 0, k = Math.floor(Math.random() * boxes.length);
    diceBtn.classList.add('rolling');
    (function tick() {
      boxes.forEach(function (b) { b.classList.remove('pick'); });
      face(Math.floor(Math.random() * 6));
      if (i >= steps) {
        diceBtn.classList.remove('rolling');
        var b = boxes[target];
        b.classList.add('pick');
        face(target % 6);
        open(b, { scroll: true });
        out.textContent = '「' + b.querySelector('.cover-title').textContent + '」に決まりました。';
        diceBtn.lastChild.textContent = 'もう一回振る';
        setTimeout(function () { b.classList.remove('pick'); }, 1600);
        rolling = false;
        return;
      }
      boxes[k % boxes.length].classList.add('pick');
      k++; i++;
      setTimeout(tick, 60 + i * 14);
    })();
  });

  // share
  var toastEl = document.getElementById('toast'), timer;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(timer); timer = setTimeout(function () { toastEl.hidden = true; }, 3200); }
  document.getElementById('copyLink').addEventListener('click', function () {
    var url = location.origin + location.pathname;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('リンクをコピーしました'); }, function () { toast(url); });
    } else toast(url);
  });

  var settingsDialog=document.getElementById('settingsDialog'), adminPassword='', draft=[], busy=false;
  function message(text,type){var el=document.getElementById('settingsMessage');el.textContent=text;el.className='settings-message '+(type||'');}
  async function request(path,body){
    var r=await fetch(SETTINGS_API+path,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Password':encodeURIComponent(adminPassword)},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(15000)});
    var data=await r.json();if(!r.ok)throw Error(data.error||'保存できませんでした');return data;
  }
  function makeDraft(){var ids=currentSettings.order.slice();var fresh=[];allBoxes.forEach(function(b){if(ids.indexOf(b.dataset.id)<0)fresh.push(b.dataset.id);});ids=fresh.concat(ids);draft=ids.filter(function(id){return allBoxes.some(function(b){return b.dataset.id===id;});}).map(function(id){var box=allBoxes.filter(function(b){return b.dataset.id===id;})[0];return{id:id,name:box.querySelector('.cover-title').textContent,visible:currentSettings.hidden.indexOf(id)<0};});renderDraft();}
  function renderDraft(focusId){var list=document.getElementById('settingsList');list.replaceChildren();draft.forEach(function(game,i){var li=document.createElement('li');li.className='settings-row';var num=document.createElement('span');num.textContent=i+1;var label=document.createElement('label');label.className='game-check';var check=document.createElement('input');check.type='checkbox';check.checked=game.visible;check.setAttribute('aria-label',game.name+'を表示');check.onchange=function(){game.visible=check.checked;};var name=document.createElement('span');name.textContent=game.name;label.append(check,name);li.append(num,label);[-1,1].forEach(function(delta){var button=document.createElement('button');button.textContent=delta<0?'↑':'↓';button.type='button';button.dataset.focus=game.id+':'+delta;button.disabled=i+delta<0||i+delta>=draft.length;button.setAttribute('aria-label',game.name+(delta<0?'を上へ':'を下へ'));button.onclick=function(){var other=draft[i+delta];draft[i+delta]=game;draft[i]=other;renderDraft(game.id+':'+delta);};li.append(button);});list.append(li);});if(focusId){var btn=Array.from(list.querySelectorAll('button')).find(function(b){return b.dataset.focus===focusId;});if(btn&&!btn.disabled)btn.focus();}}
  document.getElementById('settingsOpen').onclick=function(){message('');document.getElementById('settingsLogin').hidden=false;document.getElementById('settingsEditor').hidden=true;document.getElementById('adminPassword').value='';settingsDialog.showModal();};
  settingsDialog.addEventListener('close',function(){adminPassword='';document.getElementById('adminPassword').value='';document.getElementById('newPassword').value='';document.getElementById('confirmPassword').value='';});
  document.getElementById('settingsLogin').onsubmit=async function(e){e.preventDefault();if(busy)return;busy=true;var submit=e.target.querySelector('button');submit.disabled=true;message('確認しています…');adminPassword=document.getElementById('adminPassword').value;try{var data=await request('/api/login');applySettings(data);makeDraft();document.getElementById('settingsLogin').hidden=true;document.getElementById('settingsEditor').hidden=false;document.getElementById('adminPassword').value='';message('');}catch(err){adminPassword='';message(err.name==='TimeoutError'?'接続に時間がかかっています。もう一度お試しください':err.message,'error');}finally{busy=false;submit.disabled=false;}};
  document.getElementById('resetSettings').onclick=function(){draft=allBoxes.map(function(b){return{id:b.dataset.id,name:b.querySelector('.cover-title').textContent,visible:true};});renderDraft();message('初期の並びに戻しました。保存すると全員に反映されます。');};
  document.getElementById('saveSettings').onclick=async function(){if(busy)return;if(!draft.some(function(g){return g.visible;})){message('少なくとも1つのゲームを表示してください','error');return;}busy=true;this.disabled=true;message('保存しています…');try{var data=await request('/api/settings',{version:currentSettings.version,order:draft.map(function(g){return g.id;}),hidden:draft.filter(function(g){return !g.visible;}).map(function(g){return g.id;})});applySettings(data);message('保存しました。すべての端末・訪問者に反映されます。','success');toast('ゲーム集の設定を保存しました');}catch(err){message(err.message||'保存できませんでした','error');}finally{busy=false;this.disabled=false;}};
  document.getElementById('passwordForm').onsubmit=async function(e){e.preventDefault();if(busy)return;var pass=document.getElementById('newPassword').value;if(pass!==document.getElementById('confirmPassword').value){message('新しいパスワードが一致しません','error');return;}busy=true;var button=e.target.querySelector('button');button.disabled=true;message('パスワードを変更しています…');try{var data=await request('/api/password',{version:currentSettings.version,password:pass});adminPassword=pass;currentSettings.version=data.version;document.getElementById('newPassword').value='';document.getElementById('confirmPassword').value='';message('パスワードを変更しました','success');}catch(err){message(err.message||'変更できませんでした','error');}finally{busy=false;button.disabled=false;}};
  // Refresh shared settings when returning to this page. Keep an open editor's revision intact.
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&!settingsDialog.open)fetch(SETTINGS_API+'/api/settings',{cache:'no-store',signal:AbortSignal.timeout(8000)}).then(function(r){if(!r.ok)throw Error();return r.json();}).then(applySettings).catch(function(){});});
})();
