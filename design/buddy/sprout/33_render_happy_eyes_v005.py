"""Reopen owned source; inspect authored actions and render eye proofs/fallbacks.

Arguments after --: study|fallback|audit gpu|cpu [size] [samples]. No scene save,
runtime changes, public promotion, or live Blender mutation.
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
assert mode in ('study', 'fallback', 'audit') and device in ('gpu', 'cpu')
size = int(args[2]) if len(args) > 2 else (640 if mode == 'fallback' else 320)
samples = int(args[3]) if len(args) > 3 else (64 if mode == 'fallback' else 16)
assert size in (320, 640) and 16 <= samples <= 96
source = os.path.realpath(bpy.data.filepath)
manifest = json.load(open(os.path.join(BASE, 'sprout-prism-v005.manifest.json'), encoding='utf8'))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
assert source == os.path.realpath(manifest['editable_source'])
assert sha(source) == manifest['editable_source_sha256']
scene = bpy.data.scenes['INSIGHTOS_Sprout_v005_eyes']
bpy.context.window.scene = scene
camera = bpy.data.objects['CAM_sprout_hero']
scene.camera = camera
for card in [o for o in scene.objects if o.name.startswith('REFLECTION_sprout_')]:
    card.visible_camera = False
assert camera.data.type == 'ORTHO'
camera.data.ortho_scale = 3.44
target = Vector((0, 0, .24))
rig = bpy.data.objects['RIG_Sprout']
reaction = bpy.data.objects['REACTION_ROOT']
eyes = [bpy.data.objects['EYE_' + s] for s in ('L', 'R')]
glints = [bpy.data.objects['GLINT_' + s] for s in ('L', 'R')]
body_keys = [bpy.data.objects[n].data.shape_keys for n in ('SPROUT_BODY', 'SPROUT_CORE')]
eye_keys = [e.data.shape_keys for e in eyes]
owners = [rig, *body_keys, reaction, *eye_keys, *glints]
assert len(rig.pose.bones) == 9
assert all(n not in bpy.data.objects for n in manifest['removed_rendered_objects'])
assert all([k.name for k in key.key_blocks] == ['Basis', 'CloseHappy'] for key in eye_keys)

def activate(clip, frame, closure=None):
    # Same actual source actions/slots as exported; direct action evaluation
    # avoids Blender 5.2's stale new-Key NLA cache. Never fabricate animation.
    for owner in owners:
        ad = owner.animation_data
        if ad:
            ad.action = None
            ad.use_nla = False
            for track in ad.nla_tracks:
                track.mute = True
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for key in body_keys:
        for block in list(key.key_blocks)[1:]:
            block.value = 0
    for key in eye_keys:
        key.key_blocks['CloseHappy'].value = 0
    for glint in glints:
        glint.scale = (1, 1, 1)
    for owner in owners:
        ad = owner.animation_data
        if not ad:
            continue
        actual = clip
        if clip == 'Sprout_Blink' and owner not in eye_keys and owner not in glints:
            actual = 'Sprout_Idle'
        track = next((t for t in ad.nla_tracks if t.name == actual), None)
        if track:
            strip = track.strips[0]
            ad.action = strip.action
            ad.action_slot = strip.action_slot
        owner.update_tag()
    for eye in eyes:
        eye.data.update_tag()
        eye.update_tag(refresh={'OBJECT', 'DATA', 'TIME'})
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    if closure is not None:
        # Deliberate geometry cross-section study, not a sampled clip time.
        for key in eye_keys:
            key.animation_data.action = None
            key.key_blocks['CloseHappy'].value = closure
        for glint in glints:
            glint.animation_data.action = None
            t = min(1, closure/.75)
            glint.scale = (1 - .999*t*t*(3-2*t),) * 3
        for eye in eyes:
            eye.data.shape_keys.update_tag()
            eye.data.update_tag()
            eye.update_tag(refresh={'OBJECT', 'DATA', 'TIME'})
        bpy.context.view_layer.update()

checks = []
for clip, frames in [('Sprout_Blink', 5), ('Sprout_SleepEnter', 41),
                     ('Sprout_SleepLoop', 121), ('Sprout_Wake', 31)]:
    samples_by_eye = []
    for frame in range(1, frames+1):
        activate(clip, frame)
        values = [key.key_blocks['CloseHappy'].value for key in eye_keys]
        expected = manifest['eye_clips'][clip]['source_closure_samples'][frame-1]
        assert all(abs(value-expected) < 1e-5 for value in values), (clip, frame, values, expected)
        samples_by_eye.append(values)
    checks.append({'clip': clip, 'frame_count': frames, 'first': samples_by_eye[0],
                   'last': samples_by_eye[-1], 'peak': [max(v[i] for v in samples_by_eye) for i in (0, 1)]})
report_path = os.path.join(BASE, 'proofs', 'v005-eyes-' + mode + '.json')
assert not os.path.exists(report_path), 'Preserve existing proof; choose a new version.'
rows = []
if mode != 'audit':
    if 'cycles' not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module='cycles')
    scene.render.engine = 'CYCLES'
    assert scene.render.engine == 'CYCLES'
    if device == 'gpu':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        identifiers = [e.identifier for e in preferences.bl_rna.properties['compute_device_type'].enum_items]
        if identifiers:
            assert 'OPTIX' in identifiers
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for entry in preferences.devices:
            entry.use = entry.type == 'OPTIX'
        assert any(entry.use for entry in preferences.devices)
        scene.cycles.device = 'GPU'
    else:
        scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    poses = [('Sprout_Idle', 1, f'front-{round(c*100):03}', c, 'front') for c in (0, .25, .5, .75, 1)]
    poses += [('Sprout_Idle', 1, f'quarter-{round(c*100):03}', c, 'quarter') for c in (.5, 1)]
    poses += [('Sprout_SleepLoop', 1, 'reclined-sleep', None, 'front')]
    if mode == 'fallback':
        poses = [('Sprout_Idle', 1, 'idle-fallback', None, 'front'),
                 ('Sprout_SleepLoop', 1, 'sleep-fallback', None, 'front')]
    for clip, frame, label, closure, view in poses:
        activate(clip, frame, closure)
        camera.location = (.10, -6, .24) if view == 'front' else (2.1, -5.7, .45)
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
        output = os.path.join(BASE, 'proofs', 'sprout-v005-' + label + '.png')
        scene.render.filepath = output
        if not os.path.exists(output):
            bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(output)
        assert image.channels == 4 and tuple(image.size) == (size, size)
        occupied = [i for i, alpha in enumerate(list(image.pixels)[3::4]) if alpha > .01]
        box = {'min': [min(i % size for i in occupied), min(i // size for i in occupied)],
               'max': [max(i % size for i in occupied), max(i // size for i in occupied)]}
        assert all(box['min'][a] > 0 and box['max'][a] < size-1 for a in (0, 1)), 'Clipped pose.'
        rows.append({'clip': clip, 'frame': frame, 'closure_study': closure, 'view': view,
                     'png': output, 'sha256': sha(output), 'bytes': os.path.getsize(output),
                     'eye_values': [k.key_blocks['CloseHappy'].value for k in eye_keys],
                     'glint_scales': [list(g.scale) for g in glints],
                     'alpha_bounds_bottom_origin': box})
        bpy.data.images.remove(image)
report = {'pass': True, 'source': source, 'source_sha256': sha(source),
          'asset_sha256': manifest['sha256'], 'blender': bpy.app.version_string,
          'source_reopened': True, 'source_action_samples': checks, 'images': rows,
          'render': {'mode': mode, 'device': device, 'size': size, 'samples': samples,
                     'colour_view': scene.view_settings.view_transform,
                     'camera_span': camera.data.ortho_scale, 'target_blender': list(target)},
          'scope': 'Actual reopened source actions and eye morph geometry. Source-backed Cycles study/fallback; not exact Three pixels, native clipping or live voice. Unsaved isolated process, no public promotion.'}
json.dump(report, open(report_path, 'w', encoding='utf8'), indent=2)
assert sha(source) == manifest['editable_source_sha256']
print(json.dumps({'report': report_path, 'images': len(rows), 'source_action_samples': checks}))
