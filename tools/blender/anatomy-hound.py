"""Anatomical hound, game-ready skin and editable Blender rig.

Run Blender -b -P this_file -- REPO [--render] [--animate]
Frame: a load-bearing pectoral girdle, reverse hind knee, two neck joints,
six caudal joints, hinged mandible. Flesh: one remeshed dermal envelope.
Warp: osteoderms, sensory eyes and vascular gill membranes follow that frame.
No downloaded or image-generated geometry is used.
"""
import bpy, bmesh, math, json, struct, gzip, sys, random
from pathlib import Path
from mathutils import Matrix, Vector, Euler
from mathutils.bvhtree import BVHTree

ROOT=Path(sys.argv[sys.argv.index('--')+1]); OUT=ROOT/'noclip/assets/creatures'
TMP=ROOT/'.tmp/anatomy'; TMP.mkdir(parents=True,exist_ok=True)
random.seed(31)
C=Matrix(((1,0,0),(0,0,-1),(0,1,0))); CI=C.inverted(); C4=C.to_4x4()
bpy.ops.wm.read_factory_settings(use_empty=True)
objects=[]; flesh=[]; bones=[]; bind=[]; by={}; mats={}

def bone(name,parent,p):
 i=len(bones);by[name]=i;parent=by[parent] if parent else -1
 bones.append(dict(name=name,parent=parent,pos=list(p),rot=None))
 bind.append((bind[parent] if parent>=0 else Matrix.Identity(4))@Matrix.Translation(Vector(p)))
 return i

bone('root',None,(0,0,0));bone('body','root',(0,.76,0))
bone('chest','body',(0,.015,.34));bone('pelvis','body',(0,-.025,-.40))
for i in range(4):
 side=-1 if i%2==0 else 1;front=i<2
 bone(f'leg{i}.up','chest' if front else 'pelvis',(side*.235,-.025,.045 if front else 0))
 bone(f'leg{i}.lo',f'leg{i}.up',(side*.025,-.335,-.14 if front else .18))
 bone(f'leg{i}.hand',f'leg{i}.lo',(side*.035,-.30,.18 if front else -.16))
 bone(f'leg{i}.toe',f'leg{i}.hand',(0,-.045,.125))
bone('neck','chest',(0,.025,.19));bone('neck2','neck',(0,.065,.23));bone('head','neck2',(0,-.015,.22));bone('jaw','head',(0,-.045,.055))
for i in range(6):bone('tail' if i==0 else f'tail{i}','pelvis' if i==0 else ('tail' if i==1 else f'tail{i-1}'),(0,.015,-.17 if i==0 else -.23))

def mat(name,rgb,kind,rough=.38):
 m=bpy.data.materials.new(name);m.use_nodes=True;m['rgb']=rgb;m['kind']=kind
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
 if kind==7:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=2.2
 if kind==20:
  p.inputs['Subsurface Weight'].default_value=.045;p.inputs['Coat Weight'].default_value=.22
  noise=m.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=135;noise.inputs['Detail'].default_value=3.3
  bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.003
  m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
 m.diffuse_color=(*rgb,1);mats[name]=m;return m

skin=mat('01 • continuous dermis',(.115,.075,.135),20,.41)
scale=mat('02 • indigo osteoderm',(.049,.030,.075),20,.32)
under=mat('03 • flexural dermis',(.19,.105,.17),20,.45)
gum=mat('04 • gingiva',(.135,.025,.065),20,.29)
black=mat('05 • wet oral cavity',(.008,.003,.012),22,.24)
ivory=mat('06 • translucent keratin',(.56,.46,.42),26,.3)
glow=mat('07 • photophores',(.64,.008,.83),7,.3)
iris=mat('08 • iris',(.32,.008,.45),7,.25)
membrane=mat('09 • vascular gill membrane',(.17,.025,.22),20,.31)

def weights(*pairs):return {by[n]:w for n,w in pairs if w>0}
def mix(a,b,t):
 d={k:v*(1-t) for k,v in a.items()}
 for k,v in b.items():d[k]=d.get(k,0)+v*t
 return d
