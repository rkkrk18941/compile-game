"""Skeleton-first Blender assets; metres, skinned engine bind coordinates.
blender -b -P tools/blender/containment.py -- REPO
The editable .blend files and compact skinned meshes share a joint graph.
"""
import bpy,json,math,struct,gzip,sys
from pathlib import Path
from mathutils import Vector,Matrix,Euler
ROOT=Path(sys.argv[sys.argv.index('--')+1]);OUT=ROOT/'noclip/assets/creatures';OUT.mkdir(parents=True,exist_ok=True)
SPECS=json.loads((ROOT/'tools/blender/containment-skeletons.json').read_text());C=Matrix(((1,0,0),(0,0,-1),(0,1,0)));CI=C.inverted();objects=[];materials={}
def material(name,col,kind):
 key=(name,tuple(col),kind)
 if key in materials:return materials[key]
 m=bpy.data.materials.new(name);m.use_nodes=True;m['rgb']=list(col);m['kind']=kind;m.diffuse_color=(*col,1);s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*col,1);s.inputs['Roughness'].default_value=.5
 if kind==7:s.inputs['Emission Color'].default_value=(*col,1);s.inputs['Emission Strength'].default_value=3
 if kind==20:
  noise=m.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=95;bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.008;m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],s.inputs['Normal'])
 materials[key]=m;return m

def attach(o,name,bone,mat):
 o.name=name;o['bone']=bone;o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 objects.append(o);return o

def ell(name,p,size,bone,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=C@Vector(p));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return attach(o,name,bone,mat)

def segment(name,a,b,r1,r2,bone,mat):
 a=Vector(a);b=Vector(b);d=b-a
 if d.length<.01:return
 # A spindle-shaped muscle with continuous radial rings.
 d=d.normalized();u=d.cross(Vector((0,0,1)))
 if u.length<.01:u=Vector((1,0,0))
 u.normalize();v=d.cross(u);verts=[];faces=[]
 for j in range(9):
  t=j/8;p=a.lerp(b,t);r=(r1*(1-t)+r2*t)*(.68+.32*math.sin(math.pi*t))
  for k in range(12):verts.append(tuple(C@(p+(u*math.cos(k*math.tau/12)+v*math.sin(k*math.tau/12))*r)))
 for j in range(8):
  for k in range(12):q=j*12+k;n=j*12+(k+1)%12;faces.append((q,n,n+12,q+12))
 faces.extend([tuple(range(11,-1,-1)),tuple(range(96,108))]);me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(o);return attach(o,name,bone,mat)

def box(name,p,size,bone,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=C@Vector(p));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);mod=o.modifiers.new('Precision bevel','BEVEL');mod.width=.008;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name);return attach(o,name,bone,mat)

def plate(p,w,l,bone,mat):
 p=Vector(p);coords=[(-w,0,-l*.7),(0,0,-l),(w,0,-l*.7),(w*.8,0,l*.2),(0,0,l),(-w*.8,0,l*.2),(0,w*.24,0)];me=bpy.data.meshes.new('Scale');me.from_pydata([tuple(C@(p+Vector(q)))for q in coords],[],[(i,(i+1)%6,6)for i in range(6)]+[(5,4,3,2,1,0)]);me.update();o=bpy.data.objects.new('Scale',me);bpy.context.scene.collection.objects.link(o);return attach(o,'Overlapping osteoderm',bone,mat)

