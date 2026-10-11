"""Read a saved source in a separate background Blender; never saves it."""
import bpy
import hashlib
import json
import os
import sys

scene=bpy.data.scenes.get('INSIGHTOS_Sprout_v002')
assert scene is not None
body=bpy.data.objects['SPROUT_BODY']
rig=bpy.data.objects['RIG_Sprout']
clips=sorted({t.name for ob in scene.objects if ob.animation_data for t in ob.animation_data.nla_tracks})
report={'source':bpy.data.filepath,'source_sha256':hashlib.sha256(open(bpy.data.filepath,'rb').read()).hexdigest(),
    'blender':bpy.app.version_string,'scenes':[s.name for s in bpy.data.scenes],
    'objects':len(scene.objects),'bones':[b.name for b in rig.data.bones],
    'body_vertices':len(body.data.vertices),'morphs':[k.name for k in body.data.shape_keys.key_blocks],
    'clips':clips,'material':body.data.materials[0].name,
    'source_proxies':len(bpy.data.collections['SPROUT_PROXIES'].objects),
    'camera':scene.camera.name if scene.camera else None}
assert len(report['bones'])==9
assert report['morphs']==['Basis','Jelly_Squash','Jelly_Sway_L','Jelly_Sway_R']
assert all(n in clips for n in ['Sprout_Idle','Sprout_Listen','Sprout_Click','Sprout_Blink'])
assert report['source_proxies']>=7
report['pass']=True
if '--' in sys.argv:
    output=sys.argv[sys.argv.index('--')+1]
    with open(output,'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report))