def mesh(name,verts,faces,material,ws,organic=False):
 me=bpy.data.meshes.new(name);me.from_pydata([tuple(C@Vector(v)) for v in verts],[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(material)
 for p in me.polygons:p.use_smooth=True
 groups={}
 for j,w in enumerate(ws):
  for k,value in w.items():
   if k not in groups:groups[k]=o.vertex_groups.new(name=bones[k]['name'])
   groups[k].add([j],value,'REPLACE')
 objects.append(o)
 if organic:flesh.append(o)
 return o

def loft(name,rings,material,organic=False,sides=24):
 # Each ring: center, lateral axis, other axis, width, height, weight dict.
 verts=[];faces=[];ws=[]
 for j,(p,u,v,w,h,weight) in enumerate(rings):
  p,u,v=Vector(p),Vector(u),Vector(v)
  for k in range(sides):
   a=math.tau*k/sides;verts.append(p+u*(math.sin(a)*w)+v*(math.cos(a)*h));ws.append(weight)
 for j in range(len(rings)-1):
  for k in range(sides):a=j*sides+k;b=j*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
 faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(rings)-1)*sides+k for k in range(sides))])
 return mesh(name,verts,faces,material,ws,organic)

def tube(name,points,radii,material,weight,sides=10,organic=False):
 rings=[]
 for j,p in enumerate(points):
  p=Vector(p);d=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])
  d.normalize();u=d.cross(Vector((0,1,0)))
  if u.length<.01:u=d.cross(Vector((1,0,0)))
  u.normalize();v=d.cross(u).normalized();r=radii[j]
  w,h=r if isinstance(r,(tuple,list)) else (r,r)
  rings.append((p,u,v,w,h,weight[j] if isinstance(weight,list) else weight))
 return loft(name,rings,material,organic,sides)

def ell(name,p,size,material,weight,organic=False):
 rings=[];p=Vector(p)
 for j in range(17):
  a=-math.pi/2+math.pi*j/16;s=max(.025,math.cos(a));rings.append((p+Vector((0,math.sin(a)*size[1],0)),(1,0,0),(0,0,1),size[0]*s,size[2]*s,weight))
 return loft(name,rings,material,organic,24)

def smooth(t):return t*t*(3-2*t)
def catmull(values,t):
 x=t*(len(values)-1);i=min(len(values)-2,int(x));f=x-i;p0=values[max(0,i-1)];p1=values[i];p2=values[i+1];p3=values[min(len(values)-1,i+2)]
 return .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)

# Rib cage, narrowing abdomen and lumbar arch. Rings make a continuous surface.
def torso(z,a):
 t=(z+.64)/1.28;t=max(0,min(1,t));w=catmull([.045,.18,.235,.21,.275,.255,.035],t);h=catmull([.055,.17,.205,.18,.235,.20,.045],t)
 cy=.755+.025*math.sin(t*math.pi)-.018*math.sin(t*math.tau)
 # Serratus and scapular relief, anchored to chest rather than floating ribs.
 ripple=.008*math.sin(z*55+a*1.2)*math.sin(a)**2*math.exp(-((z-.12)/.28)**2)
 return Vector((math.sin(a)*(w+ripple),cy+math.cos(a)*h,z))
def torsoW(z):
 if z>.13:return mix(weights(('body',1)),weights(('chest',1)),smooth(min(1,(z-.13)/.32)))
 if z<-.19:return mix(weights(('body',1)),weights(('pelvis',1)),smooth(min(1,(-z-.19)/.35)))
 return weights(('body',1))
verts=[];ws=[];faces=[]
for j in range(65):
 z=-.64+1.28*j/64
 for k in range(48):verts.append(torso(z,k*math.tau/48));ws.append(torsoW(z))
for j in range(64):
 for k in range(48):a=j*48+k;b=j*48+(k+1)%48;faces.append((a,b,b+48,a+48))
faces.extend([tuple(range(47,-1,-1)),tuple(64*48+k for k in range(48))]);mesh('Rib cage → lumbar dermis',verts,faces,skin,ws,True)

