"""Render an evaluated pose; CLIP/FRAME/OUTPUT are explicit caller inputs."""
import bpy
import os

BASE=r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
scene=bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene=scene
clip=globals().get('CLIP','Sprout_Idle')
frame=globals().get('FRAME',1)
owners=[bpy.data.objects['RIG_Sprout'],bpy.data.objects['SPROUT_BODY'].data.shape_keys,
    bpy.data.objects['REACTION_ROOT'],bpy.data.objects['LID_L'],bpy.data.objects['LID_R']]
saved=[(t,t.mute) for o in owners if o.animation_data for t in o.animation_data.nla_tracks]
def reset_oneshots():
    root=bpy.data.objects['REACTION_ROOT']
    root.scale=(1,1,1);root.rotation_euler=(0,0,0);root.location=(0,0,0)
    for side in ['L','R']:bpy.data.objects['LID_'+side].scale=(0.003,0.004,0.001)
try:
    for t,_ in saved:t.mute=t.name not in ([clip] if clip in ['Sprout_Idle','Sprout_Listen','Sprout_Think','Sprout_Speak'] else ['Sprout_Idle',clip])
    reset_oneshots()
    scene.frame_set(frame)
    scene.camera=bpy.data.objects['CAM_sprout_hero']
    scene.render.resolution_x=scene.render.resolution_y=globals().get('SIZE',512)
    scene.render.resolution_percentage=100
    scene.cycles.samples=globals().get('SAMPLES',32)
    scene.render.filepath=os.path.join(BASE,'proofs',globals().get('OUTPUT','clay-'+clip+'-'+str(frame)+'.png'))
    bpy.ops.render.render(write_still=True)
    print({'rendered':scene.render.filepath,'clip':clip,'frame':frame,'size':scene.render.resolution_x})
finally:
    for t,mute in saved:t.mute=mute
    reset_oneshots()
    scene.frame_set(1)
