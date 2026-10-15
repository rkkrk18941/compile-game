/* Ten odd little table companions. Built as real meshes so the portrait and table match. */
export function createOddball(T, a) {
  const g = new T.Group(); g.userData.avatar = a.id;
  const materials = new Map(), sphere = new T.SphereGeometry(1, 22, 14);
  const ink='#39383b', cream='#fff1d7', white='#f5ecdf', gold='#d9b15d';
  function mat(c){if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:.72}));return materials.get(c);}
  function mesh(geometry,c,x,y,z){const m=new T.Mesh(geometry,mat(c));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;}
  function ball(c,x,y,z,sx,sy=sx,sz=sx){const m=mesh(sphere,c,x,y,z);m.scale.set(sx,sy,sz);return m;}
  function box(c,x,y,z,w,h,d){return mesh(new T.BoxGeometry(w,h,d),c,x,y,z);}
  function cylinder(c,x,y,z,top,bottom,h){return mesh(new T.CylinderGeometry(top,bottom,h,28),c,x,y,z);}
  function ring(c,x,y,z,r,t=.018){return mesh(new T.TorusGeometry(r,t,8,32),c,x,y,z);}
  function line(c,pts,r=.012){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),16,r,7,false),c,0,0,0);}
  function cone(c,x,y,z,r,h,n=16){return mesh(new T.ConeGeometry(r,h,n),c,x,y,z);}
  function eye(x,y,z,s=.035){ball(ink,x,y,z,s,s*1.16,s*.65);ball(white,x-.009,y+.012,z+s*.60,s*.29);}
  function smile(y,z,w=.10){line(ink,[[-w,y+.025,z],[0,y,z+.006],[w,y+.025,z]],.011);}
  function moustache(y,z,color=ink,w=.15){for(const s of [-1,1])ball(color,s*w*.55,y,z,w,.045,.038).rotation.z=s*.22;}
  function feet(c=ink){for(const s of [-1,1])ball(c,s*.16,.095,.10,.14,.095,.18);}
  function body(c,shirt=cream){ball(c,0,.43,0,.28,.35,.235);ball(shirt,0,.45,.205,.17,.23,.05);feet(c);}
  function hands(c){for(const s of [-1,1]){ball(c,s*.30,.48,.02,.095,.20,.095).rotation.z=s*.22;ball(c,s*.34,.31,.08,.10);}}
  function tie(c,y=.62){cone(c,0,y,.265,.058,.16,3).rotation.z=Math.PI;ball(c,0,y+.10,.26,.045);}
  function shades(y,z,w=.105){for(const s of [-1,1]){const lens=ball(ink,s*.145,y,z,w,.067,.028);lens.rotation.z=s*.08;line('#8a9da4',[[s*.12,y+.025,z+.029],[s*.18,y+.025,z+.024]],.007);}line(ink,[[-.05,y,z],[.05,y,z]],.018);}
  function eyebrows(y,z,ang=.15){for(const s of [-1,1]){const b=box(ink,s*.15,y,z,.14,.025,.025);b.rotation.z=s*ang;}}
  if(a.id==='buff-chick'){
    body('#efc34f','#ffe393');
    ball('#efc34f',0,1.03,0,.36,.33,.29);
    for(const [x,y] of [[-.11,1.34],[0,1.39],[.11,1.34]])ball('#d96d54',x,y,-.02,.085,.105,.06);
    shades(1.08,.277);
    cone('#d9923f',0,.962,.332,.10,.14,4).rotation.x=Math.PI/2;
    for(const s of [-1,1]){
      ball('#efc34f',s*.35,.61,0,.18,.17,.15);
      ball('#efc34f',s*.49,.77,.015,.11,.19,.105).rotation.z=-s*.28;
      ball('#f4cf6d',s*.46,.93,.055,.12,.105,.11);
      line('#bf9436',[[s*.38,.66,.14],[s*.43,.69,.14],[s*.47,.65,.13]],.010);
    }
    box('#9f5d44',0,.285,.22,.38,.07,.05);ball(gold,0,.285,.255,.045,.043,.01);
  }else if(a.id==='alien-uncle'){
    body('#505969',white);hands(a.color);tie('#b26c65');
    ball(a.color,0,1.12,0,.40,.37,.27);
    for(const s of [-1,1]){ball(ink,s*.17,1.16,.241,.102,.145,.036).rotation.z=-s*.30;ball('#d8f0dc',s*.17-.025,1.22,.275,.028,.045,.008);}
    ball('#799e87',0,1.00,.28,.06,.08,.06);moustache(.934,.281,'#66615b',.12);smile(.875,.258,.07);
    line(a.color,[[.02,1.44,0],[.10,1.58,0],[.22,1.59,0]],.027);ball('#dfc676',.24,1.59,0,.065);
    cylinder('#e4d7bf',.40,.44,.14,.085,.075,.14);ring('#e4d7bf',.492,.44,.14,.048,.014).rotation.y=Math.PI/2;
    cylinder('#6d5341',.40,.515,.14,.064,.064,.004);
  }else if(a.id==='skull-gent'){
    body('#795568',cream);hands('#795568');
    ball(a.color,0,1.04,0,.36,.31,.29);ball(a.color,0,.842,.12,.24,.13,.16);
    for(const s of [-1,1]){ball(ink,s*.145,1.075,.267,.09,.105,.025);ball('#938b81',s*.145-.02,1.10,.292,.018);}
    cone(ink,0,.969,.292,.046,.075,3).rotation.z=Math.PI;
    for(const x of [-.10,-.05,0,.05,.10])line('#9e8e77',[[x,.85,.278],[x,.79,.252]],.007);
    cylinder(ink,0,1.362,0,.43,.43,.055);cylinder(ink,0,1.51,0,.27,.29,.27);
    cylinder('#a56b73',0,1.407,0,.293,.293,.064);
    ring(gold,.145,1.075,.302,.11,.014);line(gold,[[.25,1.07,.30],[.31,.86,.24],[.24,.73,.20]],.008);
    for(const s of [-1,1])ball(gold,s*.075,.688,.25,.085,.045,.028).rotation.z=-s*.25;ball('#b58365',0,.688,.28,.03);
  }else if(a.id==='rice-boss'){
    feet('#72583e');for(const s of [-1,1]){ball(white,s*.37,.59,0,.10,.20,.105);ball(white,s*.42,.40,.07,.105);}
    const rice=new T.Shape();rice.moveTo(-.38,.39);rice.quadraticCurveTo(-.54,.43,-.39,.76);rice.lineTo(-.13,1.28);rice.quadraticCurveTo(0,1.51,.13,1.28);rice.lineTo(.39,.76);rice.quadraticCurveTo(.54,.43,.38,.39);rice.closePath();
    const m=mesh(new T.ExtrudeGeometry(rice,{depth:.36,steps:1,bevelEnabled:true,bevelThickness:.07,bevelSize:.06,bevelSegments:3,curveSegments:12}),white,0,0,-.18);
    box('#354b42',0,.56,.27,.31,.33,.04);
    for(const s of [-1,1])eye(s*.145,1.00,.28,.034);eyebrows(1.102,.28,.22);smile(.852,.28,.10);
    for(let j=0;j<4;j++)ball(ink,-.19+j*.11,1.28+j*.025,.14,.14,.14,.19);
    line(gold,[[-.28,.74,.28],[0,.69,.30],[.28,.74,.28]],.019);
    ball('#d39680',-.27,.90,.28,.04,.02,.01);
  }else if(a.id==='fried-shrimp'){
    feet('#bc7841');ball(a.color,0,.81,0,.27,.56,.25);
    for(let j=0;j<27;j++){const angle=j*2.40,y=.42+(j%9)*.10,r=.24*Math.sqrt(Math.max(.15,1-Math.pow((y-.81)/.56,2)));ball(j%3?'#e3b351':'#be852e',Math.sin(angle)*r,y,Math.cos(angle)*r,.035+(j%3)*.008);}
    for(const s of [-1,1]){ball('#df805e',s*.10,1.48,-.005,.10,.24,.055).rotation.z=-s*.55;ball(a.color,s*.28,.61,.02,.085,.18,.085);}
    ring(white,0,1.19,0,.225,.037).rotation.x=Math.PI/2;
    ball(white,.26,1.19,0,.07);line(white,[[.27,1.18,0],[.34,1.08,-.02],[.32,1.02,-.01]],.026);
    for(const s of [-1,1])eye(s*.10,1.03,.247,.027);eyebrows(1.105,.25,.10);
    moustache(.916,.25,cream,.10);smile(.836,.253,.065);
    line('#7c5c43',[[-.23,.46,.15],[0,.43,.255],[.23,.46,.15]],.027);
  }else if(a.id==='office-robot'){
    body('#657583',white);hands('#8d9da8');tie('#b77972');
    box(a.color,0,1.12,0,.61,.49,.44);
    for(const s of [-1,1]){cylinder('#74858d',s*.34,1.1,0,.07,.07,.09).rotation.z=Math.PI/2;box('#a6d3ce',s*.14,1.16,.228,.15,.09,.016);box('#71818b',s*.14,1.212,.24,.18,.038,.025).rotation.z=-s*.09;}
    box('#4d5e65',0,.992,.228,.27,.07,.012);for(let j=0;j<5;j++)box('#a8b4b5',-.10+j*.05,.992,.242,.016,.045,.006);
    line('#657583',[[.10,1.37,0],[.10,1.57,0],[.24,1.55,0]],.023);ball('#e1bd74',.25,1.55,0,.047);
    box('#5d6a70',-.11,1.377,.02,.19,.024,.09);box('#c9a35a',-.17,1.392,.02,.052,.01,.055);
    box('#5d4e45',-.40,.325,.11,.22,.25,.11);line('#5d4e45',[[-.46,.45,.11],[-.46,.49,.11],[-.34,.49,.11],[-.34,.45,.11]],.018);
    box('#d1b97d',-.40,.345,.173,.055,.028,.01);
  }else if(a.id==='bonsai-sage'){
    body('#72846c','#d8c6a5');hands(a.color);ball(a.color,0,1.00,0,.31,.27,.25);
    shades(1.045,.25,.085);ball('#bc8b65',0,.96,.29,.055,.07,.055);
    moustache(.904,.27,cream,.16);for(const s of [-1,0,1])ball(cream,s*.085,.765,.25,.09,.20,.065).rotation.z=-s*.15;
    cylinder('#a87956',0,1.272,0,.28,.22,.18);ring('#bb8961',0,1.365,0,.30,.035).rotation.x=Math.PI/2;
    line('#796146',[[0,1.36,0],[-.04,1.53,0],[.04,1.67,-.02]],.04);
    line('#796146',[[-.02,1.50,0],[-.22,1.60,.02]],.025);
    for(const [x,y,z,s]of [[-.23,1.63,.015,.17],[.13,1.69,-.02,.19],[-.035,1.76,-.03,.19]])ball('#6f9670',x,y,z,s,s*.60,s*.72);
    line('#987247',[[-.43,.10,.10],[-.43,.88,.10],[-.46,1.12,.10],[-.40,1.22,.10],[-.33,1.15,.10]],.026);
  }else if(a.id==='mushroom-boss'){
    body('#7a5c7e',cream);hands('#d8c2a2');
    ball('#e8d3b4',0,1.02,0,.255,.32,.235);
    ball(a.color,0,1.31,0,.49,.23,.40);cylinder('#dbc6ad',0,1.215,0,.425,.425,.026);
    for(const [x,y,z,s]of [[-.25,1.43,.23,.09],[.14,1.49,.14,.105],[.34,1.34,.22,.066],[-.08,1.37,.35,.07]])ball('#e7d5cf',x,y,z,s,.025,s*.70);
    for(const s of [-1,1])eye(s*.11,1.057,.222,.027);eyebrows(1.135,.227,.18);moustache(.965,.24,ink,.115);smile(.90,.235,.075);
    for(const s of [-1,1])ball('#bd8b9c',s*.066,.68,.235,.08,.04,.035).rotation.z=-s*.23;
    line(gold,[[-.18,.57,.22],[0,.47,.268],[.18,.57,.22]],.018);ring(gold,0,.475,.28,.045,.012);
  }else if(a.id==='muscle-shark'){
    body(a.color,white);ball(a.color,0,1.045,0,.40,.33,.30);ball(white,0,.915,.24,.30,.17,.115);
    for(const s of [-1,1]){eye(s*.19,1.145,.265,.031);ball(a.color,s*.36,.62,0,.17,.18,.145);ball(a.color,s*.49,.77,.03,.10,.18,.10).rotation.z=-s*.25;ball(a.color,s*.46,.93,.08,.11);}
    eyebrows(1.215,.257,.20);ball('#644d52',0,.902,.352,.235,.075,.019);
    for(const x of [-.16,-.08,0,.08,.16]){cone(cream,x,.926,.374,.027,.052,3).rotation.z=Math.PI;cone(cream,x,.876,.374,.022,.044,3);}
    cone(a.color,0,1.00,-.29,.17,.36,3).rotation.x=-.35;
    for(const s of [-1,1])ball(a.color,s*.13,.24,-.25,.10,.19,.05).rotation.z=s*.6;
    cylinder(white,0,1.362,-.035,.23,.26,.065);ball(white,0,1.42,-.04,.22,.085,.18);ring('#48667b',0,1.344,-.035,.24,.02).rotation.x=Math.PI/2;
  }else if(a.id==='box-samurai'){
    feet('#75583e');box(a.color,0,.45,0,.43,.44,.32);
    for(const s of [-1,1]){box('#a57e53',s*.31,.50,0,.17,.30,.24).rotation.z=s*.20;ball(a.color,s*.34,.31,.05,.095);}
    box(a.color,0,1.10,0,.62,.53,.46);
    for(const s of [-1,1]){eye(s*.15,1.10,.24,.028);box('#a57c4f',s*.365,1.05,-.05,.17,.27,.28).rotation.z=s*.3;}
    eyebrows(1.203,.247,.24);box(ink,0,.957,.24,.12,.055,.01);box(cream,0,.969,.248,.09,.015,.008);
    cone('#9f774c',0,1.46,0,.435,.30,4).rotation.y=Math.PI/4;
    for(const s of [-1,1])line(gold,[[s*.035,1.48,.25],[s*.21,1.57,.24],[s*.29,1.75,.20]],.032);
    box('#705c48',0,.36,.17,.43,.065,.025);line('#a85e51',[[-.21,.64,.18],[0,.55,.21],[.21,.64,.18]],.025);
    box(cream,0,.48,.172,.15,.09,.008);ball('#b86e58',0,.48,.181,.028,.028,.008);
    const sheath=box('#846446',-.32,.52,-.08,.065,.67,.07);sheath.rotation.z=-.30;
    box(ink,-.40,.86,-.08,.065,.16,.065).rotation.z=-.30;
  }
  return g;
}
