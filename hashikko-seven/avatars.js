/* The same little characters are used on the table and in every profile portrait.
   No external models or textures: soft silhouettes, stitched smiles and tiny scarves. */
import { createOddball } from './oddballs.js?v=oddballs-1';
export const AVATARS = [
  { id: 'cat', name: 'ねこ', color: '#edbb82', accent: '#87bdb2', bg: '#f4dfc3', note: 'きままな、カード好き。' },
  { id: 'dog', name: 'いぬ', color: '#c59670', accent: '#e8ae74', bg: '#ebd6c5', note: 'いつでも、いっしょに。' },
  { id: 'rabbit', name: 'うさぎ', color: '#f5e4de', accent: '#b59cd2', bg: '#f4e0e9', note: 'ぴんと、ひらめく。' },
  { id: 'bear', name: 'くま', color: '#bd8d66', accent: '#88ae88', bg: '#e9d7b9', note: 'のんびり、じっくり。' },
  { id: 'panda', name: 'パンダ', color: '#f1ece1', accent: '#86b69b', bg: '#dce8db', note: 'ころんと、マイペース。' },
  { id: 'fox', name: 'きつね', color: '#e9a05f', accent: '#93b4ce', bg: '#f4d9c4', note: 'にこっと、作戦中。' },
  { id: 'red-panda', name: 'レッサーパンダ', color: '#c97b55', accent: '#d3b66f', bg: '#ecd1c1', note: 'しっぽも、きもちもふわり。' },
  { id: 'otter', name: 'ラッコ', color: '#ae8b77', accent: '#8dc1cb', bg: '#d6e6e8', note: 'ちいさなおててに、大きな夢。' },
  { id: 'koala', name: 'コアラ', color: '#abb9bb', accent: '#a7ba87', bg: '#e0e7df', note: 'ゆったり、いい予感。' },
  { id: 'penguin', name: 'ペンギン', color: '#6e93ac', accent: '#e8ad9c', bg: '#dbe5f2', note: 'ちょこちょこ、挑戦。' },
  { id: 'hamster', name: 'ハムスター', color: '#e6bd87', accent: '#d5a2b7', bg: '#f3e4c9', note: 'ほっぺいっぱいの、ひらめき。' },
  { id: 'sheep', name: 'ひつじ', color: '#f0e5d1', accent: '#94a9cf', bg: '#e9e2f0', note: 'もこもこ、夢ごこち。' },
  { id: 'buff-chick', category: 'odd', name: 'マッチョひよこ', color: '#efc34f', bg: '#f0dfaa', note: '記憶より先に、上腕二頭筋。' },
  { id: 'alien-uncle', category: 'odd', name: '宇宙のおじさん', color: '#91b79c', bg: '#d9e5d6', note: '地球のルール、だいたい理解。' },
  { id: 'skull-gent', category: 'odd', name: 'ドクロ紳士', color: '#e5d5b9', bg: '#e1d9e6', note: '骨のある勝負を、どうぞ。' },
  { id: 'rice-boss', category: 'odd', name: 'おにぎり番長', color: '#f1e8d5', bg: '#e7dfc8', note: '具は秘密。義理は固め。' },
  { id: 'fried-shrimp', category: 'odd', name: 'エビフライ師匠', color: '#dca342', bg: '#f0dbbe', note: '衣はサクサク、読みは深い。' },
  { id: 'office-robot', category: 'odd', name: '社畜ロボ', color: '#9faeb8', bg: '#d8e3ec', note: '定時になったら、本気出す。' },
  { id: 'bonsai-sage', category: 'odd', name: '盆栽仙人', color: '#bc916b', bg: '#dce3c9', note: '百年待てるが、自分の番は待てぬ。' },
  { id: 'mushroom-boss', category: 'odd', name: 'きのこ親分', color: '#9d6b98', bg: '#e6d6df', note: 'その勝負、ひと皮むけるか。' },
  { id: 'muscle-shark', category: 'odd', name: '筋肉ザメ', color: '#779aa9', bg: '#d2e3e9', note: '噛まずに、勝負で語る。' },
  { id: 'box-samurai', category: 'odd', name: 'ダンボール侍', color: '#bc9466', bg: '#e9d8bf', note: '雨には弱い。勝負には強気。' }
];
export const cleanAvatar = (id) => AVATARS.some((a) => a.id === id) ? id : 'cat';
export const avatarInfo = (id) => AVATARS.find((a) => a.id === cleanAvatar(id));

