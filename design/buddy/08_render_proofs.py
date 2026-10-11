"""Small local product-lighting and motion proof frames. Restores hero settings."""
import bpy, os
scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
folder = r'D:\hackathon2026\insightos-ui\design\buddy\renders'
os.makedirs(folder,exist_ok=True)
source = r'D:\hackathon2026\insightos-ui\design\buddy\04_lighting.py'
rendered = []
for stage in ['world_only','zero_world','key_only','fill_only','rim_only']:
    LIGHT_STAGE = stage
    exec(compile(open(source,encoding='utf8').read(),'04_lighting.py','exec'))
    scene.render.resolution_x = scene.render.resolution_y = 320
    scene.cycles.samples = 24
    scene.frame_set(1)
    scene.render.filepath = os.path.join(folder,'light-'+stage+'.png')
    bpy.ops.render.render(write_still=True)
    rendered.append(scene.render.filepath)
LIGHT_STAGE = 'full'
exec(compile(open(source,encoding='utf8').read(),'04_lighting.py','exec'))
scene.render.resolution_x = scene.render.resolution_y = 320
scene.cycles.samples = 32
for frame in [1,13,73,144,145]:
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(folder,'motion-'+str(frame).zfill(3)+'.png')
    bpy.ops.render.render(write_still=True)
    rendered.append(scene.render.filepath)
scene.frame_set(1)
scene.render.resolution_x = scene.render.resolution_y = 640
scene.cycles.samples = 128
scene.render.filepath = r'D:\hackathon2026\insightos-ui\public\buddy\insight-core-v1.png'
os.makedirs(os.path.dirname(scene.render.filepath),exist_ok=True)
bpy.ops.render.render(write_still=True)
print({'proof_renders':rendered,'final_fallback':scene.render.filepath,'bytes':os.path.getsize(scene.render.filepath),'path_unchanged':bpy.data.filepath==''})
