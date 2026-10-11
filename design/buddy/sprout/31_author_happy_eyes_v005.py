"""Original eye morphs in an isolated, versioned copy of the frozen v004 source.

Run background Blender on SOURCE with --factory-startup. No live/public mutation.
The runtime package retains the old non-eye accessor bytes, replaces four
eye-related clips, removes obsolete rendered lids and compacts unreachable data.
"""
import bpy
import copy
import hashlib
import json
import math
import os
import struct
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(BASE, 'source', 'sprout-prism-behaviours-v004.blend')
EDITABLE = os.path.join(BASE, 'source', 'sprout-happy-eyes-v005.blend')
TRIAL = os.path.join(BASE, 'sprout-happy-eyes-source-v005.glb')
OUTPUT = os.path.join(BASE, 'sprout-prism-v005.glb')
MANIFEST = OUTPUT.replace('.glb', '.manifest.json')
assert os.path.realpath(bpy.data.filepath) == os.path.realpath(SOURCE)
previous = json.load(open(os.path.join(BASE, 'sprout-prism-v004.manifest.json'), encoding='utf8'))
sha = lambda path: hashlib.sha256(open(path, 'rb').read()).hexdigest()
assert sha(SOURCE) == previous['editable_source_sha256']
assert sha(previous['path']) == previous['sha256']
if any(os.path.exists(p) for p in (EDITABLE, TRIAL, OUTPUT, MANIFEST)):
    assert '--replace-owned-candidate' in sys.argv, 'Use an unused version or explicitly replace this owned candidate.'
    owned = json.load(open(MANIFEST, encoding='utf8'))
    assert owned['status'].startswith('Candidate') and owned['path'] == OUTPUT
    assert sha(OUTPUT) == owned['sha256']

scene = bpy.data.scenes['INSIGHTOS_Sprout_v004_behaviours']
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v005_eyes'
rig = bpy.data.objects['RIG_Sprout']
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects['SPROUT_CORE']
reaction = bpy.data.objects['REACTION_ROOT']
lids = [bpy.data.objects['LID_' + side] for side in ('L', 'R')]
eyes = [bpy.data.objects['EYE_' + side] for side in ('L', 'R')]
glints = [bpy.data.objects['GLINT_' + side] for side in ('L', 'R')]
old_owners = [rig, body.data.shape_keys, core.data.shape_keys, reaction, *lids]
FPS = scene.render.fps
assert FPS == 24 and len(rig.pose.bones) == 9
EYE_CLIPS = {'Sprout_Blink': 5, 'Sprout_SleepEnter': 41,
             'Sprout_SleepLoop': 121, 'Sprout_Wake': 31}

def activate_old(clip, frame):
    for owner in old_owners:
        if owner.animation_data:
            owner.animation_data.action = None
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name != clip
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for lid in lids:
        lid.scale = (.003, .004, .001)
    scene.frame_set(frame)
    bpy.context.view_layer.update()

# Sample the actual saved v004 closure; retain its timing and body poses.
closures = {}
for clip, frames in EYE_CLIPS.items():
    closures[clip] = []
    for frame in range(1, frames + 1):
        activate_old(clip, frame)
        left, right = [min(1, max(0, (lid.scale.z - .001) / .999)) for lid in lids]
        assert abs(left - right) < 2e-5
        closures[clip].append((left + right) / 2)
    if clip != 'Sprout_SleepLoop':
        closures[clip][0] = 1.0 if clip == 'Sprout_Wake' else 0.0
        closures[clip][-1] = 0.0 if clip in ('Sprout_Blink', 'Sprout_Wake') else 1.0
    else:
        closures[clip] = [1.0] * frames