# Limb envelopes retain muscle bellies and Achilles tendons through the flexion.
for i in range(4):
 front=i<2;side=-1 if i%2==0 else 1;up=f'leg{i}.up';lo=f'leg{i}.lo';hand=f'leg{i}.hand';parent='chest' if front else 'pelvis'
 a=bind[by[up]].translation;b=bind[by[lo]].translation;c=bind[by[hand]].translation
 points=[];radii=[];w=[]
 for j in range(13):
  t=j/12;p=a.lerp(b,t);p.x+=side*.025*math.sin(t*math.pi);points.append(p)
  r=catmull([.12 if front else .145,.125 if front else .15,.09,.055],t);radii.append((r*.8,r));w.append(mix(weights((parent,.55),(up,.45)),weights((up,.52),(lo,.48)),smooth(t)))
 tube('Deltoid / triceps' if front else 'Gluteus / femoral muscle',points,radii,skin,w,20,True)
 points=[];radii=[];w=[]
 for j in range(13):
  t=j/12;points.append(b.lerp(c,t));r=catmull([.058,.065 if front else .077,.037,.032],t);radii.append((r*.74,r));w.append(mix(weights((up,.48),(lo,.52)),weights((lo,.62),(hand,.38)),smooth(t)))
 tube('Extensor sheath / carpus',points,radii,skin,w,18,True)
 ell('Metacarpal pad',c+Vector((0,-.025,.055)),(.062,.037,.105),skin,weights((hand,1)),True)
 for d in range(3):
  p=c+Vector(((d-1)*.045,-.026,.09));q=p+Vector(((d-1)*.018,-.014,.10+(1-abs(d-1))*.022));r=q+Vector(((d-1)*.01,-.026,.06))
  tube('Articulated digit',[p,p.lerp(q,.5),q,r],[.024,.025,.018,.009],skin,[weights((hand,1)),weights((hand,.8),(f'leg{i}.toe',.2)),weights((f'leg{i}.toe',1)),weights((f'leg{i}.toe',1))],12,True)
  tube('Recurved load-bearing claw',[r,r+Vector((0,.002,.025)),r+Vector((0,-.018,.055))],[.013,.010,.0006],ivory,weights((f'leg{i}.toe',1)),10)

# Cervical column supports the head instead of a ball-on-a-stick neck.
neckPoints=[Vector((0,.79,.40)),Vector((0,.805,.57)),Vector((0,.855,.73)),Vector((0,.855,.91)),Vector((0,.835,1.01))]
points=[];r=[];w=[]
for j in range(25):
 t=j/24;points.append(catmull(neckPoints,t));r.append((catmull([.18,.16,.125,.115],t),catmull([.17,.145,.12,.1],t)))
 x=t*3;i=min(2,int(x));names=['chest','neck','neck2','head'];w.append(mix(weights((names[i],1)),weights((names[i+1],1)),smooth(x-i)))
tube('Cervical muscle / nuchal tendon',points,r,skin,w,28,True)

# Long caudal counterweight; six actual deforming vertebrae.
points=[];r=[];w=[]
for j in range(49):
 t=j/48;points.append(Vector((.055*math.sin(t*math.pi),.75-.36*t+.10*math.sin(t*math.pi),-.51-1.40*t)))
 r.append((.14*(1-t)**1.25+.005,.12*(1-t)**1.15+.004));x=t*5;i=min(4,int(x));names=['tail']+[f'tail{k}' for k in range(1,6)];w.append(mix(weights((names[i],1)),weights((names[i+1],1)),smooth(x-i)))
tube('Continuous caudal sheath',points,r,skin,w,24,True)

# Sculpted upper skull: recessed temples, sagittal ridge, elongated nasal bridge.
hp=bind[by['head']].translation
def skull(t,a):
 z=hp.z-.11+t*.68;ww=catmull([.09,.165,.16,.13,.105,.075,.018],t);hh=catmull([.065,.115,.098,.075,.05,.033,.012],t)
 cy=hp.y+.025-.035*t
 v=Vector((math.sin(a)*ww,cy+math.cos(a)*hh,z))
 # Almond orbital depressions under the brow.
 for eyeT in [.25,.40,.54]:v.x*=1-.13*math.exp(-((t-eyeT)/.06)**2)*max(0,math.sin(a)**8)
 v.y+=.012*max(0,math.cos(a))**12*math.sin(math.pi*t)
 return v
verts=[];faces=[];ws=[]
for j in range(41):
 for k in range(40):verts.append(skull(j/40,k*math.tau/40));ws.append(weights(('head',1)))
