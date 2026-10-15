/* Deterministic practice positions; every action uses the actual game engine. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./engine.js') : root.NFD_ENG);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NFD_LESSONS = api;
})(globalThis, function(E) {
  'use strict';
  const id = name => E.CARDS.find(c => c.name === name).id;
  function position(names, age = 1) {
    const s = E.newGame(18941, {first:0});
    Object.assign(s, {phase:'play', age, draft:null, active:0});
    s.slots = names.map((name,i) => ({row:0,x:i,card:id(name),up:true,taken:false,cov:[]}));
    return s;
  }
  const own = (s,names,seat=0) => { s.p[seat].cards = names.map(id); };
  const lessons = [
    {
      id:'draft',title:'まずは、建てたい不思議を選ぶ',group:'準備',
      intro:'あなたと相手が、それぞれ自分の都市を育てます。最初に、大きな建物「不思議」を4つずつ予約しましょう。ここでは好きなものを選んで大丈夫です。',
      task:'好きな不思議を選んでください。相手の選択は自動で進みます。',
      why:'これは予約です。選んだだけでは効果も点数も得られません。対戦中に資源を払って建てます。途中で2つ続けて選ぶ番もあります。',
      setup:()=>E.newGame(18941,{first:0}),accepts:a=>a.k==='draft',done:s=>s.phase!=='draft',
      success:'4つずつ予約できました！ 本番もこのあと第一時代が始まります。次からは、覚えたいルールに合わせた小さな練習盤面を使います。'
    },
    {
      id:'build',title:'1枚取って、自分の都市に建てる',group:'手番の基本',
      intro:'手番ですることは、場から1枚取ること。そのカードを「建てる」「売る」「不思議の土台にする」のどれかに使います。まずは建ててみましょう。',
      task:'光っている「採石場」を選び、「建てる」を押してください。',
      why:'採石場は無料です。建てると自分の都市に残り、以後は建設のたびに石材1つを用意してくれます。通常は1枚取ったら相手の番です。',
      setup:()=>position(['採石場','劇場']),accepts:a=>a.k==='build'&&a.slot===0,done:s=>s.slots[0].taken,
      success:'採石場が自分の都市に入り、石材の生産が0→1になりました。コインは減っていません。これで1手番が終わり、次は相手の番です。'
    },
    {
      id:'uncover',title:'取れるのは、上に重なりがないカード',group:'手番の基本',
      intro:'奥のカードは、手前のカードを取るまで選べません。裏向きでも同じです。まず手前の採石場を取ってみましょう。',
      task:'手前の「採石場」を建てましょう。相手がもう1枚取ったら、奥の「酒場」を建ててください。',
      why:'上に重なっているカードが全部なくなると取れます。裏向きならそのとき表になります。自分の選択で、相手に欲しいカードを開けてしまうこともあります。',
      setup:()=>{const s=position(['酒場','採石場','見張り塔','祭壇']);Object.assign(s.slots[0],{row:0,x:0,up:false,cov:[1,2]});Object.assign(s.slots[1],{row:1,x:-.5});Object.assign(s.slots[2],{row:1,x:.5});s.slots[3].row=1;return s;},
      target:s=>s.slots[1].taken?0:1,accepts:(a,s)=>a.k==='build'&&a.slot===(s.slots[1].taken?0:1),
      reply:s=>s.slots[1].taken&&!s.slots[2].taken?{k:'build',slot:2}:null,done:s=>s.slots[0].taken,
      success:'2枚の重なりがなくなると、裏の酒場が表になりました。酒場を建てたので4コイン獲得。自分と相手の選択で、取れるカードが変わります。'
    },
    {
      id:'resources',title:'資源は、何度でも使える',group:'資源とお金',
      intro:'この練習では採石場と製材所を持っています。石材と木材を毎手番1つずつ用意できます。使い切る在庫ではありません。',
      task:'「浴場」を建て、そのあと「演壇」を建ててください。途中の相手の手番は自動です。',
      why:'1回の建設に石材が3つ必要なら、石材1つの生産だけでは2つ不足します。でも次の手番には同じ生産をまた使えます。茶と灰のカードを早めに建てると、後の支払いを減らせます。',
      setup:()=>{const s=position(['浴場','演壇','祭壇','劇場'],2);own(s,['採石場','製材所']);return s;},
      target:s=>s.slots[0].taken?1:0,accepts:(a,s)=>a.k==='build'&&a.slot===(s.slots[0].taken?1:0),
      reply:s=>s.slots[0].taken&&!s.slots[2].taken?{k:'build',slot:2}:null,done:s=>s.slots[0].taken&&s.slots[1].taken,
      success:'2枚とも無料で建てられました。浴場に使った石材を、演壇にも使えています。石材1・木材1の生産は、どちらもそのまま残ります。'
    },
    {
      id:'trade',title:'足りない資源は、お金で補える',group:'資源とお金',
      intro:'厩舎には木材1つが必要ですが、あなたは木材を作れません。相手は木材1つを作っているので、銀行から買う値段は2＋1＝3コインです。',
      task:'「厩舎」を選び、3コイン払って建ててください。購入は自動で行います。',
      why:'交易の基本価格は「2＋相手の茶・灰カードが生産する数」。銀行へ払い、買った資源は今回だけ使えます。黄色の備蓄などがあると安くなります。相手に進歩トークン「経済」がある場合は相手が交易分のコインを受け取ります。',
      setup:()=>{const s=position(['厩舎','祭壇']);own(s,['製材所'],1);return s;},accepts:a=>a.k==='build'&&a.slot===0,done:s=>s.slots[0].taken,
      success:'7→4コインで厩舎を建設。盾1つで軍事コマも1マス進みました。木材の生産は0のままです。次の建設で木材が足りなければ、また買う必要があります。'
    },
    {
      id:'sell',title:'お金に困ったら、建てずに売る',group:'資源とお金',
      intro:'今は0コイン。宮殿は高くて建てられません。こんなときもカードは取れます。「売る」で捨てて、お金にしましょう。',
      task:'「宮殿」を選び、「売る」を押してください。',
      why:'売るともらえるのは2コイン＋自分の黄色カードの枚数。この練習では黄色の酒場が1枚あるので3コインです。売ったカードの点数や効果はもらえません。相手に渡したくないカードを消す使い方もあります。',
      setup:()=>{const s=position(['宮殿','劇場'],3);own(s,['酒場']);s.p[0].coins=0;return s;},accepts:a=>a.k==='discard'&&a.slot===0,done:s=>s.slots[0].taken,
      success:'宮殿を売り、0→3コインになりました。宮殿は捨て札へ行くので、宮殿の7点は入りません。取ったカードの使い道は、1つだけです。'
    },
    {
      id:'chain',title:'同じマークがあれば、無料で建てられる',group:'資源とお金',
      intro:'あなたの劇場には「仮面」の連鎖マークがあります。彫像にも同じマークがあるので、粘土もコインも払わず建てられます。',
      task:'「彫像」を選び、連鎖で無料建設してください。',
      why:'自分の都市にあるカードの右上の連鎖マークと、これから建てるカードの左下のマークを見比べます。この組み合わせは「劇場→彫像」。劇場はなくならず、2枚とも残ります。',
      setup:()=>{const s=position(['彫像','祭壇'],2);own(s,['劇場']);s.p[0].coins=0;return s;},accepts:a=>a.k==='build'&&a.slot===0,done:s=>s.slots[0].taken,
      success:'0コインのまま彫像を建て、4点獲得。粘土を持っていなくても大丈夫でした。劇場の3点と合わせて、青いカードの点数は7点です。'
    },
    {
      id:'wonder',title:'カードを土台に、不思議を建てる',group:'3つの勝ち方',
      intro:'予約したピラミッドを建てましょう。必要なのは石材3つとパピルス1つ。この練習では、すでに全部生産できます。場のカード1枚を土台にします。',
      task:'「酒場」を選び、「ピラミッドを建てる」を押してください。',
      why:'土台にするカード自体のコストは払いません。そのカードの効果も得られません。不思議は2人合わせて7つまで。8つ目は建てられません。「もう一度手番」のある不思議を建てると、続けて1枚取れます。',
      setup:()=>{const s=position(['酒場','祭壇'],2);own(s,['段丘採石場','採石場','製紙所']);s.p[0].wonders=[{w:8,card:-1}];return s;},
      accepts:a=>a.k==='wonder'&&a.slot===0&&a.w===8,done:s=>E.builtWonders(s.p[0])===1,
      success:'ピラミッドが完成し、9点獲得！ 酒場は土台に使ったので、酒場の4コインはもらえません。コインも生産も減らず、不思議の効果だけが入りました。'
    },
    {
      id:'military',title:'軍事は、端まで押したら即勝ち',group:'3つの勝ち方',
      intro:'赤いカードの盾1つにつき、コマを相手の首都へ1マス押します。相手が赤を建てると逆に押し戻されます。今は相手の首都まであと1マスです。',
      task:'「見張り塔」を建て、コマを相手の首都へ押し込んでください。',
      why:'中央から9マスで相手の首都。届いた瞬間に終了し、点数が負けていても勝ちです。途中の3・6マスの区切りを初めて越えると、相手は2・5コインを失います。',
      setup:()=>{const s=position(['見張り塔','劇場']);s.mil=8;s.loot.a3=false;s.loot.a6=false;return s;},accepts:a=>a.k==='build'&&a.slot===0,done:s=>s.result&&s.result.how==='military',
      success:'軍事的勝利！ 首都まで押し切れば、その場で勝ちです。自分の点数だけでなく、軍事コマがどちらの端に近いかも見ておきましょう。'
    },
    {
      id:'progress',title:'同じ科学を2つで、ボーナスを選ぶ',group:'3つの勝ち方',
      intro:'緑のカードには科学のマークがあります。写字室と図書館は、どちらも「羽根ペン」。同じマークを2つそろえると、進歩トークンを1つもらえます。',
      task:'「図書館」を建てたら、進歩トークン「農業」を選んでください。',
      why:'同じマークを2つ集めるのは、ボーナスを得るためです。次の練習で覚える「6種類集めて勝つ」とは数え方が違います。図書館は写字室の連鎖マークで無料になります。',
      setup:()=>{const s=position(['図書館','祭壇'],2);own(s,['写字室']);s.boardTok=[E.T.AGRI,E.T.PHILO,E.T.MASON];return s;},
      accepts:(a,s)=>s.pend?a.k==='progress'&&a.tok===E.T.AGRI:a.k==='build'&&a.slot===0,done:s=>s.p[0].tok.includes(E.T.AGRI),
      success:'羽根ペン2つで農業を獲得し、6コインと4点が入りました。科学はまだ1種類です。同じマークが増えても、種類の数は増えません。'
    },
    {
      id:'science',title:'違う科学を6種類で、即勝ち',group:'3つの勝ち方',
      intro:'今は違う科学マークを5種類持っています。大学の「天球」はまだ持っていません。これを加えると6種類です。',
      task:'「大学」を建て、6種類目の科学をそろえてください。',
      why:'科学的勝利は「緑カード6枚」ではなく「違うマーク6種類」です。同じマークの2枚目は進歩トークン、初めてのマークは種類が増える、と分けて考えましょう。',
      setup:()=>{const s=position(['大学','劇場'],3);own(s,['写字室','薬剤師','工房','薬屋','アカデミー']);return s;},accepts:a=>a.k==='build'&&a.slot===0,done:s=>s.result&&s.result.how==='science',
      success:'科学的勝利！ 6種類をそろえた瞬間に終了です。軍事と科学は、第三時代の終わりを待たずに決着します。'
    },
    {
      id:'score',title:'最後まで決着しなければ、点数で勝負',group:'3つの勝ち方',
      intro:'最後は第三時代の残り1枚。軍事・科学で決着しなければ、都市の点数を合計します。今のあなたは青の6点と、6コインによる2点を持っています。',
      task:'最後の「浴場」を建てて、得点結果を見てください。',
      why:'青いカード、不思議、進歩トークン、軍事などの点と、残った3コインにつき1点を合計します。茶や灰は直接点を生みませんが、建設を安くして都市を育てます。同点なら青カードの点数、それも同じなら引き分けです。',
      setup:()=>{const s=position(['浴場'],3);own(s,['劇場','祭壇','採石場']);own(s,['神殿'],1);s.p[0].coins=6;s.p[1].coins=9;return s;},accepts:a=>a.k==='build'&&a.slot===0,done:s=>s.result&&s.result.how==='civil',
      success:'繁栄による勝利！ 浴場の3点が入り、あなたは青9点＋コイン2点＝11点。相手は7点です。資源で準備し、軍事と科学に気を配りながら、点数を伸ばしていきましょう。'
    }
  ];
  function target(l,s) { return l.target?l.target(s):0; }
  function act(l,s,a) {
    if(l.done(s))return {ok:false,message:'この練習は完了です。「次の練習へ」で進みましょう。'};
    if(!l.accepts(a,s))return {ok:false,message:l.task};
    const r=E.apply(s,0,a);
    if(!r.ok)return {ok:false,message:'まだその操作はできません。光っているカードと、必要なコインを確認しましょう。'};
    const events=r.events.slice();let opponent=false;
    const reply = a => {const r=E.apply(s,1,a);if(!r.ok)throw new Error('Tutorial reply failed');events.push(...r.events);opponent=true;};
    if(l.id==='draft'){while(s.phase==='draft'&&s.active===1)reply(E.actions(s,1)[0]);}
    else if(l.reply&&!l.done(s)){const a=l.reply(s);if(a)reply(a);}
    return {ok:true,events,opponent,done:!!l.done(s)};
  }
  return {lessons,target,act};
});

