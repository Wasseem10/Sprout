"""Export the owned Sprout selection and audit the actual binary document."""
import bpy
import hashlib
import json
import os
import shutil
import struct

BASE=r'D:\hackathon2026\insightos-ui'
scene=bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene=scene
root=bpy.data.objects['REACTION_ROOT']
root.scale=(1,1,1);root.rotation_euler=(0,0,0);root.location=(0,0,0)
for side in ['L','R']:bpy.data.objects['LID_'+side].scale=(0.003,0.004,0.001)
scene.frame_set(1)
for ob in bpy.context.selected_objects:ob.select_set(False)
selected=list(bpy.data.collections['SPROUT_MODEL'].objects)
for ob in selected:ob.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['RIG_Sprout']
path=os.path.join(BASE,'design','buddy','sprout',globals().get('EXPORT_NAME','sprout-proof-v002.glb'))
settings=dict(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,export_frame_step=1,export_anim_slide_to_zero=True,
    export_apply=False,export_def_bones=False,export_morph=True,
    export_morph_normal=True,export_morph_animation=True,export_normals=True,
    export_texcoords=True,export_vertex_color='ACTIVE',export_all_vertex_colors=True,
    export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties
assert all(k in valid for k in settings), 'Check current exporter before changing settings.'
bpy.ops.export_scene.gltf(**settings)
data=open(path,'rb').read()
assert data[:4]==b'glTF'
length,kind=struct.unpack_from('<II',data,12)
assert kind==0x4e4f534a
doc=json.loads(data[20:20+length])
nodes=doc.get('nodes',[])
report={'path':path,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),
    'generator':doc.get('asset',{}).get('generator'),'settings':settings,
    'nodes':[n.get('name') for n in nodes],
    'skins':[{'joints':[nodes[i].get('name') for i in s['joints']]} for s in doc.get('skins',[])],
    'meshes':[{'name':m.get('name'),'morphs':m.get('extras',{}).get('targetNames'),
        'primitives':[{'attributes':list(p['attributes']),'targets':[list(t) for t in p.get('targets',[])]} for p in m['primitives']]} for m in doc.get('meshes',[])],
    'animations':[{'name':a.get('name'),'channels':[{'node':nodes[c['target']['node']].get('name'),'path':c['target']['path']} for c in a['channels']]} for a in doc.get('animations',[])]}
manifest=path.replace('.glb','.manifest.json')
with open(manifest,'w') as f:json.dump(report,f,indent=2)
if globals().get('PUBLISH',True):
    shutil.copyfile(path,os.path.join(BASE,'public','buddy','sprout-v002.glb'))
print(json.dumps({'path':path,'bytes':len(data),'sha256':report['sha256'],
    'skins':report['skins'],'clips':[{ 'name':a['name'],'channels':len(a['channels'])} for a in report['animations']]}))
