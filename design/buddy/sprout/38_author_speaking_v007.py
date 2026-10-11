"""Author the planted explaining loop in an isolated Daylight source.

Run Blender --background --factory-startup source/sprout-daylight-v006.blend
--python this_file -- inspect|author. Nothing touches the live Blender scene.
Only source-authored Speak accessor streams are grafted into frozen v006.
"""
import bpy
import copy
import hashlib
import json
import math
import os
import shutil
import struct
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.realpath(os.path.join(BASE, '../../../public/buddy'))
MODE = sys.argv[sys.argv.index('--') + 1]
assert MODE in ('inspect', 'author')
SOURCE = os.path.join(BASE, 'source', 'sprout-daylight-v006.blend')
EDITABLE = os.path.join(BASE, 'source', 'sprout-speaking-v007.blend')
TRIAL = os.path.join(BASE, 'sprout-speaking-source-v007.glb')
OUTPUT = os.path.join(BASE, 'sprout-speaking-v007.glb')
MANIFEST = OUTPUT.replace('.glb', '.manifest.json')
sha = lambda path: hashlib.sha256(open(path, 'rb').read()).hexdigest()
previous = json.load(open(os.path.join(BASE, 'sprout-daylight-v006.manifest.json'), encoding='utf8'))
assert os.path.realpath(bpy.data.filepath) == os.path.realpath(SOURCE)
assert sha(SOURCE) == previous['editable_source_sha256']
scene = bpy.data.scenes['INSIGHTOS_Sprout_v006_daylight']
bpy.context.window.scene = scene
rig = bpy.data.objects['RIG_Sprout']
body, core = [bpy.data.objects[n] for n in ('SPROUT_BODY', 'SPROUT_CORE')]
keys = [ob.data.shape_keys for ob in (body, core)]
owners = [rig, *keys]
assert scene.render.fps == 24 and len(rig.pose.bones) == 9

def inventory():
    return {'blender': bpy.app.version_string, 'source': SOURCE, 'source_sha256': sha(SOURCE),
            'scene': scene.name, 'objects': len(scene.objects),
            'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None,
                       'matrix_local': [list(row) for row in b.bone.matrix_local]} for b in rig.pose.bones],
            'tracks': {o.name: [{'name': t.name, 'action': t.strips[0].action.name,
                                 'range': [t.strips[0].frame_start, t.strips[0].frame_end]}
                                for t in o.animation_data.nla_tracks] for o in owners}}

if MODE == 'inspect':
    print(json.dumps(inventory()))
    raise SystemExit(0)

if any(os.path.exists(p) for p in (EDITABLE, TRIAL, OUTPUT, MANIFEST)):
    assert '--retry-incomplete-export' in sys.argv and not os.path.exists(OUTPUT) and not os.path.exists(MANIFEST), 'Use a fresh version.'
preserved = {}
for version, stem in (('v005', 'sprout-prism'), ('v006', 'sprout-daylight')):
    baseline = json.load(open(os.path.join(BASE, stem + '-' + version + '.manifest.json'), encoding='utf8'))
    for p in (baseline['path'], baseline['source_export'], baseline['editable_source']):
        preserved[p] = sha(p)
    for extension in ('.glb', '.png', '-sleep.png'):
        p = os.path.join(PUBLIC, 'sprout-' + version + extension)
        preserved[p] = sha(p)
assert preserved[os.path.join(PUBLIC, 'sprout-v005.glb')] == '5090645ccbc11f1f577ca22373234a2f3f1d4409ba30876fdecc3af5041faeb2'
assert preserved[os.path.join(PUBLIC, 'sprout-v006.glb')] == 'b8de0b88395e4b876f0eb668a0a7f39317c24d3530c9d15e58a01c7aa561824f'
before = inventory()
scene.name = 'INSIGHTOS_Sprout_v007_speaking'

def set_enum(owner, name, value):
    choices = [item.identifier for item in owner.bl_rna.properties[name].enum_items]
    assert value in choices, (name, value, choices)
    setattr(owner, name, value)