activate_old('Sprout_Idle', 1)
eye_geometry = {}
for eye in eyes:
    assert eye.data.shape_keys is None and len(eye.data.vertices) == 534
    basis = eye.shape_key_add(name='Basis', from_mix=False)
    closed = eye.shape_key_add(name='CloseHappy', from_mix=False)
    closed.slider_min = 0
    closed.slider_max = 1
    # Smooth, invertible deformation of the actual oval volume. Positive
    # diagonal scales preserve topology; the quadratic bend supplies a rounded
    # upward arch, with the middle higher than the corners. The depth shift
    # keeps the mark at the old front surface instead of burying it in glass.
    half_width = max(abs(point.co.x) for point in basis.data)
    for original, target in zip(basis.data, closed.data):
        x, y, z = original.co
        u = x / half_width
        target.co = (x * .90, -.063 + y * .17, .065 * (1 - u*u) + z * .11)
    closed.value = 0
    eye_geometry[eye.name] = {
        'vertices': len(basis.data), 'morph_dictionary': {'CloseHappy': 0},
        'formula_blender': {'x_scale': .90, 'front_depth_offset_y': -.063,
                            'depth_scale': .17, 'arch_height_z': .065, 'vertical_scale': .11},
        'open_material': eye.data.materials[0].name,
        'open_bounds': {'min': [min(p.co[a] for p in basis.data) for a in range(3)],
                        'max': [max(p.co[a] for p in basis.data) for a in range(3)]},
        'closed_bounds': {'min': [min(p.co[a] for p in closed.data) for a in range(3)],
                          'max': [max(p.co[a] for p in closed.data) for a in range(3)]},
    }

removed = ['CLOSED_EYE_L', 'CLOSED_EYE_R', 'LID_L', 'LID_R']
for name in removed:
    bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
owners = [rig, body.data.shape_keys, core.data.shape_keys, reaction,
          *[eye.data.shape_keys for eye in eyes], *glints]

def stash(owner, clip, detail):
    ad = owner.animation_data
    action = ad.action
    action.name = clip + '_' + detail + '_v005'
    slot = ad.action_slot
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                if bag.slot_handle == slot.handle:
                    for fc in bag.fcurves:
                        for point in fc.keyframe_points:
                            point.interpolation = 'LINEAR'
    track = ad.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.action_slot = slot
    strip.blend_type = 'REPLACE'
    strip.extrapolation = 'NOTHING'
    strip.influence = 1
    ad.action = None
    track.mute = True
    owner.update_tag()

def glint_factor(close):
    t = max(0, min(1, close / .75))
    smooth = t*t*(3-2*t)
    return 1 - .999 * smooth

for clip, frames in EYE_CLIPS.items():
    for owner in [*[eye.data.shape_keys for eye in eyes], *glints]:
        owner.animation_data_create()
        owner.animation_data.action = None
        for track in owner.animation_data.nla_tracks:
            track.mute = True
    for frame, close in enumerate(closures[clip], 1):
        scene.frame_set(frame)
        for eye in eyes:
            key = eye.data.shape_keys.key_blocks['CloseHappy']
            key.value = close
            key.keyframe_insert(data_path='value', frame=frame)
        for glint in glints:
            glint.scale = (glint_factor(close),) * 3
            glint.keyframe_insert(data_path='scale', frame=frame)
    for eye in eyes:
        stash(eye.data.shape_keys, clip, eye.name)
    for glint in glints:
        stash(glint, clip, glint.name)

for owner in owners:
    if owner.animation_data:
        owner.animation_data.action = None
        for track in owner.animation_data.nla_tracks:
            track.mute = track.name != 'Sprout_Idle'
    owner.update_tag()
for eye in eyes:
    eye.data.shape_keys.key_blocks['CloseHappy'].value = 0
for glint in glints:
    glint.scale = (1, 1, 1)
reaction.location = (0, 0, 0)
reaction.rotation_euler = (0, 0, 0)
reaction.scale = (1, 1, 1)
scene.frame_set(1)
bpy.context.view_layer.update()
scene.frame_start = 1
scene.frame_end = 145
for ob in bpy.context.selected_objects:
    ob.select_set(False)