for j in range(40):
 for k in range(40):a=j*40+k;b=j*40+(k+1)%40;faces.append((a,b,b+40,a+40))
faces.extend([tuple(range(39,-1,-1)),tuple(40*40+k for k in range(40))]);mesh('Cranial vault / zygoma / rostrum',verts,faces,skin,ws,True)

# Hinged mandible with actual empty mouth volume and paired dental arcades.
jp=bind[by['jaw']].translation
jawPoints=[Vector((0,hp.y-.09,hp.z+.03)),Vector((0,hp.y-.12,hp.z+.17)),Vector((0,hp.y-.13,hp.z+.32)),Vector((0,hp.y-.10,hp.z+.50))]
tube('Mandibular symphysis',jawPoints,[(.115,.028),(.125,.033),(.10,.024),(.045,.018)],under,weights(('jaw',1)),28)
tube('Oral floor',[(0,hp.y-.078,hp.z+.06),(0,hp.y-.09,hp.z+.28),(0,hp.y-.077,hp.z+.48)],[(.10,.018),(.10,.018),(.04,.01)],black,weights(('jaw',1)),24)
for side in [-1,1]:
 for lower in [False,True]:
  weight=weights(('jaw' if lower else 'head',1));points=[]
  for j in range(25):
   t=j/24;points.append(Vector((side*catmull([.11,.126,.103,.039],t),hp.y+(-.09 if lower else -.033)-.025*math.sin(t*math.pi),hp.z+.04+t*.47)))
  tube('Gingival margin',points,[.014]*25,gum,weight,10)
  for j in range(15):
   t=j/14;p=points[round(t*24)];length=.027+.045*(math.sin(t*math.pi)**1.5)
   if j in [2,5]:length*=1.6
   if lower:length*=.72
   d=1 if lower else -1
   tube('Rooted recurved fang',[p,p+Vector((0,d*length*.5,.008)),p+Vector((-side*.008,d*length,.027))],[.010 if j not in [2,5] else .014,.006,.0005],ivory,weight,9)
 # Masseter tendon frames the open mouth rather than closing it with a sphere.
 tube('Masseter insertion',[(side*.13,hp.y+.005,hp.z+.02),(side*.135,hp.y-.05,hp.z+.045),(side*.115,hp.y-.09,hp.z+.10)],[.028,.021,.013],skin,[weights(('head',1)),weights(('head',.5),('jaw',.5)),weights(('jaw',1))],14)

# Continuous fusion: eliminate primitive intersections and transfer smooth weights.
def fuse_skin():
 bpy.ops.object.select_all(action='DESELECT')
 for o in flesh:o.select_set(True)
 bpy.context.view_layer.objects.active=flesh[0];bpy.ops.object.join();o=bpy.context.object
 # Preserve a triangulated weighted source for barycentric transfer after remesh.
 source=o.copy();source.data=o.data.copy();bpy.context.collection.objects.link(source);source.name='Weight transfer source'
 me=source.data;me.calc_loop_triangles();tri=[tuple(t.vertices) for t in me.loop_triangles]
 bvh=BVHTree.FromPolygons([v.co for v in me.vertices],tri,all_triangles=True)
 sourceWeights=[{g.group:g.weight for g in v.groups} for v in me.vertices]
 names=[g.name for g in source.vertex_groups]
 o.name='DERMIS • fused anatomical envelope';mod=o.modifiers.new('Continuous anatomical skin','REMESH');mod.mode='VOXEL';mod.voxel_size=.008;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Dermal relaxation','SMOOTH');mod.factor=.62;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Runtime topology budget','DECIMATE');mod.ratio=min(1,48000/max(1,len(o.data.polygons)));bpy.ops.object.modifier_apply(modifier=mod.name)
 o.vertex_groups.clear();groups=[o.vertex_groups.new(name=n) for n in names]
 for v in o.data.vertices:
  loc,normal,index,distance=bvh.find_nearest(v.co)
  ia,ib,ic=tri[index];a,b,c=(me.vertices[k].co for k in (ia,ib,ic));ab=b-a;ac=c-a;ap=loc-a
  d00=ab.dot(ab);d01=ab.dot(ac);d11=ac.dot(ac);d20=ap.dot(ab);d21=ap.dot(ac);den=d00*d11-d01*d01
  vv=(d11*d20-d01*d21)/den if abs(den)>1e-16 else 0;ww=(d00*d21-d01*d20)/den if abs(den)>1e-16 else 0
  total={}
  for k,f in zip((ia,ib,ic),(1-vv-ww,vv,ww)):
   for g,value in sourceWeights[k].items():total[g]=total.get(g,0)+value*max(0,f)
  keep=sorted(total.items(),key=lambda x:-x[1])[:4];s=sum(v for _,v in keep)
  for g,value in keep:
   if value>0:groups[g].add([v.index],value/s,'REPLACE')
 for p in o.data.polygons:p.use_smooth=True;p.material_index=0
 o.data.materials.clear();o.data.materials.append(skin)
 for old in list(objects):
  if old in flesh:objects.remove(old)
 objects.append(o);bpy.data.objects.remove(source,do_unlink=True)
 print('FUSED',len(o.data.vertices),len(o.data.polygons),flush=True)