for owner in owners:
    ad = owner.animation_data
    ad.action = None
    ad.use_nla = False
    for track in list(ad.nla_tracks):
        if track.name == 'Sprout_Speak':
            ad.nla_tracks.remove(track)
        else:
            track.mute = True

def gesture(t, start, peak, end):
    """A phrase, with ease-in/out and genuine held rest between gestures."""
    if t <= start or t >= end:
        return 0.0
    u = (t-start)/(peak-start) if t <= peak else (end-t)/(end-peak)
    return u*u*(3-2*u)

for frame in range(1, 146):
    t = (frame-1)/24
    breath = .5-.5*math.cos(2*math.pi*t/6)
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    torso = rig.pose.bones['BODY']
    # Feet are children of ROOT, not BODY. The root and foot tracks stay fixed.
    # Local Y is vertical: an engaged, slow chest expansion without bouncing.
    torso.rotation_euler.x = .018
    torso.scale = (1+.006*breath, 1+.011*breath, 1+.004*breath)
    for side, sign, timing in [('L', -1, (.35, 1.05, 2.30)), ('R', 1, (2.50, 3.35, 4.65))]:
        phrase = gesture(t, *timing)
        follow = gesture(t-.13, *timing)
        closing = gesture(t, 4.85, 5.20, 5.72)
        base = rig.pose.bones['BUD_' + side + '_BASE']
        tip = rig.pose.bones['BUD_' + side + '_TIP']
        base.rotation_euler = (.04*phrase, sign*.035*phrase,
                               sign*(.045+.24*phrase+.045*closing))
        tip.rotation_euler = (-.055*follow, sign*.025*follow,
                              -sign*(.015+.13*follow+.025*closing))
    for bone in rig.pose.bones:
        for prop in ('location', 'rotation_euler', 'scale'):
            bone.keyframe_insert(data_path=prop, frame=frame, group=bone.name)
    for shape_keys in keys:
        shape_keys.key_blocks['Jelly_Squash'].value = .035+.020*breath
        shape_keys.key_blocks['Jelly_Sway_L'].value = .035
        shape_keys.key_blocks['Jelly_Sway_R'].value = .035
        for key in list(shape_keys.key_blocks)[1:]:
            key.keyframe_insert(data_path='value', frame=frame)

for owner in owners:
    ad = owner.animation_data
    action, slot = ad.action, ad.action_slot
    assert action is not None
    action.name = 'Sprout_Speak_' + ('Rig' if owner == rig else owner.name) + '_v007'
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                if bag.slot_handle == slot.handle:
                    for fc in bag.fcurves:
                        for point in fc.keyframe_points:
                            set_enum(point, 'interpolation', 'LINEAR')
    track = ad.nla_tracks.new()
    track.name = 'Sprout_Speak'
    strip = track.strips.new('Sprout_Speak', 1, action)
    strip.action_slot = slot
    set_enum(strip, 'blend_type', 'REPLACE')
    set_enum(strip, 'extrapolation', 'NOTHING')
    ad.action = None
    ad.use_nla = True
    for track in ad.nla_tracks:
        track.mute = track.name != 'Sprout_Idle'

scene.frame_set(1)
bpy.context.view_layer.update()
for obj in bpy.context.selected_objects:
    obj.select_set(False)
for obj in bpy.data.collections['SPROUT_MODEL'].objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=EDITABLE)
bpy.ops.wm.open_mainfile(filepath=EDITABLE)
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2
settings = dict(previous['settings'], filepath=TRIAL)
assert all(k in bpy.ops.export_scene.gltf.get_rna_type().properties for k in settings)
assert settings['export_format'] in [item[0] for item in io_scene_gltf2.get_format_items(bpy.context.scene, bpy.context)]

class EyeTrackDependencyRefresh:
    is_critical = True
    def post_animation_track_switch_hook(self, obj, track, name, kind, export_settings):
        if kind == 'KEY' and obj.name in ('EYE_L', 'EYE_R'):
            ad = obj.data.shape_keys.animation_data
            strip = ad.nla_tracks[track.idx].strips[0]
            ad.action, ad.action_slot, ad.use_nla = strip.action, strip.action_slot, False
            obj.data.shape_keys.update_tag()
            obj.data.update_tag()
            obj.update_tag(refresh={'OBJECT', 'DATA', 'TIME'})
            bpy.context.view_layer.update()
    def animation_track_switch_loop_hook(self, obj, restored, export_settings):
        if restored and obj.name in ('EYE_L', 'EYE_R'):
            obj.data.shape_keys.animation_data.action = None
            obj.data.shape_keys.animation_data.use_nla = True