for ob in bpy.data.collections['SPROUT_MODEL'].objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=EDITABLE)
# Reopen the editable copy so the dependency graph includes the newly-created
# Key/NLA owners. Updating tags alone in the creation session left cached
# constants; a fresh saved-source graph evaluates the authored keys normally.
bpy.ops.wm.open_mainfile(filepath=EDITABLE)
settings = dict(previous['settings'], filepath=TRIAL)
settings['export_optimize_animation_keep_anim_object'] = True
settings['export_morph_reset_sk_data'] = False
settings['export_optimize_disable_viewport'] = False
assert all(key in bpy.ops.export_scene.gltf.get_rna_type().properties for key in settings)
# Blender 5.2's NLA exporter toggles Key tracks without tagging the owning
# object/mesh. Newly-added eye keys can therefore stay at one cached value.
# Use the exporter's supported track-switch extension hook in this isolated
# process; do not patch the installed exporter or invent exported key values.
import io_scene_gltf2
class EyeTrackDependencyRefresh:
    is_critical = True
    def post_animation_track_switch_hook(self, obj, track, name, kind, export_settings):
        if kind == 'KEY' and obj.name in ('EYE_L', 'EYE_R'):
            ad = obj.data.shape_keys.animation_data
            strip = ad.nla_tracks[track.idx].strips[0]
            # Sample this same authored Key action directly. Blender 5.2's
            # NLA-only Key evaluation can remain cached during exporter track
            # switches even though the action itself evaluates correctly.
            ad.action = strip.action
            ad.action_slot = strip.action_slot
            ad.use_nla = False
            obj.data.shape_keys.update_tag()
            obj.data.update_tag()
            obj.update_tag(refresh={'OBJECT', 'DATA', 'TIME'})
            bpy.context.view_layer.update()
    def animation_track_switch_loop_hook(self, obj, restored, export_settings):
        if restored and obj.name in ('EYE_L', 'EYE_R'):
            ad = obj.data.shape_keys.animation_data
            ad.action = None
            ad.use_nla = True

assert not hasattr(io_scene_gltf2, 'glTF2ExportUserExtension')
io_scene_gltf2.glTF2ExportUserExtension = EyeTrackDependencyRefresh
try:
    bpy.ops.export_scene.gltf(**settings)
finally:
    del io_scene_gltf2.glTF2ExportUserExtension

def read_glb(path):
    data = open(path, 'rb').read()
    length, kind = struct.unpack_from('<II', data, 12)
    assert data[:4] == b'glTF' and kind == 0x4e4f534a
    return data, json.loads(data[20:20+length]), data[28+length:]

