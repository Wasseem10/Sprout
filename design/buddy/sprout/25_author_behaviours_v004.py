"""Author original joy/rest/wake/Done clips in an isolated owned v003 copy.

Exports a complete source replay, then packages only its five new animation
streams into the frozen v003 binary. Geometry/material/bind pose and six old
animation streams stay byte-identical. No public promotion or live mutation.
"""
import bpy
import copy
import hashlib
import json
import math
import os
import struct
import sys
from mathutils.bvhtree import BVHTree

BASE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(BASE, 'source', 'sprout-clear-prism-rim-matched-v003.blend')
EDITABLE = os.path.join(BASE, 'source', 'sprout-prism-behaviours-v004.blend')
TRIAL = os.path.join(BASE, 'sprout-prism-behaviours-source-v004.glb')
OUTPUT = os.path.join(BASE, 'sprout-prism-v004.glb')
MANIFEST = OUTPUT.replace('.glb', '.manifest.json')
assert os.path.realpath(bpy.data.filepath) == os.path.realpath(SOURCE)
if any(os.path.exists(p) for p in (EDITABLE, TRIAL, OUTPUT, MANIFEST)):
    assert '--replace-owned-candidate' in sys.argv, 'Use an unused checkpoint or explicitly replace this unpromoted owned candidate.'
    with open(MANIFEST, encoding='utf8') as handle:
        owned = json.load(handle)
    assert owned['status'].startswith('Candidate') and owned['path'] == OUTPUT
    assert hashlib.sha256(open(OUTPUT, 'rb').read()).hexdigest() == owned['sha256']
source_hash = hashlib.sha256(open(SOURCE, 'rb').read()).hexdigest()
with open(os.path.join(BASE, 'sprout-prism-v003.manifest.json'), encoding='utf8') as handle:
    previous = json.load(handle)
assert source_hash == previous['editable_source_sha256']
scene = next(s for s in bpy.data.scenes if s.name.startswith('INSIGHTOS_Sprout_v003'))
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v004_behaviours'
rig = bpy.data.objects['RIG_Sprout']
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects['SPROUT_CORE']
reaction = bpy.data.objects['REACTION_ROOT']
lids = [bpy.data.objects['LID_' + side] for side in ('L', 'R')]
keys = [body.data.shape_keys, core.data.shape_keys]
owners = [rig, *keys, reaction, *lids]
FPS = scene.render.fps
assert FPS == 24 and len(rig.pose.bones) == 9

def activate(clips, frame=1):
    for owner in owners:
        if owner.animation_data:
            owner.animation_data.action = None
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name not in clips
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for lid in lids:
        lid.scale = (.003, .004, .001)
    scene.frame_set(frame)
    bpy.context.view_layer.update()

activate(['Sprout_Idle'])
neutral = {bone.name: {prop: tuple(getattr(bone, prop)) for prop in ('location', 'rotation_euler', 'scale')} for bone in rig.pose.bones}
neutral_morph = [key.value for key in list(keys[0].key_blocks)[1:]]
old_actions = sorted({strip.action.name for owner in owners if owner.animation_data for track in owner.animation_data.nla_tracks for strip in track.strips})

def smooth(t):
    t = min(1, max(0, t))
    return t*t*(3 - 2*t)

def curve(t, points):
    if t <= points[0][0]:
        return points[0][1]
    for (a, av), (b, bv) in zip(points, points[1:]):
        if t <= b:
            return av + (bv - av) * smooth((t - a)/(b - a))
    return points[-1][1]

def begin(owner):
    owner.animation_data_create()
    owner.animation_data.action = None
    for track in owner.animation_data.nla_tracks:
        track.mute = True

def stash(owner, clip, detail):
    ad = owner.animation_data
    action = ad.action
    assert action is not None
    action.name = clip + '_' + detail + '_v004'
    slot = ad.action_slot
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                if bag.slot_handle != slot.handle:
                    continue
                for fc in bag.fcurves:
                    for point in fc.keyframe_points:
                        point.interpolation = 'LINEAR'
    track = ad.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.action_slot = slot
    strip.blend_type = 'REPLACE'
    strip.extrapolation = 'NOTHING'
    ad.action = None
    track.mute = True

def set_neutral():
    for bone in rig.pose.bones:
        for prop in ('location', 'rotation_euler', 'scale'):
            setattr(bone, prop, neutral[bone.name][prop])
    for shape_keys in keys:
        for key, value in zip(list(shape_keys.key_blocks)[1:], neutral_morph):
            key.value = value

