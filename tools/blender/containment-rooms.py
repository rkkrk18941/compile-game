import sys,json
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).parent))
from model import Prop,reset
from props import extract,write_pack
root=Path(sys.argv[sys.argv.index('--')+1]);out=root/'noclip/assets/props';items=[];info={}
for name in ['cleanWall','cleanFloor','cleanCeiling']:
 reset();p=Prop(name)
 if name=='cleanWall':
  p.box((4,.2,3),(0,0,1.5),'WALL',(1,1,1),bevel=.004,seg=2)
  for side in[-1,1]:
   p.box((4,.016,.105),(0,side*.108,.0525),'BASE',(.64,.62,.54),bevel=.003,seg=2);p.box((4,.008,.014),(0,side*.113,.111),'METAL',(.5,.51,.48),bevel=.002);p.box((4,.013,.045),(0,side*.107,2.977),'BASE',(.79,.78,.71),bevel=.003)
 elif name=='cleanFloor':p.box((4,4,.075),(0,0,-.0375),'FLOOR',(1,1,1),bevel=.002,seg=2)
 else:
  p.box((4,4,.05),(0,0,.025),'CEIL',(1,1,1),bevel=.002)
  for i in range(-2,3):p.box((.012,4,.016),(i,0,-.008),'METAL',(.7,.71,.68),bevel=.001);p.box((4,.012,.016),(0,i,-.008),'METAL',(.7,.71,.68),bevel=.001)
 ob=p.finish(floor=False,samples=4);bpy.ops.wm.save_as_mainfile(filepath=str(out/(name+'.blend')),compress=True);dec=ob.modifiers.new('Runtime topology','DECIMATE');dec.ratio=.2;bpy.ops.object.modifier_apply(modifier=dec.name);v,idx=extract(ob);items.append((name,v,idx));info[name]={'nv':len(v),'tris':len(idx)//3}
size=write_pack(out/'containment.bin',items);m=json.loads((out/'manifest.json').read_text());m['containment']={'file':'containment.bin','bytes':size,'props':info};(out/'manifest.json').write_text(json.dumps(m,indent=1))
