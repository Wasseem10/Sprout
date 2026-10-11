"""Real Blender small-size/grayscale renders and highlight/transparency evidence."""
import bpy, os, json
scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
folder = r'D:\hackathon2026\insightos-ui\design\buddy\renders'
scene.frame_set(1)
scene.render.resolution_x = scene.render.resolution_y = 160
scene.cycles.samples = 64
scene.render.filepath = os.path.join(folder,'readability-160.png')
bpy.ops.render.render(write_still=True)
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.image_settings.color_mode = next(i.identifier for i in scene.render.image_settings.bl_rna.properties['color_mode'].enum_items if i.identifier == 'BW')
scene.render.filepath = os.path.join(folder,'hierarchy-grayscale.png')
bpy.ops.render.render(write_still=True)
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.image_settings.color_mode = next(i.identifier for i in scene.render.image_settings.bl_rna.properties['color_mode'].enum_items if i.identifier == 'RGBA')
scene.cycles.samples = 128
scene.render.filepath = r'D:\hackathon2026\insightos-ui\public\buddy\insight-core-v1.png'
image = bpy.data.images.load(scene.render.filepath,check_existing=True)
pixels = list(image.pixels)
opaque = [pixels[i:i+4] for i in range(0,len(pixels),4) if pixels[i+3] > 0.9]
report = {'png_dimensions':list(image.size), 'png_channels':image.channels,
    'transparent_pixel_fraction':sum(pixels[i+3]<0.01 for i in range(0,len(pixels),4))/(len(pixels)/4),
    'opaque_white_clip_fraction':sum(min(p[:3])>0.99 for p in opaque)/max(1,len(opaque)),
    'opaque_peak_channel':max(max(p[:3]) for p in opaque),
    'readability_render':'renders/readability-160.png',
    'grayscale_render':'renders/hierarchy-grayscale.png',
    'visual_review_notes':'PNG transparency must be composited by the viewer; Cycles glass and runtime transmission lighting differ.'}
with open(os.path.join(os.path.dirname(folder),'visual-audit.json'),'w',encoding='utf8') as output:json.dump(report,output,indent=2)
assert report['png_dimensions']==[640,640]
assert report['png_channels']==4
assert report['transparent_pixel_fraction']>0.5
assert report['opaque_white_clip_fraction']<0.01
print(report)