export function createAnimal(T, id) {
  const a = avatarInfo(id);
  if (a.category === 'odd') return createOddball(T, a);
  const kind = a.id, g = new T.Group();
  g.userData.avatar = kind;
  const materials = new Map();
  const mat = (color, shiny = false) => {
    const key = color + shiny;
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: shiny ? .26 : .86 }));
    return materials.get(key);
  };
  const sphere = new T.SphereGeometry(1, 24, 16);
  function ball(color, x, y, z, sx, sy = sx, sz = sx, parent = g) {
    const m = new T.Mesh(sphere, mat(color));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
  }
  function line(color, points, r = .012, parent = g) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    const m = new T.Mesh(new T.TubeGeometry(curve, 12, r, 6, false), mat(color)); parent.add(m); return m;
  }
  const cream = '#fff3df', dark = '#443b38', pink = '#e9a4a2';
  const black = '#4b4c50', fur = a.color;
  const feet = kind === 'penguin' ? '#e8b574' : kind === 'panda' || kind === 'red-panda' ? black : fur;
  // A pear-shaped body with plump feet, a little tail and gently tucked paws.
  ball(fur, 0, .43, 0, .31, .37, .25);
  ball(cream, 0, .40, .215, .21, .25, .065);
  for (const s of [-1, 1]) {
    ball(feet, s * .18, .10, .12, .145, .10, .19);
    const arm = ball(kind === 'panda' || kind === 'red-panda' ? black : fur, s * .29, .44, .065, .105, .205, .115);
    arm.rotation.z = s * .32;
  }
  if (kind === 'cat') {
    line(fur, [[.20,.20,-.18],[.45,.22,-.26],[.53,.49,-.23],[.47,.59,-.20]], .085);
  } else if (kind === 'fox' || kind === 'red-panda') {
    const tail = ball(fur, .34, .30, -.18, .20, .29, .18); tail.rotation.z = -.7;
    ball(kind === 'fox' ? cream : dark, .48, .49, -.16, .16, .14, .16);
    if (kind === 'red-panda') { ball(dark,.33,.29,-.22,.20,.055,.17).rotation.z=-.7; }
  } else if (kind !== 'penguin') ball(kind === 'rabbit' ? cream : fur, .24, .25, -.21, .13);
  const face = new T.Group(); g.add(face);
  const head = ball(fur, 0, 1.00, 0, .43, .37, .345, face);
  if (kind === 'hamster') head.scale.set(.45,.35,.345);
  // Each species has its own silhouette, face markings and muzzle.
  function roundEars(color = fur, inner = pink, x = .32, y = 1.29, size = .145) {
    for (const s of [-1,1]) { ball(color,s*x,y,-.015,size,size,.10,face); ball(inner,s*x,y,.073,size*.61,size*.60,.025,face); }
  }
  function pointEars(color = fur, inner = pink, height = .29) {
    for (const s of [-1,1]) {
      const ear = new T.Mesh(new T.ConeGeometry(.17,height,3),mat(color));
      ear.position.set(s*.30,1.32,-.005); ear.rotation.y=Math.PI/2; ear.rotation.z=-s*.19; face.add(ear); ear.castShadow=true;
      const inset = new T.Mesh(new T.ConeGeometry(.10,height*.63,3),mat(inner));
      inset.position.set(s*.30,1.33,.07); inset.rotation.copy(ear.rotation); face.add(inset);
    }
  }
  if (kind === 'cat') {
    pointEars();
    for (const x of [-.10,0,.10]) ball('#c78d59',x,1.27,.205,.025,.064,.018,face);
    for (const s of [-1,1]) for (let j=0;j<2;j++) line('#a47a63',[[s*.26,.91-j*.045,.283],[s*.40,.94-j*.07,.23]],.008,face);
  } else if (kind === 'dog') {
    for (const s of [-1,1]) { const ear=ball('#93684f',s*.38,1.04,-.025,.14,.29,.13,face); ear.rotation.z=s*.20; }
    ball(cream,0,.89,.29,.25,.15,.10,face);
    ball('#a77556',-.19,1.09,.27,.13,.14,.065,face);
  } else if (kind === 'rabbit') {
    for (const s of [-1,1]) {
      const ear=ball(fur,s*.19,1.49,-.035,.115,.36,.09,face); ear.rotation.z=-s*.15;
      const inside=ball('#e2b6ba',s*.19,1.50,.042,.057,.27,.028,face); inside.rotation.z=ear.rotation.z;
    }
  } else if (kind === 'bear') { roundEars(fur,'#e4bd98'); ball('#e9c9a4',0,.88,.30,.23,.15,.08,face); }
  else if (kind === 'panda') {
    roundEars(black,black);
    for (const s of [-1,1]) { const patch=ball(black,s*.18,1.03,.28,.105,.14,.055,face); patch.rotation.z=-s*.35; }
  } else if (kind === 'fox') {
    pointEars(fur,'#5b4841',.35);
    for (const s of [-1,1]) { const cheek=ball(cream,s*.19,.91,.25,.235,.17,.13,face); cheek.rotation.z=s*.2; }
  } else if (kind === 'red-panda') {
    roundEars('#e9cfad',cream,.34,1.29,.16);
    for (const s of [-1,1]) {
      ball(cream,s*.28,.91,.245,.17,.15,.09,face);
      ball(cream,s*.16,1.10,.285,.105,.11,.045,face);
      ball('#654b41',s*.17,1.015,.315,.10,.077,.035,face);
    }
    ball(cream,0,.88,.31,.17,.12,.07,face);
  } else if (kind === 'otter') {
    roundEars(fur,'#d3b198',.35,1.18,.10);
    ball('#ead4b9',0,.94,.26,.35,.24,.12,face);
    for (const s of [-1,1]) ball(cream,s*.115,.87,.365,.13,.09,.045,face);
    ball(cream,0,.36,.29,.13,.12,.08);
  } else if (kind === 'koala') {
    roundEars(fur,'#e4d4d0',.40,1.17,.225);
    for (const s of [-1,1]) for(let j=0;j<5;j++) {const t=j*Math.PI*2/5;ball('#c1cdce',s*.40+Math.cos(t)*.16,1.17+Math.sin(t)*.16,-.01,.078,.08,.095,face);}
    ball('#53595b',0,1.00,.343,.095,.14,.075,face);
  } else if (kind === 'penguin') {
    for (const s of [-1,1]) ball(cream,s*.13,.985,.25,.235,.275,.10,face);
    ball('#e8b574',0,.91,.367,.11,.065,.085,face);
    for (const s of [-1,1]) ball(fur,s*.34,.47,0,.095,.27,.15).rotation.z=s*.30;
  } else if (kind === 'hamster') {
    roundEars(fur,'#dfb3ab',.31,1.27,.125);
    for (const s of [-1,1]) ball(cream,s*.23,.88,.24,.22,.17,.12,face);
    ball(cream,0,.89,.31,.22,.14,.06,face);
    ball(cream,0,1.23,.235,.10,.105,.045,face);
  } else if (kind === 'sheep') {
    head.material=mat('#d6bba0');
    for (const s of [-1,1]) { ball('#d6bba0',s*.41,1.05,0,.19,.09,.10,face).rotation.z=s*.3; ball(pink,s*.44,1.05,.07,.10,.035,.025,face); }
    for (let j=0;j<11;j++) {const t=j*Math.PI*2/11;ball(fur,Math.sin(t)*.32,1.05+Math.cos(t)*.28,-.075,.17,.17,.18,face);}
    for (const [x,y,z] of [[-.22,1.28,.18],[0,1.34,.20],[.22,1.28,.18],[0,1.40,0]]) ball(cream,x,y,z,.16,.14,.13,face);
  }
  // Tiny glass eyes, high catchlights, rosy cheeks and an embroidered little smile.
  for (const s of [-1,1]) {
    const z = kind==='otter' ? .393 : ['penguin','fox','hamster','dog'].includes(kind) ? .354 : kind==='red-panda' ? .354 : kind==='panda' ? .332 : .32;
    const eye=ball(dark,s*.16,1.025,z,.038,.047,.027,face); eye.material=mat(dark,true);
    ball('#fff8e9',s*.16-.010,1.042,z+.025,.012,.014,.007,face);
    const cheekZ=kind==='otter' ? .378 : ['penguin','fox','hamster','dog'].includes(kind) ? .343 : .295;
    ball(pink,s*.267,.927,cheekZ,.065,.035,.019,face);
  }
  const noseZ=kind==='otter' ? .433 : ['fox','dog','hamster','bear','red-panda'].includes(kind) ? .390 : .367;
  if (!['koala','penguin'].includes(kind)) ball(kind==='cat'||kind==='rabbit'||kind==='hamster'? '#b87679':dark,0,.923,noseZ,.044,.031,.025,face);
  if (kind !== 'penguin') {
    const y=kind==='koala'?.84:.866, z=kind==='koala'?.33:noseZ+.012;
    line('#795d55',[[-.069,y+.018,z],[0,y,z+.004],[.069,y+.018,z]],.009,face);
    if(kind!=='koala') line('#795d55',[[0,.913,z],[0,y,z+.005]],.007,face);
  }
  // Soft scarf, asymmetric knot, and a tiny honey-colored button.
  const scarf = new T.Mesh(new T.TorusGeometry(.239,.045,8,32),mat(a.accent));
  scarf.rotation.x=Math.PI/2; scarf.position.set(0,.686,0); g.add(scarf);
  const end=ball(a.accent,.17,.605,.25,.075,.14,.032); end.rotation.z=-.30;
  ball('#f4cf80',0,.66,.252,.034,.034,.015);
  g.userData.face=face;
  return g;
}