fuse_skin()

def osteoderm(name,p,u,v,w,l,material,weight,relief=.007):
 p,u,v=Vector(p),Vector(u).normalized(),Vector(v).normalized();n=u.cross(v).normalized()
 # The keel and scalloped perimeter create a real silhouette at close range.
 outline=[(-.72,-.40),(-1,0),(-.62,.53),(0,1),(.62,.53),(1,0),(.72,-.40),(0,-.70)]
 verts=[p+u*(x*w)+v*(y*l) for x,y in outline];verts.extend([p+n*relief+v*(l*.15),p-n*.001])
 faces=[(i,(i+1)%8,8) for i in range(8)]+[(i,9,(i+1)%8) for i in range(8)]
 return mesh(name,verts,faces,material,[weight]*10)

# Overlapping individual scales follow the rib cage, with soft folds underneath.
for row in range(38):
 z=-.56+row*.030
 for j in range(18):
  a=-math.pi*.67+j/17*math.pi*1.34+(row%2)*.035;p=torso(z,a);n=Vector((math.sin(a),math.cos(a),0));p+=n*.003
  u=Vector((math.cos(a),-math.sin(a),0));v=Vector((0,0,-1))
  osteoderm('Thoracic imbricate scale',p,u,v,.025+random.random()*.004,.027+random.random()*.005,scale,torsoW(z),.0045)

# Cranial armor arranged around the orbit and nasal seam.
for row in range(22):
 t=.06+row*.039
 for j in range(15):
  a=-1.7+j/14*3.4+(row%2)*.035;p=skull(t,a);u=Vector((math.cos(a),-math.sin(a),0));v=Vector((0,0,-1))
  osteoderm('Cranial sutured scale',p+Vector((math.sin(a),math.cos(a),0))*.002,u,v,.016*(1-t*.5),.017,scale,weights(('head',1)),.003)

for side in [-1,1]:
 for j,t in enumerate([.25,.40,.54]):
  p=skull(t,side*1.21);p+=Vector((side*.003,0,0));size=[.028,.023,.018][j]
  ell('Obsidian sclera',p,(size*.70,size,size),black,weights(('head',1)))
  ell('Violet iris',p+Vector((side*size*.61,0,.002)),(size*.21,size*.77,size*.76),iris,weights(('head',1)))
  ell('Vertical pupil',p+Vector((side*size*.81,0,.004)),(size*.10,size*.60,size*.14),black,weights(('head',1)))
  # Continuous lid ridge, not a protruding googly eye.
  points=[]
  for k in range(13):
   a=k/12*math.pi;points.append(p+Vector((side*size*.43,math.sin(a)*size*.98,math.cos(a)*size*1.1)))
  tube('Supraorbital brow',points,[.008]*13,scale,weights(('head',1)),8)
 # Nostrils are inset at the tapered end of the snout.
 p=skull(.88,side*.90);ell('Naris',p,(.009,.006,.017),black,weights(('head',1)))