def sleeping(amount, breath=0):
    set_neutral()
    b = rig.pose.bones['BODY']
    b.rotation_euler.x = -.91 * amount
    # Bone-local Y is Blender +Z; local Z points toward the face (-Y).
    b.location.y = -.13 * amount
    b.location.z = -.06 * amount
    b.scale = (1 + .09 * amount + .006 * breath,
               1 - .18 * amount + .005 * breath,
               1 - .025 * amount + .004 * breath)
    # Keep closed-eye creases facing the camera while the jelly reclines.
    # Thin original lids remain; no eye/glint/gaze owner is added.
    rig.pose.bones['FACE_MOUNT'].rotation_euler.x = .55 * amount
    for side, sign in (('L', -1), ('R', 1)):
        foot = rig.pose.bones['FOOT_' + side]
        foot.rotation_euler.x = -.95 * amount
        # Foot-local Y points downward, local Z is Blender +Y.
        foot.location.y = .12 * amount
        foot.location.z = -.12 * amount
        foot.rotation_euler.z += sign * .07 * amount
        rig.pose.bones['BUD_' + side + '_BASE'].rotation_euler.x = -.11 * amount + .007 * breath
        rig.pose.bones['BUD_' + side + '_TIP'].rotation_euler.x = -.10 * amount + .009 * breath
    for shape_keys in keys:
        shape_keys.key_blocks['Jelly_Squash'].value = neutral_morph[0] + .21 * amount + .025 * breath
    close = smooth(min(1, amount * 1.8))
    for lid in lids:
        lid.scale = (.003 + .997*close, .004 + .996*close, .001 + .999*close)

def joy(t):
    set_neutral()
    height = curve(t, [(0, 0), (.18, 0), (.32, .21), (.55, .56), (.69, .58), (1.00, 0), (1.18, .065), (1.40, 0), (40/24, 0)])
    squash = curve(t, [(0, 0), (.18, 1), (.32, -.42), (.55, -.12), (.72, -.06), (1.00, 1.15), (1.18, -.14), (1.40, .10), (40/24, 0)])
    rig.pose.bones['ROOT'].location.y += height
    b = rig.pose.bones['BODY']
    b.scale = (1 + .11*squash, 1 - .14*squash, 1 + .045*squash)
    b.location.y -= .065*squash
    b.rotation_euler.x += curve(t, [(0, 0), (.18, .05), (.38, -.045), (.70, -.035), (1.0, .025), (1.4, 0), (40/24, 0)])
    airborne = curve(t, [(0, 0), (.18, 0), (.35, 1), (.8, .8), (1.0, 0), (40/24, 0)])
    for side, sign in (('L', -1), ('R', 1)):
        rig.pose.bones['FOOT_' + side].rotation_euler.x = -.13*airborne
        rig.pose.bones['BUD_' + side + '_BASE'].rotation_euler.x = curve(t, [(0, 0), (.18, .06), (.36, -.12), (.7, .07), (1.06, -.065), (1.4, .014), (40/24, 0)])
        rig.pose.bones['BUD_' + side + '_TIP'].rotation_euler.x = curve(t, [(0, 0), (.25, .09), (.46, -.16), (.82, .045), (1.15, -.07), (1.45, .008), (40/24, 0)])
    for shape_keys in keys:
        shape_keys.key_blocks['Jelly_Squash'].value = neutral_morph[0] + max(0, squash)*.35