export function disposeAnimal(animal) {
  const geometries=new Set(), materials=new Set();
  animal.traverse((m)=>{if(m.isMesh){geometries.add(m.geometry);materials.add(m.material);}});
  geometries.forEach((g)=>g.dispose()); materials.forEach((m)=>m.dispose());
}

export function createPortraits(T) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setSize(192,192); renderer.setPixelRatio(1); renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
  renderer.setClearColor(0,0);
  const scene=new T.Scene(), camera=new T.OrthographicCamera(-.95,.95,1,-1,.1,15);
  camera.position.set(0,1.35,5); camera.lookAt(0,.92,0);
  scene.add(new T.HemisphereLight('#fff5e9','#b0a2a0',2.6));
  const key=new T.DirectionalLight('#fff0dd',3);key.position.set(-3,5,5);scene.add(key);
  const fill=new T.DirectionalLight('#d9e9ff',1.4);fill.position.set(4,2,3);scene.add(fill);
  const images={};
  try {
    for(const a of AVATARS){
      const animal=createAnimal(T,a.id); animal.rotation.y=-.10; scene.add(animal);
      renderer.render(scene,camera);images[a.id]=renderer.domElement.toDataURL('image/png');
      scene.remove(animal);disposeAnimal(animal);
    }
  } finally {renderer.dispose();renderer.forceContextLoss();}
  return images;
}
