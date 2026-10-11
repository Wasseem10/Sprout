"""Clear the shell colour filter; preserve the frozen Prism core and motion.

Creates a new source/GLB checkpoint only. No render, live scene mutation, or
runtime/public promotion. Vertex colours are stored in linear space.
"""
import bpy
import copy
import hashlib
import json
import math
import os
import struct
import sys

if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2

BASE = os.path.dirname(os.path.abspath(__file__))
source = bpy.data.filepath
assert os.path.basename(source) == 'sprout-core-prism-v003.blend'
previous_path = os.path.join(BASE, 'sprout-core-prism-v003.manifest.json')
with open(previous_path, encoding='utf8') as handle:
    previous = json.load(handle)
source_hash = hashlib.sha256(open(source, 'rb').read()).hexdigest()
assert source_hash == previous['editable_source_sha256']
variant = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'clear'
assert variant in ('clear', 'rim')
checkpoint = 'sprout-clear-prism-rim-v003' if variant == 'rim' else 'sprout-clear-prism-v003'
output = os.path.join(BASE, checkpoint + '.glb')
editable = os.path.join(BASE, 'source', checkpoint + '.blend')
manifest = output.replace('.glb', '.manifest.json')
assert not any(os.path.exists(path) for path in (output, editable, manifest)), 'New checkpoint required.'
scene = bpy.data.scenes['INSIGHTOS_Sprout_v003_core_prism']
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v003_clear_prism' + ('_rim' if variant == 'rim' else '')
body, core, rig = [bpy.data.objects[name] for name in ('SPROUT_BODY', 'SPROUT_CORE', 'RIG_Sprout')]

def basis_digest(mesh):
    return hashlib.sha256(b''.join(struct.pack('<fff', *point.co) for point in mesh.data.vertices)).hexdigest()

body_digest, core_digest = basis_digest(body), basis_digest(core)
shell = body.data.materials[0]
old_material_name = shell.name
shell.name = 'MAT_Sprout_ClearPrismRim_v003' if variant == 'rim' else 'MAT_Sprout_ClearPrism_v003'
shader = next(node for node in shell.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
assert shader.inputs['Base Color'].is_linked
colour = body.data.color_attributes['Prism_Color']
assert colour.domain == 'POINT' and len(colour.data) == len(body.data.vertices)
shell_srgb = (.94, .975, 1.0)

def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

shell_linear = tuple(linear(value) for value in shell_srgb)
def smooth(a, b, value):
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)

rim_srgb = (.15, .82, 1.0)
rim_samples = []
for vertex, point in zip(body.data.vertices, colour.data):
    x, y, z = vertex.co
    perimeter = smooth(.87, 1.02, math.sqrt(x * x + z * z))
    buds = smooth(.77, 1.12, z)
    feet = smooth(.84, 1.10, -z)
    tint = .78 * max(perimeter, buds, feet) if variant == 'rim' else 0.0
    srgb = tuple(a + (b - a) * tint for a, b in zip(shell_srgb, rim_srgb))
    point.color = tuple(linear(value) for value in srgb) + (1.0,)
    rim_samples.append(tint)
# Linked COLOR_0 remains the single shell albedo owner; its unlinked fallback
# must not introduce a second cyan multiplier in any alternate export path.
shader.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)

owners = [rig, body.data.shape_keys, core.data.shape_keys,
          bpy.data.objects['REACTION_ROOT'], bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
def rest_pose():
    for owner in owners:
        if owner.animation_data:
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name != 'Sprout_Idle'
    reaction = bpy.data.objects['REACTION_ROOT']
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for side in ('L', 'R'):
        bpy.data.objects['LID_' + side].scale = (.003, .004, .001)
    scene.frame_set(1)
    bpy.context.view_layer.update()

rest_pose()
for item in bpy.context.selected_objects:
    item.select_set(False)
for item in bpy.data.collections['SPROUT_MODEL'].objects:
    item.select_set(True)
bpy.context.view_layer.objects.active = rig
settings = dict(previous['settings'], filepath=output)
assert all(key in bpy.ops.export_scene.gltf.get_rna_type().properties for key in settings)
assert settings['export_format'] in [item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context)]
bpy.ops.export_scene.gltf(**settings)

def read_glb(path):
    data = open(path, 'rb').read()
    length, kind = struct.unpack_from('<II', data, 12)
    assert data[:4] == b'glTF' and kind == 0x4e4f534a
    doc = json.loads(data[20:20 + length])
    bin_offset = 28 + length
    return data, doc, data[bin_offset:]

before_data, before, before_bin = read_glb(previous['path'])
assert hashlib.sha256(before_data).hexdigest() == previous['sha256']
data, doc, binary = read_glb(output)