clips = {
    'Sprout_JoyJump': {'frames': 41, 'group': 'full-body', 'beats': {'anticipation': .18, 'apex': .625, 'landing': 1.0, 'settled': 40/24}},
    'Sprout_SleepEnter': {'frames': 41, 'group': 'sleep', 'beats': {'eyes_closed': .9, 'reclined': 40/24}},
    'Sprout_SleepLoop': {'frames': 121, 'group': 'sleep', 'beats': {'breath_peak': 1.25, 'loop': 5}},
    'Sprout_Wake': {'frames': 31, 'group': 'sleep', 'beats': {'eyes_open': .95, 'upright': 1.25}},
    'Sprout_Done': {'frames': 21, 'group': 'reaction', 'beats': {'nod': .20, 'proud_hold': .43, 'settled': 20/24}},
}
for clip, spec in clips.items():
    target_owners = [reaction] if spec['group'] == 'reaction' else [rig, *keys, *(lids if spec['group'] == 'sleep' else [])]
    for owner in target_owners:
        begin(owner)
    for frame in range(1, spec['frames'] + 1):
        t = (frame - 1) / FPS
        if clip == 'Sprout_Done':
            nod = curve(t, [(0, 0), (.20, .052), (.36, -.018), (.49, -.018), (.68, .006), (20/24, 0)])
            pride = curve(t, [(0, 0), (.20, -.005), (.36, .010), (.49, .010), (.68, -.003), (20/24, 0)])
            reaction.rotation_euler = (nod, 0, 0)
            reaction.scale = (1 - pride*.25, 1 - pride*.15, 1 + pride)
            for prop in ('rotation_euler', 'scale'):
                reaction.keyframe_insert(data_path=prop, frame=frame)
            continue
        if clip == 'Sprout_JoyJump':
            joy(t)
        elif clip == 'Sprout_SleepEnter':
            sleeping(smooth(t / (40/24)))
        elif clip == 'Sprout_SleepLoop':
            sleeping(1, math.sin(2*math.pi*t/5))
        else:
            sleeping(1 - smooth(t / 1.25))
        for bone in rig.pose.bones:
            for prop in ('location', 'rotation_euler', 'scale'):
                bone.keyframe_insert(data_path=prop, frame=frame, group=bone.name)
        for shape_keys in keys:
            for key in list(shape_keys.key_blocks)[1:]:
                key.keyframe_insert(data_path='value', frame=frame)
        if spec['group'] == 'sleep':
            for lid in lids:
                lid.keyframe_insert(data_path='scale', frame=frame)
    for owner in target_owners:
        stash(owner, clip, 'Rig' if owner == rig else 'Reaction' if owner == reaction else owner.name)

def evaluated(ob):
    item = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = item.to_mesh()
    points = [item.matrix_world @ vertex.co for vertex in mesh.vertices]
    faces = [tuple(face.vertices) for face in mesh.polygons]
    item.to_mesh_clear()
    return points, faces

def bounds(points):
    # Runtime glTF basis +Yup/+Zfront, not Blender authoring coordinates.
    points = [(p.x, p.z, -p.y) for p in points]
    return {'min': [min(p[a] for p in points) for a in range(3)],
            'max': [max(p[a] for p in points) for a in range(3)]}

pose_samples = []
for clip, spec in clips.items():
    spec['duration'] = (spec['frames'] - 1)/FPS
    sample_frames = sorted(set([1, spec['frames'], *(round(t*FPS)+1 for t in spec['beats'].values()), *range(1, spec['frames']+1, 3)]))
    spec['bounds'] = {'min': [float('inf')]*3, 'max': [float('-inf')]*3}
    for frame in sample_frames:
        activate(['Sprout_Idle', clip] if clip == 'Sprout_Done' else [clip], frame)
        points, faces = evaluated(body)
        box = bounds(points)
        for a in range(3):
            spec['bounds']['min'][a] = min(spec['bounds']['min'][a], box['min'][a])
            spec['bounds']['max'][a] = max(spec['bounds']['max'][a], box['max'][a])
        row = {'clip': clip, 'time': (frame-1)/FPS, 'bounds_gltf': box,
               'face_anchor_gltf': [bpy.data.objects['FACE_ANCHOR'].matrix_world.translation.x,
                                    bpy.data.objects['FACE_ANCHOR'].matrix_world.translation.z,
                                   -bpy.data.objects['FACE_ANCHOR'].matrix_world.translation.y],
               'foot_tips_gltf': {side: [rig.pose.bones['FOOT_'+side].tail.x, rig.pose.bones['FOOT_'+side].tail.z, -rig.pose.bones['FOOT_'+side].tail.y] for side in ('L', 'R')},
               'lids_scale': {lid.name: list(lid.scale) for lid in lids}}
        if frame in (1, spec['frames']) or frame in [round(t*FPS)+1 for t in spec['beats'].values()]:
            core_points, _ = evaluated(core)
            tree = BVHTree.FromPolygons(points, faces)
            nearest = [tree.find_nearest(p) for p in core_points]
            signed = [(p-hit[0]).dot(hit[1]) for p, hit in zip(core_points, nearest)]
            row['containment'] = {'outside_vertices': sum(value >= -1e-5 for value in signed),
                                  'min_clearance': min(hit[3] for hit in nearest), 'max_signed_distance': max(signed)}
        pose_samples.append(row)
    spec['bounds_sample_count'] = len(sample_frames)
sleep_hold = next(row for row in pose_samples if row['clip'] == 'Sprout_SleepLoop' and row['time'] == 0)

activate(['Sprout_Idle'])
scene.frame_start = 1
scene.frame_end = 145
for ob in bpy.context.selected_objects:
    ob.select_set(False)
