"""Source-backed behaviour pose proofs/fallback, isolated background Blender.

Arguments: poses|sleep-study|sleep|idle gpu|cpu [size] [samples]. Never saves/promotes.
"""
import bpy
import hashlib
import json
import os
import sys
from mathutils import Vector

BASE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:]
mode, device = args[:2]
assert mode in ('poses', 'sleep-study', 'sleep-face-study', 'sleep', 'idle') and device in ('gpu', 'cpu')
size = int(args[2]) if len(args) > 2 else (320 if mode == 'poses' else 640)
samples = int(args[3]) if len(args) > 3 else (24 if mode == 'poses' else 64)
tag = args[4] if len(args) > 4 else ''
assert tag in ('', 'corrected')
assert size in (320, 640) and 16 <= samples <= 96
source = os.path.realpath(bpy.data.filepath)
assert os.path.basename(source) == 'sprout-prism-behaviours-v004.blend'
digest = hashlib.sha256(open(source, 'rb').read()).hexdigest()
with open(os.path.join(BASE, 'sprout-prism-v004.manifest.json'), encoding='utf8') as handle:
    manifest = json.load(handle)
assert digest == manifest['editable_source_sha256']
scene = bpy.data.scenes['INSIGHTOS_Sprout_v004_behaviours']
bpy.context.window.scene = scene
scene.camera = bpy.data.objects['CAM_sprout_hero']
assert scene.camera.data.type == 'ORTHO'
camera = scene.camera
# Match proposed integration safe envelope: Three half-height1.70,targetY.22.
camera.data.ortho_scale = 3.44
camera.location = (.10, -6, .24)
camera.rotation_euler = (Vector((0, 0, .24)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
rig = bpy.data.objects['RIG_Sprout']
reaction = bpy.data.objects['REACTION_ROOT']
lids = [bpy.data.objects['LID_' + side] for side in ('L', 'R')]
owners = [rig, bpy.data.objects['SPROUT_BODY'].data.shape_keys,
          bpy.data.objects['SPROUT_CORE'].data.shape_keys, reaction, *lids]
if 'cycles' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='cycles')
scene.render.engine = 'CYCLES'
assert scene.render.engine == 'CYCLES'
if device == 'gpu':
    preferences = bpy.context.preferences.addons['cycles'].preferences
    identifiers = [item.identifier for item in preferences.bl_rna.properties['compute_device_type'].enum_items]
    if identifiers:
        assert 'OPTIX' in identifiers
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for item in preferences.devices:
        item.use = item.type == 'OPTIX'
    assert any(item.use for item in preferences.devices)
    scene.cycles.device = 'GPU'
else:
    scene.cycles.device = 'CPU'
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.film_transparent = True
assert 'PNG' in [item.identifier for item in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.resolution_percentage = 100
studies = {'sleep-study-A': {'recline': -.88, 'vertical_scale': .84, 'face_counter': .18, 'lid_depth': 4},
           'sleep-study-B': {'recline': -1.02, 'vertical_scale': .76, 'face_counter': 0, 'lid_depth': 4},
           'sleep-study-C': {'recline': -.91, 'vertical_scale': .82, 'face_counter': .12, 'lid_depth': 6}}
if mode == 'sleep-face-study':
    studies = {'sleep-face-D': {'recline': -.91, 'vertical_scale': .82, 'face_counter': .55, 'lid_depth': 1},
               'sleep-face-E': {'recline': -.70, 'vertical_scale': .78, 'face_counter': .40, 'lid_depth': 1},
               'sleep-face-F': {'recline': -.88, 'vertical_scale': .84, 'face_counter': .70, 'lid_depth': 1}}
poses = [('Sprout_JoyJump', 5, 'joy-crouch'), ('Sprout_JoyJump', 16, 'joy-apex'),
         ('Sprout_JoyJump', 25, 'joy-land'), ('Sprout_SleepLoop', 1, 'sleep'),
         ('Sprout_Wake', 16, 'wake-mid'), ('Sprout_Done', 6, 'done-nod')] if mode == 'poses' else [('Sprout_SleepLoop', 1, name) for name in studies] if mode in ('sleep-study', 'sleep-face-study') else [('Sprout_SleepLoop', 1, 'sleep-fallback')] if mode == 'sleep' else [('Sprout_Idle', 1, 'idle-fallback')]
report_path = os.path.join(BASE, 'proofs', 'v004-' + mode + ('-' + tag if tag else '') + '-render.json')
assert not os.path.exists(report_path), 'Keep old proof, use a new render tag.'
rows = []
study_baseline = None
for clip, frame, label in poses:
    output = os.path.join(BASE, 'proofs', 'sprout-v004-' + label + ('-' + tag if tag else '') + '.png')
    assert not os.path.exists(output)
    active = ['Sprout_Idle', clip] if clip == 'Sprout_Done' else [clip]
    for owner in owners:
        if owner.animation_data:
            owner.animation_data.action = None
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name not in active
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for lid in lids:
        lid.scale = (.003, .004, .001)
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    if label in studies:
        if study_baseline is None:
            study_baseline = {b.name: {prop: tuple(getattr(b, prop)) for prop in ('location', 'rotation_euler', 'scale')} for b in rig.pose.bones}
            study_baseline['morphs'] = [[key.value for key in list(o.key_blocks)[1:]] for o in owners[1:3]]
            for owner in owners:
                owner.animation_data_clear()
        # Frozen geometry study only. Clearing animation in this unsaved
        # subprocess stops render-time NLA evaluation from undoing overrides.
        for bone in rig.pose.bones:
            for prop in ('location', 'rotation_euler', 'scale'):
                setattr(bone, prop, study_baseline[bone.name][prop])
        for shape_keys, values in zip(owners[1:3], study_baseline['morphs']):
            for key, value in zip(list(shape_keys.key_blocks)[1:], values):
                key.value = value
        for lid in lids:
            lid.scale = (1, 1, 1)
        study = studies[label]
        rig.pose.bones['BODY'].rotation_euler.x = study['recline']
        rig.pose.bones['BODY'].scale.y = study['vertical_scale']
        rig.pose.bones['FACE_MOUNT'].rotation_euler.x = study['face_counter']
        for lid in lids:
            lid.scale.y = study['lid_depth']
        bpy.context.view_layer.update()
    scene.render.filepath = output
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(output)
    assert tuple(image.size) == (size, size) and image.channels == 4
    occupied = [i for i, value in enumerate(list(image.pixels)[3::4]) if value > .01]
    box = {'min': [min(i % size for i in occupied), min(i // size for i in occupied)],
           'max': [max(i % size for i in occupied), max(i // size for i in occupied)]}
    assert all(box['min'][a] > 0 and box['max'][a] < size-1 for a in range(2)), 'Pose clipped.'
    rows.append({'clip': clip, 'frame': frame, 'time': (frame-1)/scene.render.fps,
                 'png': output, 'sha256': hashlib.sha256(open(output, 'rb').read()).hexdigest(),
                 'bytes': os.path.getsize(output), 'alpha_bounds_bottom_origin': box,
                 'lids_scale': {lid.name: list(lid.scale) for lid in lids},
                 'study_override': studies.get(label)})
    bpy.data.images.remove(image)
with open(report_path, 'w', encoding='utf8') as handle:
    json.dump({'source': source, 'source_sha256': digest, 'asset_sha256': manifest['sha256'],
               'size': size, 'samples': samples, 'device': device,
               'camera': {'location': list(camera.location), 'target_blender': [0, 0, .24], 'orthographic_span': camera.data.ortho_scale},
               'colour': {'view': scene.view_settings.view_transform, 'exposure': scene.view_settings.exposure},
               'images': rows, 'scope': 'Source-backed Cycles poses; original v003 materials/lightcards. Not exact Three pixels, native clipping, real task or audio proof. No source save/public promotion.'}, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == digest
print(json.dumps({'report': report_path, 'images': [row['png'] for row in rows]}))