def accessor_bytes(document, payload, index):
    accessor = document['accessors'][index]
    assert 'sparse' not in accessor
    view = document['bufferViews'][accessor['bufferView']]
    sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    item_size = sizes[accessor['componentType']] * components[accessor['type']]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', item_size)
    result = b''.join(payload[start + n * stride:start + n * stride + item_size]
                      for n in range(accessor['count']))
    return (accessor['componentType'], accessor['type'], accessor['count'],
            accessor.get('normalized', False), hashlib.sha256(result).hexdigest())

def geometry_contract(document, payload):
    result = []
    for mesh in document['meshes']:
        primitives = []
        for primitive in mesh['primitives']:
            attributes = {name: accessor_bytes(document, payload, index)
                          for name, index in primitive['attributes'].items()
                          if not (mesh['name'] == body.data.name and name.startswith('COLOR_'))}
            primitives.append({'attributes': attributes,
                               'indices': accessor_bytes(document, payload, primitive['indices']),
                               'targets': [{name: accessor_bytes(document, payload, index)
                                            for name, index in target.items()}
                                           for target in primitive.get('targets', [])]})
        result.append({'name': mesh['name'], 'weights': mesh.get('weights'),
                       'extras': mesh.get('extras'), 'primitives': primitives})
    return result

assert geometry_contract(before, before_bin) == geometry_contract(doc, binary)
animation_max_error = 0.0
for old_clip, new_clip in zip(before['animations'], doc['animations']):
    assert old_clip['name'] == new_clip['name'] and old_clip['channels'] == new_clip['channels']
    for old_sampler, new_sampler in zip(old_clip['samplers'], new_clip['samplers']):
        assert old_sampler.get('interpolation', 'LINEAR') == new_sampler.get('interpolation', 'LINEAR')
        assert accessor_bytes(before, before_bin, old_sampler['input']) == accessor_bytes(doc, binary, new_sampler['input'])
        old_accessor, new_accessor = before['accessors'][old_sampler['output']], doc['accessors'][new_sampler['output']]
        assert (old_accessor['componentType'], old_accessor['type'], old_accessor['count']) == (new_accessor['componentType'], new_accessor['type'], new_accessor['count'])
        assert old_accessor['componentType'] == 5126
        def floats(document, payload, accessor):
            view = document['bufferViews'][accessor['bufferView']]
            start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
            return struct.unpack_from('<' + 'f' * (accessor['count'] * width), payload, start)
        error = max(abs(a - b) for a, b in zip(floats(before, before_bin, old_accessor), floats(doc, binary, new_accessor)))
        animation_max_error = max(animation_max_error, error)
# Saved-source glTF exporter roundtrip changes eight LID_L blink scale floats
# by at most one float32 ULP (observed 2.384e-7), not authored keyframes.
assert animation_max_error <= 1e-6
assert before['skins'] == doc['skins']
roundtrip_node_differences = [old['name'] for old, new in zip(before['nodes'], doc['nodes']) if old != new]
assert set(roundtrip_node_differences) <= {'LID_L', 'LID_R', 'CLOSED_EYE_L', 'CLOSED_EYE_R'}
assert len(doc['skins'][0]['joints']) == 9 and len(doc['animations']) == 6
old_shell = next(material for material in before['materials'] if material['name'] == old_material_name)
new_shell = next(material for material in doc['materials'] if material['name'] == shell.name)
assert old_shell['extensions'] == new_shell['extensions']
assert old_shell['pbrMetallicRoughness']['roughnessFactor'] == new_shell['pbrMetallicRoughness']['roughnessFactor']
for material in before['materials']:
    if material['name'] != old_material_name:
        assert material == next(item for item in doc['materials'] if item['name'] == material['name'])