assert not hasattr(io_scene_gltf2, 'glTF2ExportUserExtension')
io_scene_gltf2.glTF2ExportUserExtension = EyeTrackDependencyRefresh
try:
    bpy.ops.export_scene.gltf(**settings)
finally:
    del io_scene_gltf2.glTF2ExportUserExtension

def glb(path):
    data = open(path, 'rb').read()
    length, kind = struct.unpack_from('<II', data, 12)
    assert data[:4] == b'glTF' and kind == 0x4e4f534a
    return json.loads(data[20:20+length]), data[28+length:]

def accessor_bytes(doc, payload, index):
    acc = doc['accessors'][index]
    assert 'sparse' not in acc
    view = doc['bufferViews'][acc['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[acc['type']]
    size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[acc['componentType']] * width
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride', size)
    return b''.join(payload[start+i*stride:start+i*stride+size] for i in range(acc['count']))

old, old_binary = glb(previous['path'])
trial, trial_binary = glb(TRIAL)
doc, binary = copy.deepcopy(old), bytearray(old_binary)
old_speak_index = next(i for i, a in enumerate(old['animations']) if a['name'] == 'Sprout_Speak')
source_speak = next(a for a in trial['animations'] if a['name'] == 'Sprout_Speak')
# Blender also exports three constant object-space armature tracks. They are
# not part of our nine-bone body contract and duplicate the frozen bind pose.
source_speak = copy.deepcopy(source_speak)
omitted = [c for c in source_speak['channels'] if trial['nodes'][c['target']['node']]['name'] == 'RIG_Sprout']
assert len(omitted) == 3
for channel in omitted:
    sampler = source_speak['samplers'][channel['sampler']]
    values = accessor_bytes(trial, trial_binary, sampler['output'])
    acc = trial['accessors'][sampler['output']]
    assert acc['count'] == 2 and values[:len(values)//2] == values[len(values)//2:]
source_speak['channels'] = [c for c in source_speak['channels'] if c not in omitted]
assert len(source_speak['channels']) == 29
used_samplers = sorted({c['sampler'] for c in source_speak['channels']})
for channel in source_speak['channels']:
    channel['sampler'] = used_samplers.index(channel['sampler'])
source_speak['samplers'] = [source_speak['samplers'][i] for i in used_samplers]
node_names = {n['name']: i for i, n in enumerate(old['nodes'])}
animation = copy.deepcopy(source_speak)
copied = {}
provenance = []

def copy_accessor(index):
    if index in copied:
        return copied[index]
    payload = accessor_bytes(trial, trial_binary, index)
    # Reuse exact baseline streams (notably timestamps/identity TRS) where possible.
    acc = {k: v for k, v in trial['accessors'][index].items() if k not in ('bufferView', 'byteOffset')}
    for candidate, other in enumerate(doc['accessors']):
        if {k: v for k, v in other.items() if k not in ('bufferView', 'byteOffset')} == acc and accessor_bytes(doc, binary, candidate) == payload:
            copied[index] = candidate
            return candidate
    binary.extend(b'\0' * (-len(binary) % 4))
    view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)}
    binary.extend(payload)
    acc['bufferView'] = len(doc['bufferViews'])
    doc['bufferViews'].append(view)
    copied[index] = len(doc['accessors'])
    doc['accessors'].append(acc)
    provenance.append({'source_accessor': index, 'runtime_accessor': copied[index],
                       'sha256': hashlib.sha256(payload).hexdigest()})
    return copied[index]

for sampler in animation['samplers']:
    sampler['input'] = copy_accessor(sampler['input'])
    sampler['output'] = copy_accessor(sampler['output'])
for channel in animation['channels']:
    name = trial['nodes'][channel['target']['node']]['name']
    assert name not in ('REACTION_ROOT', 'EYE_L', 'EYE_R', 'GLINT_L', 'GLINT_R')
    channel['target']['node'] = node_names[name]
doc['animations'][old_speak_index] = animation
binary.extend(b'\0' * (-len(binary) % 4))
doc['buffers'][0]['byteLength'] = len(binary)
json_bytes = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
json_bytes += b' ' * (-len(json_bytes) % 4)
data = struct.pack('<III', 0x46546c67, 2, 28+len(json_bytes)+len(binary))
data += struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes
data += struct.pack('<II', len(binary), 0x004e4942) + binary
open(OUTPUT, 'wb').write(data)
for field in ('nodes', 'skins', 'meshes', 'materials', 'images', 'textures', 'samplers'):
    assert doc.get(field) == old.get(field), field
assert binary[:len(old_binary)] == old_binary
for i, original in enumerate(old['animations']):
    if i != old_speak_index:
        assert doc['animations'][i] == original
assert all(sha(path) == digest for path, digest in preserved.items())
shutil.copyfile(OUTPUT, os.path.join(PUBLIC, 'sprout-v007.glb'))
# Idle/sleep poses, materials and cameras are exact. Preserve the approved actual
# Cycles pixels instead of adding sampling noise by re-rendering the same poses.
fallbacks = []
for old_name, new_name, public_name in (
    ('sprout-daylight-v006.png', 'sprout-speaking-v007.png', 'sprout-v007.png'),
    ('sprout-daylight-sleep-v006.png', 'sprout-speaking-sleep-v007.png', 'sprout-v007-sleep.png')):
    src, dst = os.path.join(BASE, old_name), os.path.join(BASE, new_name)
    shutil.copyfile(src, dst)
    shutil.copyfile(src, os.path.join(PUBLIC, public_name))
    fallbacks.append({'path': dst, 'public': os.path.join(PUBLIC, public_name),
                      'inherited_from': src, 'sha256': sha(src),
                      'reason': 'Exact same source idle/sleep actions, meshes, materials and approved Daylight lighting.'})
report = {'variant': 'speaking-v007', 'status': 'Authored; source/GLB visual verification pending',
          'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(data),
          'editable_source': EDITABLE, 'editable_source_sha256': sha(EDITABLE),
          'source_export': TRIAL, 'source_export_sha256': sha(TRIAL),
          'baseline_path': previous['path'], 'baseline_sha256': sha(previous['path']),
          'baseline_source_export': previous['source_export'],
          'blender': bpy.app.version_string, 'settings': settings,
          'profile': 'happy-morph-v005', 'appearance_profile': 'daylight',
          'authoring': {'clip': 'Sprout_Speak', 'duration_seconds': 6, 'fps': 24,
                        'channels': 29, 'source_frames': 145,
                        'identity': 'Planted explaining; alternating bud phrases with 130ms tip follow-through; slow chest expansion.',
                        'foot_and_root_trs_constant': True,
                        'eye_reaction_or_gaze_channels_added': False,
                        'new_mouth_or_phoneme_sync': False},
          'source_lighting': previous['source_lighting'], 'materials': doc['materials'],
          'eye_clips': previous['eye_clips'], 'removed_rendered_objects': previous['removed_rendered_objects'],
          'baseline_source_inspection': before, 'new_accessor_provenance': provenance,
          'preservation': {'pass': True, 'previous_file_hashes': preserved,
                           'exception': 'Only Sprout_Speak animation dictionary and its source-authored animation accessors are new.',
                           'all_original_binary_bytes_exact': True,
                           'geometry_materials_hierarchy_skins_exact': True,
                           'all_ten_non_speak_animations_exact': True},
          'fallbacks': fallbacks,
          'scope': 'Versioned Blender animation asset. Original v005/v006 and live Blender untouched. Runtime integration verified separately.'}
json.dump(report, open(MANIFEST, 'w', encoding='utf8'), indent=2)
print(json.dumps({'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(data), 'source': EDITABLE,
                  'new_accessors': len(provenance), 'preservation_pass': True}))