for ob in bpy.data.collections['SPROUT_MODEL'].objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
settings = dict(previous['settings'], filepath=TRIAL)
settings['export_optimize_animation_keep_anim_object'] = True
assert all(key in bpy.ops.export_scene.gltf.get_rna_type().properties for key in settings)
bpy.ops.export_scene.gltf(**settings)

def read_glb(path):
    data = open(path, 'rb').read()
    length, kind = struct.unpack_from('<II', data, 12)
    assert data[:4] == b'glTF' and kind == 0x4e4f534a
    return data, json.loads(data[20:20+length]), data[28+length:]

before_data, before, before_binary = read_glb(previous['path'])
assert hashlib.sha256(before_data).hexdigest() == previous['sha256']
trial_data, trial, trial_binary = read_glb(TRIAL)
assert set(c['name'] for c in trial['animations']) == set(c['name'] for c in before['animations']) | set(clips)
# Preserve the frozen material/bind/geometry/rest/old clips. Copy each new
# sampler accessor with its source-export buffer view, and remap semantic nodes.
doc, payload = copy.deepcopy(before), bytearray(before_binary)
nodes = {node['name']: i for i, node in enumerate(doc['nodes'])}
accessor_map = {}
view_map = {}
def append_accessor(index):
    if index in accessor_map:
        return accessor_map[index]
    accessor = copy.deepcopy(trial['accessors'][index])
    assert 'sparse' not in accessor
    view_index = accessor['bufferView']
    if view_index not in view_map:
        source_view = trial['bufferViews'][view_index]
        view = copy.deepcopy(source_view)
        start = source_view.get('byteOffset', 0)
        payload.extend(b'\x00' * (-len(payload) % 4))
        view['byteOffset'] = len(payload)
        view['buffer'] = 0
        payload.extend(trial_binary[start:start+source_view['byteLength']])
        view_map[view_index] = len(doc['bufferViews'])
        doc['bufferViews'].append(view)
    accessor['bufferView'] = view_map[view_index]
    accessor_map[index] = len(doc['accessors'])
    doc['accessors'].append(accessor)
    return accessor_map[index]

for animation in trial['animations']:
    name = animation['name']
    if name not in clips:
        continue
    item = copy.deepcopy(animation)
    retained = []
    discarded = []
    for channel in item['channels']:
        name_target = trial['nodes'][channel['target']['node']]['name']
        path_target = channel['target']['path']
        full_body = clips[name]['group'] != 'reaction'
        permitted = ((name_target in neutral and path_target in ('translation', 'rotation', 'scale'))
                     or (name_target in ('SPROUT_BODY', 'SPROUT_CORE') and path_target == 'weights')) if full_body else (name_target == 'REACTION_ROOT' and path_target in ('rotation', 'scale'))
        permitted |= clips[name]['group'] == 'sleep' and name_target in ('LID_L', 'LID_R') and path_target == 'scale'
        if not permitted:
            # Keep-object-constant emits unkeyed TRS. Explicit build filter,
            # never a runtime filter: reject anything besides those known
            # exporter-generated constant properties or any varying samples.
            assert (name_target == 'RIG_Sprout' and path_target in ('translation', 'rotation', 'scale')) or (name_target in ('LID_L', 'LID_R') and path_target in ('translation', 'rotation')) or (name_target == 'REACTION_ROOT' and path_target == 'translation')
            accessor = trial['accessors'][item['samplers'][channel['sampler']]['output']]
            view = trial['bufferViews'][accessor['bufferView']]
            width = {'VEC3': 3, 'VEC4': 4}[accessor['type']]
            start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            values = struct.unpack_from('<' + 'f'*(accessor['count']*width), trial_binary, start)
            spread = max(abs(values[index] - values[index % width]) for index in range(len(values)))
            assert spread < 1e-6, 'Unapproved varying exporter channel cannot be removed.'
            discarded.append({'node': name_target, 'path': path_target, 'sample_count': accessor['count'], 'maximum_sample_spread': spread, 'constant': list(values[:width])})
            continue
        channel['target']['node'] = nodes[name_target]
        retained.append(channel)
    used_samplers = sorted({c['sampler'] for c in retained})
    sampler_remap = {old: new for new, old in enumerate(used_samplers)}
    item['channels'] = retained
    item['samplers'] = [item['samplers'][index] for index in used_samplers]
    for channel in retained:
        channel['sampler'] = sampler_remap[channel['sampler']]
    for sampler in item['samplers']:
        sampler['input'] = append_accessor(sampler['input'])
        sampler['output'] = append_accessor(sampler['output'])
    doc['animations'].append(item)
    clips[name]['channels'] = [{'node': doc['nodes'][channel['target']['node']]['name'], 'path': channel['target']['path']} for channel in item['channels']]
    clips[name]['packaging_removed_generated_constant_channels'] = discarded