def fin(name,base,side,length,height,weight,lit=False):
 # A curved membrane stretched over branching gill rays.
 base=Vector(base);verts=[];faces=[];ws=[]
 for j in range(13):
  t=j/12
  for k in range(6):
   s=k/5;p=base+Vector((side*length*s*(.35+.65*t),height*math.sin(math.pi*t)**.7*s,-.19*t-.15*s))
   p.y+=.016*math.sin(t*math.pi*6)*s*s;verts.append(p);ws.append(weight)
 for j in range(12):
  for k in range(5):a=j*6+k;faces.append((a,a+1,a+7,a+6));faces.append((a+6,a+7,a+1,a))
 mesh(name,verts,faces,membrane,ws)
 for ray in range(7):
  t=.06+ray*.145;points=[]
  for k in range(8):
   s=k/7;points.append(base+Vector((side*length*s*(.35+.65*t),height*math.sin(math.pi*t)**.7*s+.003,-.19*t-.15*s)))
  tube('Gill cartilage ray',points,[.004*(1-k/9)+.001 for k in range(8)],glow if lit and ray%2==0 else scale,weight,7)
for side in [-1,1]:
 for j in range(5):
  p=(side*(.12+j*.006),.86-.007*j,.90-j*.055)
  fin('Lamellar gill fan',p,side,.25+j*.026,.20+j*.02,weights(('neck2',1)) if j<2 else weights(('neck',1)),j<3)

# Nuchal and dorsal fins are rooted along the spine, ending in the tail.
for j in range(21):
 z=.48-j*.105;p=Vector((0,.98 if z>-.45 else .88-(abs(z)-.45)*.27,z));height=.13+.075*math.sin(j*.25)
 weight=torsoW(z) if z>-.54 else weights((('tail' if j<12 else f'tail{min(5,(j-10)//2)}'),1))
 points=[p,p+Vector((0,height*.65,-.035)),p+Vector((0,height,-.105)),p+Vector((0,height*.25,-.15))]
 tube('Swept dorsal spine',points,[.017,.013,.006,.0006],scale,weight,8)
 if j<20:mesh('Dorsal web',[p,points[2],p+Vector((0,0,-.11))],[(0,1,2),(2,1,0)],membrane,[weight]*3)

# Skin folds across the throat and the glenohumeral insertion stay soft.
for j in range(9):
 z=.60+j*.038;y=.70+j*.009
 tube('Cervical flexural fold',[(-.105,y,z),(-.065,y-.025,z+.006),(0,y-.035,z+.009),(.065,y-.025,z+.006),(.105,y,z)],[.004]*5,under,weights(('neck',.6),('neck2',.4)),8)

# Editable armature, with explicit bind matrices retained for engine round trips.
ad=bpy.data.armatures.new('Hound • anatomical joint graph');arm=bpy.data.objects.new('HOUND • 30 deform joints',ad);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for i,b in enumerate(bones):
 e=ad.edit_bones.new(b['name']);e.head=C@bind[i].translation
 children=[j for j,c in enumerate(bones) if c['parent']==i]
 e.tail=C@(bind[children[0]].translation if children else bind[i].translation+Vector((0,.07,0)))
 if (e.tail-e.head).length<.02:e.tail=e.head+Vector((0,0,.05))
 if b['parent']>=0:e.parent=ad.edit_bones[bones[b['parent']]['name']]
bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False);arm.show_in_front=True
for o in objects:
 mod=o.modifiers.new('Anatomical skin binding','ARMATURE');mod.object=arm

