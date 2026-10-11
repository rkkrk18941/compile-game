'use strict';
// Original arena score. The audio graph runs on Web Audio's rendering thread.
(() => {
  function create(e) {
    const arrange = {
      menu: [
        {n:'IGNITION',bars:4,L:{pad:.55,bass:.7,drum:.55,mel:0,arp:0}},
        {n:'NIGHT RUN',bars:8,L:{pad:.65,bass:.85,drum:.7,mel:.5,arp:.5}},
        {n:'MAIN THEME',bars:8,L:{pad:.8,bass:1,drum:.85,mel:.8,arp:.7,crash:1}},
        {n:'AFTERGLOW',bars:4,L:{pad:.75,bass:.5,drum:.25,mel:.4,arp:0}}
      ],
      battle: [
        {n:'ENGAGE',bars:8,L:{pad:.55,bass:1,drum:1,mel:.35,arp:.65,crash:1}},
        {n:'PRESSURE',bars:4,L:{pad:.6,bass:.9,drum:1,mel:0,arp:.8,rise:1}},
        {n:'FULL THROTTLE',bars:8,L:{pad:.8,bass:1,drum:1,mel:1,arp:1,crash:1}},
        {n:'RELOAD',bars:4,L:{pad:.8,bass:.45,drum:.3,mel:.5,arp:0}}
      ]
    };
    const progression = [
      {b:38,n:[50,53,57,62]}, {b:38,n:[50,53,57,62]},
      {b:34,n:[46,50,53,60]}, {b:34,n:[46,50,53,60]},
      {b:41,n:[53,57,60,65]}, {b:41,n:[53,57,60,65]},
      {b:36,n:[48,52,55,62]}, {b:33,n:[45,52,57,61]}
    ];
    const hook = [
      [[0,62,2],[3,62,1],[6,65,2],[10,69,4]],
      [[0,67,3],[6,65,2],[10,62,5]],
      [[0,62,2],[3,65,1],[6,69,3],[12,70,3]],
      [[0,69,4],[7,65,2],[12,62,3]],
      [[0,65,2],[3,65,1],[6,69,2],[10,72,4]],
      [[0,69,3],[6,67,2],[10,65,5]],
      [[0,67,3],[6,65,2],[10,62,3]],
      [[0,64,3],[6,61,3],[12,57,3]]
    ];
    const riffs = [
      [[0,0,2,1],[3,0,1,.65],[6,7,2,.8],[8,0,2,1],[11,12,1,.65],[14,7,1,.8]],
      [[0,0,2,1],[3,12,1,.7],[6,0,2,.85],[10,7,2,.9],[14,0,1,.8]],
      [[0,0,3,1],[5,0,1,.7],[8,7,2,.85],[11,12,1,.65],[14,7,1,.8]],
      [[0,0,2,1],[3,0,1,.7],[6,7,2,.8],[10,0,2,.9],[13,12,2,.7]]
    ];
    const tracks = [
      {id:'circuit',label:'BLACK CIRCUIT',sub:'重低音 × インダストリアル・ブレイクビーツ',bpm:132,engine:'arena',groove:'break',prog:progression,mel:hook,drive:2.6,tone:1},
      {id:'redline',label:'REDLINE RUSH',sub:'疾走するドラム＆ベース',bpm:170,engine:'arena',groove:'dnb',prog:progression,mel:hook,drive:2.1,tone:1.15},
      {id:'afterburn',label:'NIGHT ENGINE',sub:'重いビートと深いシンセのミッドテンポ',bpm:108,engine:'arena',groove:'half',prog:progression,mel:hook,drive:3.1,tone:.72}
    ];
    const curves = new Map(); let noiseBuffer = null;
    const ac = () => e.context();
    function curve(drive) {
      if (!curves.has(drive)) {
        const a = new Float32Array(512), norm = Math.tanh(drive);
        for(let i=0;i<a.length;i++)a[i]=Math.tanh((2*i/(a.length-1)-1)*drive)/norm;
        curves.set(drive,a);
      }
      return curves.get(drive);
    }
    function envelope(node,t,d,g,attack=.008,release=.07) {
      node.gain.setValueAtTime(.0001,t);
      node.gain.exponentialRampToValueAtTime(Math.max(.0002,g),t+attack);
      node.gain.setValueAtTime(Math.max(.0002,g*.8),t+Math.max(attack,d));
      node.gain.exponentialRampToValueAtTime(.0001,t+d+release);
    }
    function run(source,t,d,nodes) {
      source.onended=()=>{source.disconnect();for(const n of nodes)n.disconnect();};
      source.start(t);source.stop(t+d);
    }
    function bass(f,when,d,g,tr) {
      const c=ac(),t=c.currentTime+when;
      const fl=c.createBiquadFilter();fl.type='lowpass';fl.Q.value=1.1;
      fl.frequency.setValueAtTime(150*tr.tone,t);
      fl.frequency.exponentialRampToValueAtTime(980*tr.tone,t+.025);
      fl.frequency.exponentialRampToValueAtTime(140*tr.tone,t+d);
      const sh=c.createWaveShaper();sh.curve=curve(tr.drive);sh.oversample='2x';
      const v=c.createGain();envelope(v,t,d,.16*g,.008,.055);
      fl.connect(sh);sh.connect(v);v.connect(e.out());
      const a=c.createOscillator(),b=c.createOscillator();
      a.type='sawtooth';b.type='sawtooth';a.frequency.value=b.frequency.value=f;
      a.detune.value=-5;b.detune.value=5;a.connect(fl);b.connect(fl);
      // Disconnect the shared graph only after both oscillators have ended.
      a.start(t);a.stop(t+d+.08);run(b,t,d+.09,[fl,sh,v]);a.onended=()=>a.disconnect();
      const sub=c.createOscillator(),sv=c.createGain();sub.type='sine';sub.frequency.value=f/2;
      envelope(sv,t,d,.23*g,.008,.055);sub.connect(sv);sv.connect(e.out());run(sub,t,d+.08,[sv]);
    }
    function chord(notes,when,d,g,wide=false) {
      const c=ac(),t=c.currentTime+when;
      notes.slice(0,wide?4:3).forEach((note,i)=>{
        const o=c.createOscillator(),fl=c.createBiquadFilter(),v=c.createGain();
        o.type='sawtooth';o.frequency.value=e.mtof(note);o.detune.value=(i-1)*4;
        fl.type='lowpass';fl.Q.value=.6;
        fl.frequency.setValueAtTime(wide?640:1350,t);
        fl.frequency.exponentialRampToValueAtTime(wide?1100:420,t+Math.max(.03,d*.8));
        envelope(v,t,d,(wide?.035:.065)*g,wide?.12:.008,wide?.45:.11);
        o.connect(fl);fl.connect(v);
        const pan=c.createStereoPanner?.();
        if(pan){pan.pan.value=(i-(Math.min(notes.length,wide?4:3)-1)/2)*(wide?.32:.22);v.connect(pan);pan.connect(e.out());}
        else v.connect(e.out());
        e.sendRev(v,wide?.4:.13);
        run(o,t,d+(wide?.48:.15),[fl,v,...(pan?[pan]:[])]);
      });
    }
    function melody(note,when,d,g,tr) {
      const c=ac(),t=c.currentTime+when,f=e.mtof(note);
      const o=c.createOscillator(),mod=c.createOscillator(),depth=c.createGain();
      o.type='triangle';o.frequency.value=f;mod.type='sine';mod.frequency.value=f*2;
      depth.gain.setValueAtTime(f*.9,t);depth.gain.exponentialRampToValueAtTime(f*.025,t+.14);
      mod.connect(depth);depth.connect(o.frequency);
      const fl=c.createBiquadFilter(),v=c.createGain();fl.type='lowpass';fl.frequency.value=2800*tr.tone;
      envelope(v,t,d,.13*g,.012,.17);o.connect(fl);fl.connect(v);v.connect(e.out());e.sendRev(v,.25);
      const delay=c.createDelay(.5),tail=c.createGain();delay.delayTime.value=60/tr.bpm*.75;tail.gain.value=.2;
      v.connect(delay);delay.connect(tail);tail.connect(e.out());
      mod.start(t);mod.stop(t+d+.2);run(o,t,d+.22,[fl,v,depth]);mod.onended=()=>mod.disconnect();
      // Keep the single delay tap alive until its tail has rendered.
      o.addEventListener('ended',()=>setTimeout(()=>{delay.disconnect();tail.disconnect();},800),{once:true});
    }
    function noise(when,d,g,cut,type='highpass') {
      const c=ac(),t=c.currentTime+when;
      if(!noiseBuffer){noiseBuffer=c.createBuffer(1,Math.ceil(c.sampleRate*.5),c.sampleRate);
        const a=noiseBuffer.getChannelData(0);let seed=104729;
        for(let i=0;i<a.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;a[i]=seed/2147483648-1;}}
      const s=c.createBufferSource(),fl=c.createBiquadFilter(),v=c.createGain();s.buffer=noiseBuffer;s.loop=true;
      fl.type=type;fl.frequency.value=cut;fl.Q.value=.65;
      v.gain.setValueAtTime(Math.max(.0002,g),t);v.gain.exponentialRampToValueAtTime(.0001,t+d);
      s.connect(fl);fl.connect(v);v.connect(e.drumBus());run(s,t,d+.025,[fl,v]);
    }
    function backbeat(when,g) {
      e.snare(when,g*1.6);
      noise(when+.014,.1,.072*g,1850);noise(when+.029,.07,.042*g,2300);
    }
    function rhythm(pos,bar,when,spb,L,tr,build,fill) {
      const g=L.drum;if(!g)return;
      const kicks=tr.groove==='half'?[0,11,14]:tr.groove==='dnb'?[0,6,9]:bar%2?[0,3,10]:[0,6,10];
      if(kicks.includes(pos)){e.kick(when,g*1.7);e.pump(when,.42,Math.min(.24,spb*2.1));}
      if((tr.groove==='half'?pos===8:pos===4||pos===12))backbeat(when,g);
      if(pos%2===0&&L.drum>=.5)e.hat(when,.035,g*(pos%4===2?.75:.4),false);
      if((bar%2===1&&pos===15)||(tr.groove==='dnb'&&pos%4===3))e.hat(when,.028,g*.32,false);
      if(pos===14&&bar%4===3)e.hat(when,.1,g*.6,true);
      if(bar%4===3&&(pos===7||pos===11))noise(when,.045,g*.025,1250);
      if(L.arp&&pos===7)noise(when,.07,.022*L.arp,820,'bandpass');
      if(build&&pos%((bar%4===3)?1:2)===0&&pos>=8)noise(when,.036,.023*(1+pos/16),1750);
      if(fill&&pos>=12&&pos%2===0)e.tom(pos===12?145:105,when,g*.45);
    }
    function scheduleStep(step,t,spb,tr) {
      const B=e.state,pos=step&15,when=Math.max(0,t-ac().currentTime);
      if(pos===0){
        const mode=e.mode();if(mode!==B.mode){B.mode=mode;B.sec=0;B.secBar=0;}
        const p=arrange[B.mode]||arrange.menu;
        if(B.secBar>=p[B.sec%p.length].bars){B.sec=(B.sec+1)%p.length;B.secBar=0;}
        B.bar++;
      }
      const plan=arrange[B.mode]||arrange.menu,section=plan[B.sec%plan.length],L=section.L;
      const bar=B.bar%tr.prog.length,ch=tr.prog[bar],fill=B.secBar===section.bars-1;
      if(pos===0){
        chord(ch.n,when,spb*14,L.pad,true);
        if(L.crash&&B.secBar===0)e.crash(when,.6);
        if(L.rise&&B.secBar===0)e.riser(when,spb*16*section.bars);
      }
      const riff=tr.groove==='half'?[[0,0,4,1],[6,0,2,.65],[10,7,2,.8],[14,12,1,.65]]:riffs[bar%riffs.length];
      for(const [p,interval,len,vel] of riff)if(p===pos){
        const density=B.mode==='menu'&&B.sec===0?pos===0||pos===8:true;
        if(density&&L.bass)bass(e.mtof(ch.b+interval),when,spb*len*.72,L.bass*vel,tr);
      }
      rhythm(pos,bar,when,spb,L,tr,!!L.rise,fill);
      if(L.arp&&[2,7,10,15].includes(pos))chord(ch.n,when,spb*(pos===7?1.2:.7),L.arp*.65);
      if(L.mel)for(const [p,n,len] of tr.mel[bar])if(p===pos)melody(n,when,spb*len*.78,L.mel,tr);
      if(pos===15)B.secBar++;
    }
    return Object.freeze({tracks,arrange,scheduleStep});
  }
  globalThis.COMPILE_SCORE=Object.freeze({create});
})();