payload.extend(b'\x00' * (-len(payload) % 4))
doc['buffers'][0]['byteLength'] = len(payload)
json_bytes = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
json_bytes += b' ' * (-len(json_bytes) % 4)
data = struct.pack('<III', 0x46546c67, 2, 28+len(json_bytes)+len(payload))
data += struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes
data += struct.pack('<II', len(payload), 0x004e4942) + bytes(payload)
with open(OUTPUT, 'wb') as handle:
    handle.write(data)
assert bytes(payload[:len(before_binary)]) == before_binary
assert doc['nodes'] == before['nodes'] and doc['skins'] == before['skins']
assert doc['meshes'] == before['meshes'] and doc['materials'] == before['materials']
assert doc['animations'][:6] == before['animations']
assert all(row.get('containment', {}).get('outside_vertices', 0) == 0 for row in pose_samples), 'Inspect exported core clearance before acceptance.'
activate(['Sprout_Idle'])
bpy.ops.wm.save_as_mainfile(filepath=EDITABLE, copy=True)
manifest = {'variant': 'prism-behaviours-v004', 'status': 'Candidate, not promoted; runtime/visual acceptance pending',
            'path': OUTPUT, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
            'editable_source': EDITABLE, 'editable_source_sha256': hashlib.sha256(open(EDITABLE, 'rb').read()).hexdigest(),
            'immutable_source': SOURCE, 'immutable_source_sha256': source_hash,
            'frozen_v003_path': previous['path'], 'frozen_v003_sha256': previous['sha256'],
            'source_export': TRIAL, 'source_export_sha256': hashlib.sha256(trial_data).hexdigest(),
            'blender': bpy.app.version_string, 'generator': trial['asset']['generator'], 'settings': settings,
            'fps': FPS, 'new_clips': clips, 'retained_clips': [c['name'] for c in before['animations']],
            'sleeping_hold': sleep_hold, 'pose_samples': pose_samples,
            'ownership': {'full_body': ['nine rig bones TRS', 'SPROUT_BODY complete3 morph vector', 'SPROUT_CORE complete3 morph vector'],
                          'sleep_additional': ['LID_L scale', 'LID_R scale'], 'joy_lids': 'Unchanged/unowned',
                          'Done': ['REACTION_ROOT rotation', 'REACTION_ROOT scale'],
                          'reaction_root': 'Exclusive serialized Click/Done; no tracks in joy/rest/wake'},
            'byte_contract': {'original_binary_prefix_exact': True, 'nodes_skins_geometry_materials_images_exact': True,
                              'six_old_animation_streams_exact': True, 'new_clips_from_Blender_export_only': True},
            'packaging': 'Append5 source-exported animation streams to frozen v003 with semantic node remap. Explicitly remove only manifest-listed unkeyed/generated constant object TRS after checking maximum sample spread<1e-6. Keep all authored channels, complete paired weights and sleeping constant lid scales. Full source-export GLB retained. No application-side filtering/motion reconstruction.',
            'materials': before['materials'], 'extensions': before['extensionsUsed'], 'texture': previous['texture'],
            'source_licences': 'Original project-authored mesh/rig/morphs/animations/texture; no new third-party character or animation assets.',
            'limits': ['Source nearest-normal sampled containment is not exhaustive collision proof.', 'Bounds sampled each3frames plus all authored beats, not analytic extrema.', 'Native stage/Z bounds and actual mixed interruption acceptance belong to integration.']}
with open(MANIFEST, 'w', encoding='utf8') as handle:
    json.dump(manifest, handle, indent=2)
assert hashlib.sha256(open(SOURCE, 'rb').read()).hexdigest() == source_hash
print(json.dumps({'asset': OUTPUT, 'sha256': manifest['sha256'], 'bytes': len(data),
                  'source': EDITABLE, 'source_sha256': manifest['editable_source_sha256'],
                  'new_clips': {name: {'duration': spec['duration'], 'channels': len(spec['channels']), 'bounds': spec['bounds']} for name, spec in clips.items()},
                  'minimum_source_core_clearance': min(row['containment']['min_clearance'] for row in pose_samples if 'containment' in row)}))
