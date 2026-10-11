"""Render an accepted owned Sprout source to a versioned static fallback.

Prepared before selection. Invoke only after browser/native look acceptance.
Arguments after --: proof-stem gpu|cpu [size=640] [samples=96]
Never saves its source, writes public files, or overwrites an existing fallback.
"""
import bpy
import hashlib
import json
import math
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
assert len(args) >= 2, 'Explicit accepted proof stem and render device required.'
stem, device = args[:2]
assert re.fullmatch(r'sprout-[a-z0-9-]+-v003-front', stem)
assert device in ('gpu', 'cpu')
size = int(args[2]) if len(args) > 2 else 640
samples = int(args[3]) if len(args) > 3 else 96
assert size in (320, 640) and 24 <= samples <= 128
source = os.path.realpath(bpy.data.filepath)
assert os.path.dirname(source) == os.path.realpath(os.path.join(BASE, 'source'))
assert os.path.basename(source).startswith('sprout-') and os.path.basename(source).endswith('-v003.blend')
digest = hashlib.sha256(open(source, 'rb').read()).hexdigest()
png = os.path.join(BASE, 'proofs', stem + '.png')
report_path = os.path.join(BASE, 'proofs', stem + '.render.json')
assert not os.path.exists(png) and not os.path.exists(report_path), 'Use a new proof checkpoint.'
scenes = [scene for scene in bpy.data.scenes if scene.name.startswith('INSIGHTOS_Sprout_v003')]
assert len(scenes) == 1
scene = scenes[0]
bpy.context.window.scene = scene
scene.camera = bpy.data.objects['CAM_sprout_hero']
assert scene.camera.data.type == 'ORTHO'
root = bpy.data.objects['SPROUT_ROOT']
reaction = bpy.data.objects['REACTION_ROOT']
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects.get('SPROUT_CORE')
owners = [bpy.data.objects['RIG_Sprout'], body.data.shape_keys, reaction,
          bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
if core:
    owners.append(core.data.shape_keys)
for owner in owners:
    if owner.animation_data:
        for track in owner.animation_data.nla_tracks:
            track.mute = track.name != 'Sprout_Idle'
root.rotation_euler = (0, 0, 0)
reaction.location = (0, 0, 0)
reaction.rotation_euler = (0, 0, 0)
reaction.scale = (1, 1, 1)
for side in ('L', 'R'):
    bpy.data.objects['LID_' + side].scale = (0.003, 0.004, 0.001)
scene.frame_set(1)
bpy.context.view_layer.update()
assert all(abs(bpy.data.objects['LID_' + side].scale.z - 0.001) < 1e-5 for side in ('L', 'R')), 'Confirm neutral open eyes.'
# Blender's dynamic render-engine enum is omitted from RNA enum_items in this
# installed version. Enable the installed addon, then verify the actual setter
# in this isolated owned source instead of rejecting a supported engine.
if 'cycles' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='cycles')
scene.render.engine = 'CYCLES'
assert scene.render.engine == 'CYCLES'
if device == 'gpu':
    if 'cycles' not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module='cycles')
    preferences = bpy.context.preferences.addons['cycles'].preferences
    identifiers = [item.identifier for item in preferences.bl_rna.properties['compute_device_type'].enum_items]
    if identifiers:
        assert 'OPTIX' in identifiers
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for item in preferences.devices:
        item.use = item.type == 'OPTIX'
    assert any(item.use for item in preferences.devices), 'Choose CPU explicitly if OptiX unavailable.'
    scene.cycles.device = 'GPU'
else:
    scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.film_transparent = True
assert 'PNG' in [item.identifier for item in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
assert 'RGBA' in [item.identifier for item in scene.render.image_settings.bl_rna.properties['color_mode'].enum_items]
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.resolution_percentage = 100
scene.render.filepath = png
bpy.ops.render.render(write_still=True)
image = bpy.data.images.load(png)
assert image.channels == 4 and tuple(image.size) == (size, size)
alpha = list(image.pixels)[3::4]
occupied = [(index % size, index // size) for index, value in enumerate(alpha) if value > 0.01]
assert occupied, 'Empty render.'
box = {'min': [min(point[axis] for point in occupied) for axis in (0, 1)],
       'max': [max(point[axis] for point in occupied) for axis in (0, 1)]}
assert all(box['min'][axis] > 0 and box['max'][axis] < size - 1 for axis in (0, 1)), 'Fallback is clipped.'
report = {'source': source, 'source_sha256': digest, 'png': png,
          'png_sha256': hashlib.sha256(open(png, 'rb').read()).hexdigest(), 'bytes': os.path.getsize(png),
          'blender': bpy.app.version_string, 'device': device, 'size': size, 'samples': samples,
          'colour': {'view_transform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
                     'exposure': scene.view_settings.exposure, 'gamma': scene.view_settings.gamma},
          'camera': {'position': list(scene.camera.location), 'rotation': list(scene.camera.rotation_euler),
                     'orthographic_span': scene.camera.data.ortho_scale},
          'pose': {'clip': 'Sprout_Idle', 'frame': 1, 'mount_yaw': 0, 'mount_pitch': 0,
                   'lids': {side: list(bpy.data.objects['LID_' + side].scale) for side in ('L', 'R')}},
          'alpha': {'min': min(alpha), 'max': max(alpha), 'nonzero_bounds_bottom_origin': box,
                    'pixels_over_0_01': len(occupied)},
          'scope': 'Static source-backed Cycles fallback. Source unchanged; public copy requires root promotion. Supporting offline appearance, not exact Three pixels or motion/provider proof.'}
with open(report_path, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
bpy.data.images.remove(image)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == digest
print(json.dumps({'png': png, 'sha256': report['png_sha256'], 'bytes': report['bytes'], 'report': report_path}))
