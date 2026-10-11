"""Reopen the saved v008, audit evaluated poses, optionally render actual frames.

Blender --background --factory-startup source/sprout-soft-original-v008.blend
--python-exit-code 1 --python this_file -- audit|render
No source save or live scene mutation. Renders are source Cycles, not Three.
"""
import bpy
import hashlib
import json
import math
import os
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BASE = os.path.dirname(os.path.abspath(__file__))
MODE = sys.argv[sys.argv.index('--') + 1]
assert MODE in ('audit', 'render')
manifest = json.load(open(os.path.join(BASE, 'sprout-soft-original-v008.manifest.json'), encoding='utf8'))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
assert os.path.realpath(bpy.data.filepath) == os.path.realpath(manifest['editable_source'])
assert sha(bpy.data.filepath) == manifest['editable_source_sha256']
scene = bpy.data.scenes['INSIGHTOS_Sprout_v008_soft_original']
bpy.context.window.scene = scene
for light in manifest['source_lighting']['lights']:
    ob = scene.objects[light['name']]
    assert list(ob.location) == light['location_blender']
    assert list(ob.rotation_euler) == light['rotation_euler']
    assert list(ob.data.color) == light['color_linear']
    assert ob.data.energy == light['energy_watts']
for card in manifest['source_lighting']['cards']:
    ob = scene.objects[card['name']]
    assert list(ob.location) == card['location_blender']
    assert list(ob.rotation_euler) == card['rotation_euler']
    emission = next(n for n in ob.data.materials[0].node_tree.nodes if n.type == 'EMISSION')
    assert emission.inputs['Strength'].default_value == card['emission_strength']
    assert list(emission.inputs['Color'].default_value) == card['color_linear']
rig = bpy.data.objects['RIG_Sprout']
body, core = [bpy.data.objects[n] for n in ('SPROUT_BODY', 'SPROUT_CORE')]
reaction = bpy.data.objects['REACTION_ROOT']
eyes = [bpy.data.objects['EYE_' + s] for s in ('L', 'R')]
glints = [bpy.data.objects['GLINT_' + s] for s in ('L', 'R')]
body_keys = [body.data.shape_keys, core.data.shape_keys]
eye_keys = [e.data.shape_keys for e in eyes]
owners = [rig, *body_keys, reaction, *eye_keys, *glints]
model = [o for o in bpy.data.collections['SPROUT_MODEL'].objects if o.type == 'MESH']
assert len(model) == 7 and len(rig.pose.bones) == 9

def activate(clip, frame):
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
    reaction.location = reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for keys in body_keys:
        for block in list(keys.key_blocks)[1:]:
            block.value = 0
    for keys in eye_keys:
        keys.key_blocks['CloseHappy'].value = 0
    for glint in glints:
        glint.scale = (1, 1, 1)
    for owner in owners:
        ad = owner.animation_data
        if ad:
            actual = 'Sprout_Idle' if clip == 'Sprout_Blink' and owner not in eye_keys+glints else clip
            track = next((t for t in ad.nla_tracks if t.name == actual), None)
            if track:
                strip = track.strips[0]
                ad.action, ad.action_slot = strip.action, strip.action_slot
            owner.update_tag()
    for eye in eyes:
        eye.data.update_tag()
        eye.update_tag(refresh={'OBJECT', 'DATA', 'TIME'})
    scene.frame_set(frame)
    bpy.context.view_layer.update()

def evaluated(obj):
    item = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = item.to_mesh()
    points = [item.matrix_world @ v.co for v in mesh.vertices]
    faces = [tuple(p.vertices) for p in mesh.polygons]
    item.to_mesh_clear()
    return points, faces

def values():
    return [v for bone in rig.pose.bones for prop in ('location', 'rotation_euler', 'scale') for v in getattr(bone, prop)] + [key.value for keys in body_keys for key in list(keys.key_blocks)[1:]]

union = {'min': [float('inf')]*3, 'max': [float('-inf')]*3}
keyposes = []
first = None
for frame in range(1, 146):
    activate('Sprout_Speak', frame)
    assert all(math.isfinite(v) for v in values())
    if first is None:
        first = values()
    for bone_name in ('ROOT', 'FOOT_L', 'FOOT_R'):
        bone = rig.pose.bones[bone_name]
        assert tuple(bone.location) == tuple(bone.rotation_euler) == (0, 0, 0)
        assert tuple(bone.scale) == (1, 1, 1)
    assert [k.value for k in list(body_keys[0].key_blocks)[1:]] == [k.value for k in list(body_keys[1].key_blocks)[1:]]
    assert all(key.key_blocks['CloseHappy'].value == 0 for key in eye_keys)
    points = [point for obj in model for point in evaluated(obj)[0]]
    for axis in range(3):
        union['min'][axis] = min(union['min'][axis], min(p[axis] for p in points))
        union['max'][axis] = max(union['max'][axis], max(p[axis] for p in points))
    if frame in (1, 13, 26, 40, 56, 70, 81, 97, 113, 126, 139, 145):
        shell_points, shell_faces = evaluated(body)
        core_points, _ = evaluated(core)
        tree = BVHTree.FromPolygons(shell_points, shell_faces)
        nearest = [tree.find_nearest(p) for p in core_points]
        signed = [(p-hit[0]).dot(hit[1]) for p, hit in zip(core_points, nearest)]
        assert all(d < -1e-5 for d in signed), ('Core escaped shell', frame, max(signed))
        keyposes.append({'frame': frame, 'seconds': (frame-1)/24,
                         'minimum_core_clearance': min(hit[3] for hit in nearest),
                         'outside_core_vertices': sum(d >= -1e-5 for d in signed),
                         'left_bud_rotation': list(rig.pose.bones['BUD_L_BASE'].rotation_euler),
                         'right_bud_rotation': list(rig.pose.bones['BUD_R_BASE'].rotation_euler)})