assert len(doc['images']) == len(before['images']) == 1
def embedded_image(document, payload):
    view = document['bufferViews'][document['images'][0]['bufferView']]
    return payload[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
assert embedded_image(before, before_bin) == embedded_image(doc, binary)
assert hashlib.sha256(embedded_image(doc, binary)).hexdigest() == previous['texture']['sha256']
assert basis_digest(body) == body_digest and basis_digest(core) == core_digest

# A saved Blender source's constrained lids evaluate with tiny rest-transform
# differences on re-export. Freeze the previous proved node/skin/animation data
# for this strictly material-only experiment. Copy only the newly exported
# shell COLOR_0 bytes and shell material name into that immutable container.
# This normalization is reproducible from the explicit frozen Prism input;
# no geometry, animation, image, or bind-pose byte is changed.
trial_doc, trial_binary = doc, binary
doc, binary = copy.deepcopy(before), bytearray(before_bin)
body_mesh_index = next(index for index, mesh in enumerate(doc['meshes']) if mesh['name'] == body.data.name)
old_colour_index = doc['meshes'][body_mesh_index]['primitives'][0]['attributes']['COLOR_0']
new_colour_index = trial_doc['meshes'][body_mesh_index]['primitives'][0]['attributes']['COLOR_0']
old_colour_accessor = doc['accessors'][old_colour_index]
new_colour_accessor = trial_doc['accessors'][new_colour_index]
assert {key: value for key, value in old_colour_accessor.items() if key != 'bufferView'} == {key: value for key, value in new_colour_accessor.items() if key != 'bufferView'}
old_view = doc['bufferViews'][old_colour_accessor['bufferView']]
new_view = trial_doc['bufferViews'][new_colour_accessor['bufferView']]
assert old_view['byteLength'] == new_view['byteLength'] and old_view.get('byteStride') == new_view.get('byteStride')
start, length = old_view.get('byteOffset', 0), old_view['byteLength']
new_start = new_view.get('byteOffset', 0)
binary[start:start + length] = trial_binary[new_start:new_start + length]
next(material for material in doc['materials'] if material['name'] == old_material_name)['name'] = shell.name
json_bytes = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
json_bytes += b' ' * (-len(json_bytes) % 4)
binary = bytes(binary)
binary += b'\x00' * (-len(binary) % 4)
data = struct.pack('<III', 0x46546c67, 2, 28 + len(json_bytes) + len(binary))
data += struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes
data += struct.pack('<II', len(binary), 0x004e4942) + binary
with open(output, 'wb') as handle:
    handle.write(data)
assert before['nodes'] == doc['nodes'] and before['skins'] == doc['skins']
assert before['animations'] == doc['animations']
assert all(accessor_bytes(before, before_bin, index) == accessor_bytes(doc, binary, index)
           for index in range(len(doc['accessors'])) if index != old_colour_index)
rest_pose()
bpy.ops.wm.save_as_mainfile(filepath=editable, copy=True)

report = dict(previous)
report.update({'variant': 'clear-prism-rim' if variant == 'rim' else 'clear-prism', 'path': output, 'sha256': hashlib.sha256(data).hexdigest(),
               'bytes': len(data), 'editable_source': editable,
               'editable_source_sha256': hashlib.sha256(open(editable, 'rb').read()).hexdigest(),
               'immutable_source': source, 'immutable_source_sha256': source_hash,
               'settings': settings, 'materials': doc['materials'], 'images': doc['images'],
               'textures': doc['textures'], 'extensions': doc['extensionsUsed'],
               'scope': 'Unaccepted material-only clear-shell A/B checkpoint; no render/runtime promotion/live scene mutation.',
               'material_change': {'owner': 'SPROUT_BODY COLOR_0 / Prism_Color',
                                   'vertex_srgb': shell_srgb, 'vertex_linear': shell_linear,
                                   'rim_tint': {'enabled': variant == 'rim', 'target_srgb': rim_srgb,
                                                'blend_min': min(rim_samples), 'blend_max': max(rim_samples),
                                                'neutral_vertices': sum(value == 0 for value in rim_samples),
                                                'perimeter_radial_smooth': [.87, 1.02],
                                                'buds_z_smooth': [.77, 1.12], 'feet_negative_z_smooth': [.84, 1.10],
                                                'strength': .78,
                                                'source': 'Basis projected X/Z radial rim plus bud/foot masks; central/lower transmission path stays near-neutral.'},
                                   'base_factor_fallback': [1, 1, 1, 1],
                                   'reason': 'Remove saturated cyan diffuse multiplication from transmitted core light.',
                                   'unchanged': ['all geometry/skin/morph accessor bytes', 'all six final animation channels, times, and sample bytes exactly',
                                                 'node transforms and skins', 'exact embedded Prism core PNG',
                                                 'core/eyes/lids/glints materials', 'shell physical extensions and roughness']},
               'byte_contract': {'geometry_except_shell_colour_equal': True, 'animation_channel_and_time_equal': True,
                                 'animation_max_float32_roundtrip_error_before_normalization': animation_max_error,
                                 'final_animation_bytes_equal': True,
                                 'nodes_and_skins_equal': True, 'core_image_equal': True,
                                 'source_body_basis_unchanged': True, 'source_core_basis_unchanged': True},
               'reexport_normalization': {'frozen_container': previous['path'], 'frozen_sha256': previous['sha256'],
                                          'copied_from_source_export': ['shell COLOR_0 bufferView bytes', 'shell material name'],
                                          'all_other_binary_bytes_and_scene_data_preserved': True,
                                          'exporter_lid_rest_node_roundtrip_differences': roundtrip_node_differences,
                                          'reason': 'Strict material-only A/B; saved-source constrained-lid rest evaluation drift is not part of this change.'}})
with open(manifest, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == source_hash
print(json.dumps({'path': output, 'sha256': report['sha256'], 'bytes': len(data),
                  'source': editable, 'source_sha256': report['editable_source_sha256'],
                  'core_texture_sha256': report['texture']['sha256'], 'shell_srgb': shell_srgb,
                  'byte_contract': report['byte_contract']}))
