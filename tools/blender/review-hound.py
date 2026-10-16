"""Render the engine's sampled animation on the actual editable game asset.
Blender -b -P tools/blender/review-hound.py -- REPO [--video] [--frame=49]
The render uses the engine bone matrices from tools/noclip/hound-review.mjs.
"""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Matrix,Vector
root=Path(sys.argv[sys.argv.index('--')+1]);tmp=root/'.tmp/anatomy'
bpy.ops.wm.open_mainfile(filepath=str(root/'noclip/assets/creatures/hound.blend'))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
bones=json.loads(arm['engine_bind']);samples=json.loads((tmp/'animation.json').read_text())
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));CI=C.inverted();bind=[]
for b in bones:
 m=Matrix.Translation(Vector(b['pos']));bind.append((bind[b['parent']] if b['parent']>=0 else Matrix.Identity(4))@m)
for sample in samples:
 posed=[]
 for i,b in enumerate(bones):
  flat=sample['bones'][i];m=Matrix([[flat[c*4+r] for c in range(4)] for r in range(4)])
  posed.append(C@m@bind[i].inverted()@CI@arm.data.bones[b['name']].matrix_local)
 for i,b in enumerate(bones):
  pb=arm.pose.bones[b['name']];rest=arm.data.bones[b['name']].matrix_local
  if b['parent']>=0:
   pr=arm.data.bones[bones[b['parent']]['name']].matrix_local
   basis=(pr.inverted()@rest).inverted()@posed[b['parent']].inverted()@posed[i]
  else:basis=rest.inverted()@posed[i]
  pb.rotation_mode='QUATERNION';pb.matrix_basis=basis
  for prop in ['location','rotation_quaternion','scale']:pb.keyframe_insert(data_path=prop,frame=sample['frame'],group=b['name'])
# Set linear interpolation so frame samples, foot contacts and jaw limits are
# preserved without Bezier overshoot between imported samples.
if arm.animation_data and arm.animation_data.action:
 for curve in arm.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=len(samples);scene.render.fps=24
frame=next((int(s.split('=')[1]) for s in sys.argv if s.startswith('--frame=')),49)
scene.frame_set(frame);bpy.context.view_layer.update()
scene.camera.data.ortho_scale=3.8
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.cycles.samples=24
scene.render.filepath=str(tmp/'hound-posed.png')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'noclip/assets/creatures/hound.blend'),compress=True)
if '--video' in sys.argv:
 # A small moving grid makes contact duration visible in the centred view.
 # The rig contains the same inverse root translation as the review JSON.
 floor=bpy.data.objects.get('STUDIO • excluded from game')
 material=floor.data.materials[0];nodes=material.node_tree.nodes;links=material.node_tree.links
 tex=nodes.new('ShaderNodeTexChecker');tex.inputs['Color1'].default_value=(.045,.051,.065,1);tex.inputs['Color2'].default_value=(.059,.065,.08,1);tex.inputs['Scale'].default_value=120
 coords=nodes.new('ShaderNodeTexCoord');links.new(coords.outputs['Generated'],tex.inputs['Vector']);links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 for s in samples:floor.location.y=s['rootZ'];floor.keyframe_insert(data_path='location',frame=s['frame'])
 scene.render.resolution_x=640;scene.render.resolution_y=448;scene.cycles.samples=6;scene.render.resolution_percentage=100
 scene.frame_step=2;scene.render.filepath=str(tmp/'frames/pose-')
 bpy.ops.render.render(animation=True)
else:bpy.ops.render.render(write_still=True)