seam_error = max(abs(a-b) for a, b in zip(first, values()))
assert seam_error < 1e-6
eye_checks = []
for clip, count in [('Sprout_Blink', 5), ('Sprout_SleepEnter', 41), ('Sprout_SleepLoop', 121), ('Sprout_Wake', 31)]:
    for frame in range(1, count+1):
        activate(clip, frame)
        expected = manifest['eye_clips'][clip]['source_closure_samples'][frame-1]
        assert all(abs(keys.key_blocks['CloseHappy'].value-expected) < 1e-5 for keys in eye_keys)
    eye_checks.append({'clip': clip, 'frames': count, 'pass': True})

renders = []
if MODE == 'render':
    def set_enum(owner, name, value):
        choices = [i.identifier for i in owner.bl_rna.properties[name].enum_items]
        assert value in choices, (name, value, choices)
        setattr(owner, name, value)
    if 'cycles' not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module='cycles')
    try:
        scene.render.engine = 'CYCLES'
    except TypeError as error:
        raise RuntimeError('Cycles unavailable') from error
    preferences = bpy.context.preferences.addons['cycles'].preferences
    choices = [e.identifier for e in preferences.bl_rna.properties['compute_device_type'].enum_items]
    assert not choices or 'OPTIX' in choices
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == 'OPTIX'
    assert any(device.use for device in preferences.devices)
    set_enum(scene.cycles, 'device', 'GPU')
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    set_enum(scene.render.image_settings, 'file_format', 'PNG')
    set_enum(scene.render.image_settings, 'color_mode', 'RGBA')
    scene.render.resolution_x = scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    camera = bpy.data.objects['CAM_sprout_hero']
    scene.camera = camera
    camera.data.ortho_scale = 3.44
    camera.location = (.10, -6, .24)
    camera.rotation_euler = (Vector((0, 0, .24))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    for card in [o for o in scene.objects if o.name.startswith('REFLECTION_sprout_')]:
        card.visible_camera = False
    for clip, frame in [('Sprout_Idle', 1), ('Sprout_Idle', 26), ('Sprout_Listen', 26), ('Sprout_Think', 26),
                        ('Sprout_Speak', 1), ('Sprout_Speak', 26), ('Sprout_Speak', 81), ('Sprout_Speak', 126),
                        ('Sprout_SleepLoop', 1), ('Sprout_JoyJump', 16)]:
        activate(clip, frame)
        output = os.path.join(BASE, 'proofs', 'sprout-v008-' + clip.removeprefix('Sprout_').lower() + '-' + str(frame) + '.png')
        assert not os.path.exists(output), 'Retain existing evidence.'
        scene.render.filepath = output
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(output)
        occupied = [i for i, a in enumerate(list(image.pixels)[3::4]) if a > .01]
        box = {'min': [min(i%320 for i in occupied), min(i//320 for i in occupied)],
               'max': [max(i%320 for i in occupied), max(i//320 for i in occupied)]}
        assert all(box['min'][a] > 0 and box['max'][a] < 319 for a in (0, 1))
        renders.append({'clip': clip, 'frame': frame, 'path': output, 'sha256': sha(output), 'alpha_bounds': box})
        bpy.data.images.remove(image)

report = {'pass': True, 'source': manifest['editable_source'], 'source_sha256': manifest['editable_source_sha256'],
          'asset_sha256': manifest['sha256'], 'source_reopened': True,
          'speak_frames_checked': 145, 'loop_seam_max_error': seam_error,
          'fixed_root_and_feet': True, 'paired_core_shell_morphs': True,
          'all_mesh_bounds_blender': union, 'core_containment_keyposes': keyposes,
          'retained_happy_eye_samples': eye_checks, 'images': renders,
          'original_source_lighting_transforms_and_values_verified': True,
          'scope': 'Actual reopened source and Cycles frames, no pixels fabricated. Source approximation, not exact browser/native rendering or continuous collision proof.'}
report_path = os.path.join(BASE, 'proofs', 'v008-source-' + MODE + '.json')
json.dump(report, open(report_path, 'w', encoding='utf8'), indent=2)
assert sha(bpy.data.filepath) == manifest['editable_source_sha256']
print(json.dumps({'pass': True, 'report': report_path, 'renders': len(renders), 'bounds': union,
                  'minimum_core_clearance': min(row['minimum_core_clearance'] for row in keyposes)}))
