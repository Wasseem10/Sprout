"""Render an owned source candidate in a background process; never save it.

Arguments after --: volume|core|core-refined|control [front|poses] [gpu|cpu]
Use the corresponding source .blend. Keep native/browser GPU work serial.
"""
import bpy
import hashlib
import json
import math
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['volume']
variant = args[0]
mode = args[1] if len(args) > 1 else 'front'
device = args[2] if len(args) > 2 else 'cpu'
assert variant in ('volume', 'core', 'core-refined', 'control') and mode in ('front', 'poses')
source = bpy.data.filepath
expected = 'sprout-prism-v002.blend' if variant == 'control' else 'sprout-' + variant + '-v003.blend'
assert os.path.basename(source) == expected
source_hash = hashlib.sha256(open(source, 'rb').read()).hexdigest()
scene = next(s for s in bpy.data.scenes if s.name.startswith('INSIGHTOS_Sprout_'))
bpy.context.window.scene = scene
scene.camera = bpy.data.objects['CAM_sprout_hero']
root = bpy.data.objects['SPROUT_ROOT']
reaction = bpy.data.objects['REACTION_ROOT']
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects.get('SPROUT_CORE')
owners = [bpy.data.objects['RIG_Sprout'], body.data.shape_keys, reaction,
          bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
if core:
    owners.append(core.data.shape_keys)
if device == 'gpu':
    if 'cycles' not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module='cycles')
    preferences = bpy.context.preferences.addons['cycles'].preferences
    valid = [item.identifier for item in preferences.bl_rna.properties['compute_device_type'].enum_items]
    if valid:
        assert 'OPTIX' in valid
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    found = False
    for entry in preferences.devices:
        entry.use = entry.type == 'OPTIX'
        found |= entry.use
    assert found, 'No OptiX device; choose CPU explicitly.'
    scene.cycles.device = 'GPU'
else:
    assert device == 'cpu'
    scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.cycles.use_denoising = True
scene.render.film_transparent = True
assert 'PNG' in [item.identifier for item in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
assert 'RGBA' in [item.identifier for item in scene.render.image_settings.bl_rna.properties['color_mode'].enum_items]
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.cycles.samples = 24

def pose(clip, frame, yaw=0, pitch=0):
    active = [clip] if clip in ('Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak') else ['Sprout_Idle', clip]
    for owner in owners:
        if owner.animation_data:
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name not in active
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for side in ('L', 'R'):
        bpy.data.objects['LID_' + side].scale = (0.003, 0.004, 0.001)
    root.rotation_euler = (math.radians(pitch), 0, math.radians(yaw))
    scene.frame_set(frame)
    bpy.context.view_layer.update()

studies = [('front', 'Sprout_Idle', 1, 0, 0)]
if mode == 'poses':
    studies = [('front', 'Sprout_Idle', 1, 0, 0),
               ('turn-right-up', 'Sprout_Listen', 37, 10, -6),
               ('turn-left-down', 'Sprout_Think', 73, -10, 6),
               ('click-squash', 'Sprout_Click', 3, 10, -6),
               ('blink-closed', 'Sprout_Blink', 3, -10, 6),
               ('speaking', 'Sprout_Speak', 37, 0, 0)]
images = []
for label, clip, frame, yaw, pitch in studies:
    pose(clip, frame, yaw, pitch)
    output = os.path.join(BASE, 'proofs', variant + '-v003-' + label + '.png')
    scene.render.filepath = output
    bpy.ops.render.render(write_still=True)
    images.append({'path': output, 'clip': clip, 'frame': frame, 'yaw': yaw, 'pitch': pitch})
report = {'variant': variant, 'mode': mode, 'source': source, 'source_sha256': source_hash,
          'blender': bpy.app.version_string, 'device': device, 'size': 320, 'samples': 24,
          'camera': {'position': list(scene.camera.location), 'orthographic_span': scene.camera.data.ortho_scale},
          'view_transform': scene.view_settings.view_transform, 'exposure': scene.view_settings.exposure,
          'world_strength': next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value,
          'lights': {role: {'position': list(bpy.data.objects['LGT_sprout_' + role].location),
                            'energy': bpy.data.objects['LGT_sprout_' + role].data.energy,
                            'size': bpy.data.objects['LGT_sprout_' + role].data.size,
                            'size_y': bpy.data.objects['LGT_sprout_' + role].data.size_y} for role in ('key', 'fill', 'rim')},
          'images': images, 'scope': 'Supporting offline material/pose study; no browser/native acceptance or source save.'}
with open(os.path.join(BASE, 'proofs', variant + '-v003-' + mode + '-renders.json'), 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == source_hash
print(json.dumps(report))