meta=dict(kind='quad',H=1.15,legH=.76,headR=.14,artRevision=2,anatomy='hound-v2',gait=dict(stride=1.60,stance=.66),bindMatrices=[list(sum((list(row) for row in m),[])) for m in bind])
def export():
 A={k:[] for k in ['position','normal','color','aMat','skinIndex','skinWeight','index']}
 for o in objects:
  me=o.data;me.calc_loop_triangles();base=len(A['position'])//3;material=me.materials[0];rgb=material['rgb'];kind=material['kind'];gi={g.index:by[g.name] for g in o.vertex_groups}
  for v in me.vertices:
   p=CI@v.co;n=(CI@v.normal).normalized();A['position'].extend(round(x,5) for x in p);A['normal'].extend(round(max(-1,min(1,x))*127) for x in n)
   variation=.93+.07*math.sin(p.x*97+p.z*43)*math.sin(p.y*61)
   A['color'].extend(round(max(0,min(1,c*variation))*255) for c in rgb);A['aMat'].append(kind)
   groups=sorted([(gi[g.group],g.weight) for g in v.groups if g.weight>.001],key=lambda x:-x[1])[:4];total=sum(x[1] for x in groups)
   if not groups:raise ValueError('Unbound vertex: '+o.name)
   ww=[round(value/total*255) for _,value in groups];ww[0]+=255-sum(ww)
   A['skinIndex'].extend([k for k,_ in groups]+[0]*(4-len(groups)));A['skinWeight'].extend(ww+[0]*(4-len(groups)))
  for tri in me.loop_triangles:A['index'].extend(base+i for i in tri.vertices)
 payload=bytearray();desc={};fmts=dict(position='f',normal='b',color='B',aMat='B',skinIndex='B',skinWeight='B',index='I')
 for key,values in A.items():
  while len(payload)%4:payload.append(0)
  fmt=fmts[key];desc[key]=dict(offset=len(payload),count=len(values),type=fmt);payload.extend(struct.pack('<'+str(len(values))+fmt,*values))
 header=json.dumps(dict(bones=bones,meta=meta,arrays=desc,triangles=len(A['index'])//3,blender=bpy.app.version_string),separators=(',',':')).encode();header+=b' '*((-len(header))%4)
 (OUT/'hound.ncm.gz').write_bytes(gzip.compress(b'NCRM'+struct.pack('<I',len(header))+header+payload,9,mtime=0))
 manifest=json.loads((OUT/'manifest.json').read_text());manifest['models']['hound']=dict(file='hound.ncm.gz',triangles=len(A['index'])//3,bones=len(bones),artRevision=2);(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (TMP/'hound-skeleton.json').write_text(json.dumps(dict(bones=bones,meta=meta)))
 print('EXPORTED',len(A['position'])//3,'vertices',len(A['index'])//3,'triangles',len(bones),'bones',flush=True)
export()

def studio():
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
 scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
 if not scene.world:scene.world=bpy.data.worlds.new('Studio ambient')
 scene.world.color=(.06,.06,.06);scene.view_settings.view_transform='AgX'
 def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
 def area(name,p,power,color,size):
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=C@Vector(p);aim(o,C@Vector((0,.5,0)))
 area('Large softbox',(-2,4,3),520,(.75,.81,1),4);area('Cyan rim',(2,2,-2),520,(.30,.60,1),3);area('Neutral fill',(2,1.5,4),160,(1,.9,.8),3)
 floor=mat('Studio floor',(.065,.073,.09),22,.6);bpy.ops.mesh.primitive_plane_add(size=200);o=bpy.context.object;o.name='STUDIO • excluded from game';o.data.materials.append(floor)
 d=bpy.data.cameras.new('Anatomy review');o=bpy.data.objects.new('Anatomy review',d);bpy.context.collection.objects.link(o);o.location=C@Vector((3.2,2.1,3.6));aim(o,C@Vector((0,.60,.05)));d.type='ORTHO';d.ortho_scale=3.8;scene.camera=o
 scene.render.image_settings.file_format='PNG';scene.render.filepath=str(TMP/'hound-review.png')
 return scene
scene=studio()
arm['workflow']='FRAME → FLESH → WARP';arm['engine_bind']=json.dumps(bones);arm['runtime_asset']='hound.ncm.gz'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hound.blend'),compress=True)
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
if '--animate' in sys.argv:
 samples=json.loads((TMP/'animation.json').read_text())
 for sample in samples:
  for i,b in enumerate(bones):
   # JSON matrices are Three.js column-major; convert before bind-relative pose.
   flat=sample['bones'][i];posed=Matrix([[flat[c*4+r] for c in range(4)] for r in range(4)])
   pb=arm.pose.bones[b['name']];pb.rotation_mode='QUATERNION';pb.matrix=C4@posed@bind[i].inverted()@C4.inverted()@ad.bones[b['name']].matrix_local
   for prop in ['location','rotation_quaternion','scale']:pb.keyframe_insert(data_path=prop,frame=sample['frame'],group=b['name'])
 scene.render.resolution_x=960;scene.render.resolution_y=640;scene.cycles.samples=12;scene.render.fps=24;scene.frame_start=1;scene.frame_end=samples[-1]['frame']
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hound.blend'),compress=True)
 scene.render.filepath=str(TMP/'frames/frame-');bpy.ops.render.render(animation=True)