old_bytes, old, old_bin = read_glb(previous['path'])
trial_bytes, trial, trial_bin = read_glb(TRIAL)
# Guard the source exporter result itself before packaging or promotion.
for animation in trial['animations']:
    if animation['name'] not in EYE_CLIPS:
        continue
    for channel in animation['channels']:
        if trial['nodes'][channel['target']['node']]['name'] not in ('EYE_L', 'EYE_R') or channel['target']['path'] != 'weights':
            continue
        accessor = trial['accessors'][animation['samplers'][channel['sampler']]['output']]
        view = trial['bufferViews'][accessor['bufferView']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        values = struct.unpack_from('<' + 'f'*accessor['count'], trial_bin, start)
        expected = closures[animation['name']]
        if animation['name'] == 'Sprout_SleepLoop':
            assert len(values) == 2 and all(abs(v-1) < 1e-5 for v in values), 'Constant held sleep closure.'
        else:
            assert len(values) == len(expected), 'Keep all authored eye key samples.'
            assert max(abs(a-b) for a,b in zip(values, expected)) < 1e-5, 'Incorrect source-export eye closure: ' + animation['name']
doc, payload = copy.deepcopy(old), bytearray(old_bin)
old_node_names = {i: node['name'] for i, node in enumerate(old['nodes'])}
node_map = {i: new for new, i in enumerate(i for i, n in enumerate(old['nodes']) if n['name'] not in removed)}
doc['nodes'] = [node for node in doc['nodes'] if node['name'] not in removed]
for node in doc['nodes']:
    if 'children' in node:
        node['children'] = [node_map[i] for i in node['children'] if i in node_map]
for item in doc['scenes']:
    item['nodes'] = [node_map[i] for i in item['nodes'] if i in node_map]
for skin in doc['skins']:
    skin['joints'] = [node_map[i] for i in skin['joints']]
    if 'skeleton' in skin:
        skin['skeleton'] = node_map[skin['skeleton']]
nodes = {node['name']: i for i, node in enumerate(doc['nodes'])}
trial_nodes = {node['name']: node for node in trial['nodes']}
accessor_map, view_map = {}, {}

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
        payload.extend(b'\0' * (-len(payload) % 4))
        view['byteOffset'] = len(payload)
        view['buffer'] = 0
        payload.extend(trial_bin[start:start+source_view['byteLength']])
        view_map[view_index] = len(doc['bufferViews'])
        doc['bufferViews'].append(view)
    accessor['bufferView'] = view_map[view_index]
    accessor_map[index] = len(doc['accessors'])
    doc['accessors'].append(accessor)
    return accessor_map[index]

def accessor_bytes(document, binary, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[accessor['type']]
    element = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[accessor['componentType']] * width
    assert not view.get('byteStride') or view['byteStride'] == element
    return binary[start:start + accessor['count'] * element]

for name in ['EYE_L', 'EYE_R']:
    existing = doc['meshes'][doc['nodes'][nodes[name]]['mesh']]
    generated = trial['meshes'][trial_nodes[name]['mesh']]
    assert len(existing['primitives']) == len(generated['primitives']) == 1
    a, b = existing['primitives'][0], generated['primitives'][0]
    # Morph deltas require the same vertex/index ordering, not merely a similar
    # silhouette. The runtime preserves the original open-eye buffer bytes.
    for attribute in ['POSITION', 'NORMAL']:
        assert accessor_bytes(old, old_bin, a['attributes'][attribute]) == accessor_bytes(trial, trial_bin, b['attributes'][attribute]), 'Eye basis ordering changed: ' + name + '/' + attribute
    assert accessor_bytes(old, old_bin, a['indices']) == accessor_bytes(trial, trial_bin, b['indices']), 'Eye index ordering changed.'
    assert generated['extras']['targetNames'] == ['CloseHappy']
    assert len(b['targets']) == 1 and set(b['targets'][0]) == {'POSITION', 'NORMAL'}
    a['targets'] = [{key: append_accessor(index) for key, index in b['targets'][0].items()}]
    existing['weights'] = [0]
    existing.setdefault('extras', {})['targetNames'] = ['CloseHappy']

changes = {}
for animation in doc['animations']:
    name = animation['name']
    retained = []
    removed_channels = []
    for channel in animation['channels']:
        index = channel['target']['node']
        if index not in node_map:
            assert name in EYE_CLIPS and old_node_names[index] in ('LID_L', 'LID_R')
            removed_channels.append({'node': old_node_names[index], 'path': channel['target']['path']})
            continue
        channel['target']['node'] = node_map[index]
        retained.append(channel)
    animation['channels'] = retained
    if name not in EYE_CLIPS:
        continue
    generated = next(item for item in trial['animations'] if item['name'] == name)
    added = []
    for channel in generated['channels']:
        target = trial['nodes'][channel['target']['node']]['name']
        path = channel['target']['path']
        permitted = (target in ('EYE_L', 'EYE_R') and path == 'weights') or (target in ('GLINT_L', 'GLINT_R') and path == 'scale')
        if not permitted:
            continue  # Only these new authored face channels replace frozen data.
        item = copy.deepcopy(channel)
        sampler = copy.deepcopy(generated['samplers'][channel['sampler']])
        sampler['input'] = append_accessor(sampler['input'])
        sampler['output'] = append_accessor(sampler['output'])
        item['target']['node'] = nodes[target]
        item['sampler'] = len(animation['samplers'])
        animation['samplers'].append(sampler)
        animation['channels'].append(item)
        added.append({'node': target, 'path': path})
    assert len(added) == 4 and len(removed_channels) == 2
    changes[name] = {'removed_lid_channels': removed_channels, 'added_face_channels': added,
                     'source_closure_samples': closures[name], 'duration': (EYE_CLIPS[name]-1)/FPS,
                     'channels': len(animation['channels'])}

# Remove orphan samplers, rendered meshes, materials and binary views, while
# retaining all referenced non-eye values exactly. No obsolete cover is drawn.
for animation in doc['animations']:
    used = sorted({c['sampler'] for c in animation['channels']})
    mapping = {old: new for new, old in enumerate(used)}
    animation['samplers'] = [animation['samplers'][i] for i in used]
    for channel in animation['channels']:
        channel['sampler'] = mapping[channel['sampler']]
used_meshes = sorted({n['mesh'] for n in doc['nodes'] if 'mesh' in n})
mesh_map = {old: new for new, old in enumerate(used_meshes)}
doc['meshes'] = [doc['meshes'][i] for i in used_meshes]
for node in doc['nodes']:
    if 'mesh' in node:
        node['mesh'] = mesh_map[node['mesh']]
used_materials = sorted({p['material'] for m in doc['meshes'] for p in m['primitives'] if 'material' in p})
material_map = {old: new for new, old in enumerate(used_materials)}
doc['materials'] = [doc['materials'][i] for i in used_materials]
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        if 'material' in primitive:
            primitive['material'] = material_map[primitive['material']]
references = []
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        references.extend((primitive['attributes'], key) for key in primitive['attributes'])
        if 'indices' in primitive:
            references.append((primitive, 'indices'))
        for target in primitive.get('targets', []):
            references.extend((target, key) for key in target)
for skin in doc['skins']:
    references.append((skin, 'inverseBindMatrices'))
for animation in doc['animations']:
    for sampler in animation['samplers']:
        references.extend([(sampler, 'input'), (sampler, 'output')])
used_accessors = sorted({container[key] for container, key in references})
accessor_remap = {old: new for new, old in enumerate(used_accessors)}
doc['accessors'] = [doc['accessors'][i] for i in used_accessors]
for container, key in references:
    container[key] = accessor_remap[container[key]]
view_references = [(a, 'bufferView') for a in doc['accessors']]
view_references.extend((image, 'bufferView') for image in doc.get('images', []) if 'bufferView' in image)
used_views = sorted({container[key] for container, key in view_references})
view_remap = {old: new for new, old in enumerate(used_views)}
compact = bytearray()
new_views = []
for index in used_views:
    view = copy.deepcopy(doc['bufferViews'][index])
    start = view.get('byteOffset', 0)
    chunk = payload[start:start+view['byteLength']]
    compact.extend(b'\0' * (-len(compact) % 4))
    view['byteOffset'] = len(compact)
    compact.extend(chunk)
    new_views.append(view)
doc['bufferViews'] = new_views
for container, key in view_references:
    container[key] = view_remap[container[key]]
compact.extend(b'\0' * (-len(compact) % 4))
doc['buffers'][0]['byteLength'] = len(compact)
doc.setdefault('extras', {})['sproutEyeProfile'] = 'happy-morph-v005'
encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
encoded += b' ' * (-len(encoded) % 4)
result = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(compact))
result += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
result += struct.pack('<II', len(compact), 0x004e4942) + compact
open(OUTPUT, 'wb').write(result)

manifest = {
    'variant': 'prism-happy-eyes-v005', 'status': 'Candidate; awaiting matched visual/runtime acceptance',
    'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(result),
    'baseline_path': previous['path'], 'baseline_sha256': previous['sha256'],
    'baseline_source': SOURCE, 'baseline_source_sha256': sha(SOURCE),
    'editable_source': EDITABLE, 'editable_source_sha256': sha(EDITABLE),
    'source_export': TRIAL, 'source_export_sha256': sha(TRIAL),
    'blender': bpy.app.version_string, 'generator': trial['asset']['generator'], 'settings': settings,
    'source_export_dependency_refresh': 'Supported post_animation_track_switch_hook samples the identical authored eye Key action/slot directly while keeping NLA clip names; tags Key, mesh and object. Restores NLA after export. Isolated process only; no installed exporter mutation or generated weight replacement.',
    'profile': 'happy-morph-v005', 'fps': FPS, 'eye_geometry': eye_geometry,
    'glint_contract': {'nodes': ['GLINT_L', 'GLINT_R'], 'property': 'scale', 'open': [1,1,1],
                      'closed': [.001,.001,.001], 'fully_collapsed_at_closure': .75,
                      'mapping': '1 - .999 * smoothstep(0,.75,CloseHappy)'},
    'removed_rendered_objects': removed, 'eye_clips': changes,
    'retained_clips': [item['name'] for item in doc['animations'] if item['name'] not in EYE_CLIPS],
    'preservation': 'Frozen v004 nodes/geometry/materials/texture/skin and non-eye animation accessor bytes; deliberate four clip eye-channel replacement. Eye basis/index bytes retained; only new morph POSITION/NORMAL appended. Unreachable old cover data removed, references remapped.',
    'source_provenance': 'Original project-authored eye deformation of existing project mesh; no generated, downloaded or third-party character/motion asset.',
    'scope': 'Source-backed export; visual, mixed runtime, native and fallback proof pending.',
}
json.dump(manifest, open(MANIFEST, 'w', encoding='utf8'), indent=2)
print(json.dumps({'asset': OUTPUT, 'sha256': manifest['sha256'], 'bytes': len(result),
                  'source': EDITABLE, 'eye_clips': {k:v['channels'] for k,v in changes.items()}}))