def build(name,spec,operator=False,col=None):
 global objects,materials
 bpy.ops.wm.read_factory_settings(use_empty=True);objects=[];materials={};bones=spec['bones'];world=[]
 for b in bones:
  m=Matrix.Translation(Vector(b['pos']))
  if b.get('rot'):m=m@Euler(b['rot'],'XYZ').to_matrix().to_4x4()
  if b['parent']>=0:m=world[b['parent']]@m
  world.append(m)
 P=[m.translation for m in world];by={b['name']:i for i,b in enumerate(bones)};kind=spec['kind'];params=spec['params'];H=spec['meta'].get('H',params.get('height',1.8));H=max(.7,H)
 skin=material('Ripstop uniform'if operator else'Dermis',col or(.16,.12,.19),21 if operator else 20);ivory=material('Keratin',(.56,.50,.43),26);tendon=material('Tendon',(.12,.065,.11),20);dark=material('Recess',(.006,.004,.01),22);scale=material('Midnight scale',(.045,.028,.065),20);eye=material('Violet luminescence',(.64,.02,.8),7)
 ad=bpy.data.armatures.new(name+'_skeleton');arm=bpy.data.objects.new(name+'_rig',ad);bpy.context.scene.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for i,b in enumerate(bones):
  e=ad.edit_bones.new(b['name']);e.head=C@P[i];children=[j for j,c in enumerate(bones)if c['parent']==i and(P[j]-P[i]).length>.02];e.tail=C@(P[children[0]]if children else P[i]+Vector((0,.07,0)))
  if b['parent']>=0:e.parent=ad.edit_bones[bones[b['parent']]['name']]
 bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
 for i,b in enumerate(bones):
  parent=b['parent'];bn=b['name']
  if parent<0 or bn in['hips','body']or bn.endswith('.root'):continue
  r=(.055 if operator else .048)*H*(.7 if any(k in bn for k in['hand','tail','wing','jaw','an'])else 1)
  segment(bn+' muscle',P[parent],P[i],r,r*.65,parent,skin);ell(bn+' joint',P[i],(r*.7,)*3,i,skin)
 if kind in['biped','hazmat']:
  hips=by.get('hips',0);chest=by.get('chest',hips);head=by.get('head',chest);p=P[chest];ell('Thorax',p+Vector((0,-.06*H,0)),(.14*H,.17*H,.08*H),chest,skin);ell('Pelvic girdle',P[hips],(.12*H,.08*H,.075*H),hips,skin)
  F=P[head]+Vector((0,.09*H,.018*H));ell('Cranium',F,(.082*H,.115*H,.085*H),head,skin)
  if not operator:
   ell('Feeding cavity',F+Vector((0,-.04*H,.075*H)),(.06*H,.05*H,.025*H),head,dark)
   for side in[-1,1]:ell('Eye',F+Vector((side*.034*H,.025*H,.082*H)),(.012*H,.01*H,.008*H),head,eye)
   for j in range(12):
    for side in[-1,1]:a=F+Vector(((j/11-.5)*.115*H,-.04*H+side*.045*H,.095*H));segment('Tooth',a,a+Vector((0,-side*.022*H,.008*H)),.004*H,.0005,head,ivory)
   for j in range(7):
    for side in[-1,1]:a=p+Vector((side*.02*H,(.04-j*.035)*H,-.035*H));b=a+Vector((side*.11*H,-.035*H,.09*H));segment('Costal arch',a,b,.009*H,.007*H,chest,ivory)
   for bn in['armL.hand','armR.hand','armL2.hand','armR2.hand']:
    if bn not in by:continue
    i=by[bn]
    for j in range(5):a=P[i]+Vector(((j-2)*.022*H,0,0));b=a+Vector((0,-(.09+.015*(2-abs(j-2)))*H,.02*H));segment('Digit',a,b,.012*H,.005*H,i,skin);segment('Claw',b,b+Vector((0,-.035*H,.02*H)),.005*H,.0005,i,ivory)
  else:
   armour=material('Ballistic ceramic',tuple(c*.48 for c in col),28);rubber=material('Rubber',(.02,.026,.03),22);glass=material('Coated visor',(.08,.18,.21),24)
   box('Plate carrier',p+Vector((0,-.07,.13)),(.37,.35,.065),chest,armour);box('Pack',p+Vector((0,-.05,-.19)),(.30,.38,.15),chest,skin)
   for j in range(4):box('Utility pouch',p+Vector(((j-1.5)*.083,-.15,.18)),(.073,.13,.055),chest,skin)
   ell('Helmet',F,(.15,.18,.16),head,armour);box('Visor',F+Vector((0,.025,.15)),(.24,.09,.045),head,glass);ell('Respirator',F+Vector((0,-.075,.16)),(.09,.065,.075),head,rubber)
   for bn in['legL.kn','legR.kn']:
    i=by[bn];box('Knee armour',P[i]+Vector((0,0,.075)),(.13,.16,.055),i,armour)
   if name.endswith('haruka'):
    green=material('Medical marking',(.1,.65,.32),7);box('Cross vertical',p+Vector((0,.04,.18)),(.025,.09,.008),chest,green);box('Cross horizontal',p+Vector((0,.04,.185)),(.08,.025,.008),chest,green)
 elif kind in['quad','spider','flyer']:
  body=by.get('body',0);head=by.get('head',body);length=params.get('len',H*.7);p=P[body];ell('Axial muscle',p,(.18*H,.16*H,length*.47),body,skin)
  for row in range(14):
   for j in range(7):a=(j/6-.5)*math.pi;plate(p+Vector((math.sin(a)*.185*H,math.cos(a)*.16*H,(row/13-.5)*length*.95)),.045*H,length*.055,body,scale)
  f=P[head];ell('Elongated cranium',f+Vector((0,.02*H,.11*H)),(.13*H,.09*H,.23*H),head,scale);ell('Mouth',f+Vector((0,-.035*H,.29*H)),(.11*H,.055*H,.09*H),head,dark)
  for side in[-1,1]:
   for j in range(3):ell('Sensory eye',f+Vector((side*.125*H,.02*H,.19*H-j*.07*H)),(.018*H,.017*H,.012*H),head,eye)
  for j in range(18):a=j*math.tau/18;p=f+Vector((math.sin(a)*.10*H,math.cos(a)*.055*H-.035*H,.34*H));segment('Fang',p,p+Vector((0,-math.cos(a)*.035*H,.04*H)),.007*H,.0006,head,ivory)
 else:
  head=by.get('head',0);ell('Visceral core',P[head],(.18,.16,.18),head,skin)
  for j in range(20):a=j*math.tau/20;p=P[head]+Vector((math.cos(a)*.18,-.12,math.sin(a)*.18));segment('Radial tooth',p,p+Vector((0,-.1,0)),.012,.0005,head,ivory)
 # Export compact, rounded bind-space data; the rig remains fully editable.
 A={'position':[],'normal':[],'color':[],'aMat':[],'skinIndex':[],'skinWeight':[],'index':[]}
 for o in objects:
  vg=o.vertex_groups.new(name=bones[o['bone']]['name']);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Armature','ARMATURE');mod.object=arm;me=o.data;me.calc_loop_triangles();base=len(A['position'])//3;m=o.matrix_world;nm=m.to_3x3().inverted().transposed();mat=me.materials[0]
  for v in me.vertices:A['position'].extend(round(x,4)for x in CI@(m@v.co));A['normal'].extend(round(max(-1,min(1,x))*127)for x in(CI@(nm@v.normal)).normalized());A['color'].extend(round(x*255)for x in mat['rgb']);A['aMat'].append(mat['kind']);A['skinIndex'].extend([o['bone'],0,0,0]);A['skinWeight'].extend([255,0,0,0])
  for tri in me.loop_triangles:A['index'].extend(base+i for i in tri.vertices)
 payload=bytearray();desc={};fmts={'position':'f','normal':'b','color':'B','aMat':'B','skinIndex':'B','skinWeight':'B','index':'I'}
 for key,values in A.items():
  while len(payload)%4:payload.append(0)
  fmt=fmts[key];desc[key]={'offset':len(payload),'count':len(values),'type':fmt};payload.extend(struct.pack('<'+str(len(values))+fmt,*values))
 meta={'bones':bones,'meta':spec['meta'],'arrays':desc,'triangles':len(A['index'])//3,'blender':'4.5.3'};head=json.dumps(meta,separators=(',',':')).encode();head+=b' '*((-len(head))%4);(OUT/(name+'.ncm.gz')).write_bytes(gzip.compress(b'NCRM'+struct.pack('<I',len(head))+head+payload,9,mtime=0));bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')),compress=True);return{'file':name+'.ncm.gz','triangles':meta['triangles'],'bones':len(bones)}
manifest={}
for name,spec in SPECS.items():
 if name!='operator':manifest[name]=build(name,spec);print('EXPORTED',name,flush=True)
for hero,col in [('shino',(.08,.12,.19)),('minato',(.25,.29,.22)),('kagura',(.38,.23,.11)),('rei',(.21,.24,.29)),('gou',(.16,.15,.23)),('haruka',(.65,.70,.67))]:manifest['operator_'+hero]=build('operator_'+hero,SPECS['operator'],True,col);print('EXPORTED',hero,flush=True)
(OUT/'manifest.json').write_text(json.dumps({'version':3,'models':manifest},indent=2))
