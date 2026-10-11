"""Isolated daylight material variant; preserve the complete v005 motion payload.

Run background Blender with --factory-startup and the saved v005 .blend, then
--python this file -- inspect|author. No live scene or v005 file is overwritten.
"""
import bpy
import copy
import hashlib
import json
import os
import struct
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
MODE = sys.argv[sys.argv.index('--') + 1]
assert MODE in ('inspect', 'author')
SOURCE = os.path.join(BASE, 'source', 'sprout-happy-eyes-v005.blend')
assert os.path.realpath(bpy.data.filepath) == os.path.realpath(SOURCE)
sha = lambda path: hashlib.sha256(open(path, 'rb').read()).hexdigest()
previous = json.load(open(os.path.join(BASE, 'sprout-prism-v005.manifest.json'), encoding='utf8'))
assert sha(SOURCE) == previous['editable_source_sha256']
scene = bpy.data.scenes['INSIGHTOS_Sprout_v005_eyes']
bpy.context.window.scene = scene
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects['SPROUT_CORE']
rig = bpy.data.objects['RIG_Sprout']

def input_values(material):
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    names = ('Base Color', 'Metallic', 'Roughness', 'IOR', 'Transmission Weight',
             'Coat Weight', 'Coat Roughness', 'Emission Strength')
    values = {}
    for name in names:
        socket = shader.inputs.get(name)
        if socket:
            value = socket.default_value
            values[name] = list(value) if hasattr(value, '__len__') else value
    return values

def scene_report():
    return {'blender': bpy.app.version_string, 'source': SOURCE, 'source_sha256': sha(SOURCE),
            'scene': scene.name, 'objects': len(scene.objects),
            'materials': {ob.name: {'name': ob.data.materials[0].name,
                                  'inputs': input_values(ob.data.materials[0])}
                          for ob in (body, core)},
            'lights': [{'name': ob.name, 'energy': ob.data.energy} for ob in scene.objects if ob.type == 'LIGHT'],
            'reflection_cards': [{'name': ob.name, 'materials': [m.name for m in ob.data.materials],
                                  'scale': list(ob.scale)} for ob in scene.objects if ob.name.startswith('REFLECTION_')],
            'world': [{'type': n.type, 'strength': n.inputs['Strength'].default_value}
                      for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'],
            'colour_view': scene.view_settings.view_transform,
            'bones': len(rig.pose.bones),
            'eye_morphs': {side: [k.name for k in bpy.data.objects['EYE_' + side].data.shape_keys.key_blocks]
                           for side in ('L', 'R')}}

if MODE == 'inspect':
    print(json.dumps(scene_report()))
    raise SystemExit(0)

EDITABLE = os.path.join(BASE, 'source', 'sprout-daylight-v006.blend')
TRIAL = os.path.join(BASE, 'sprout-daylight-source-v006.glb')
OUTPUT = os.path.join(BASE, 'sprout-daylight-v006.glb')
MANIFEST = OUTPUT.replace('.glb', '.manifest.json')
assert not any(os.path.exists(p) for p in (EDITABLE, TRIAL, OUTPUT, MANIFEST)), 'Versioned outputs already exist.'
before_scene = scene_report()
preserved_paths = [SOURCE, previous['path'], previous['source_export'],
                   os.path.join(BASE, 'sprout-prism-v005.png'), os.path.join(BASE, 'sprout-prism-sleep-v005.png')]
PUBLIC = os.path.realpath(os.path.join(BASE, '../../../public/buddy'))
preserved_paths += [os.path.join(PUBLIC, name) for name in ('sprout-v005.glb', 'sprout-v005.png', 'sprout-v005-sleep.png')]
preserved = {path: sha(path) for path in preserved_paths}
scene.name = 'INSIGHTOS_Sprout_v006_daylight'
shell, core_material = body.data.materials[0], core.data.materials[0]
old_shell_name, old_core_name = shell.name, core_material.name
shell.name, core_material.name = 'MAT_Sprout_DaylightShell_v006', 'MAT_Sprout_DaylightCore_v006'
shader = next(n for n in shell.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
for name, value in {'Roughness': .11, 'Coat Weight': .52, 'Coat Roughness': .10, 'Transmission Weight': .80}.items():
    shader.inputs[name].default_value = value
core_shader = next(n for n in core_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
core_shader.inputs['Emission Strength'].default_value = .78
colour = body.data.color_attributes['Prism_Color']
assert colour.domain == 'POINT'
for point in colour.data:
    r, g, b, a = point.color
    point.color = (r*.78, g*.90, b, a)
card_settings = {
    'key': (7, (.92, .97, 1)), 'fill': (6, (.78, .92, 1)),
    'rim': (6, (.84, 1, .95)), 'upper': (8, (.88, .95, 1))}
for name, (strength, rgb) in card_settings.items():
    card = bpy.data.objects['REFLECTION_sprout_' + name + '_v003']
    emission = next(n for n in card.data.materials[0].node_tree.nodes if n.type == 'EMISSION')
    emission.inputs['Strength'].default_value = strength
    emission.inputs['Color'].default_value = (*rgb, 1)
    card.visible_camera = False
bpy.data.objects['LGT_sprout_key'].data.energy = 385
bpy.data.objects['LGT_sprout_rim'].data.energy = 200
# Preserve the already-selected native body, eyes, rig, hierarchy and actions.
for ob in bpy.context.selected_objects:
    ob.select_set(False)
for ob in bpy.data.collections['SPROUT_MODEL'].objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=EDITABLE)
bpy.ops.wm.open_mainfile(filepath=EDITABLE)
scene = bpy.context.scene
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2
settings = dict(previous['settings'], filepath=TRIAL)
assert all(key in bpy.ops.export_scene.gltf.get_rna_type().properties for key in settings)
assert settings['export_format'] in [item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context)]
class EyeTrackDependencyRefresh:
    """Retain the v005 supported exporter hook for actual authored eye curves."""
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

def read_glb(path):
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
    stride = view.get('byteStride', size)
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return b''.join(payload[start+i*stride:start+i*stride+size] for i in range(acc['count']))

old, old_binary = read_glb(previous['path'])
trial, trial_binary = read_glb(TRIAL)
doc, binary = copy.deepcopy(old), bytearray(old_binary)
old_body = next(m for m in doc['meshes'] if m['name'] == 'SPROUT_BODY_RuntimeBasis')
new_body = next(m for m in trial['meshes'] if m['name'] == old_body['name'])
old_primitive, new_primitive = old_body['primitives'][0], new_body['primitives'][0]
for attribute in old_primitive['attributes']:
    if attribute != 'COLOR_0':
        assert accessor_bytes(old, old_binary, old_primitive['attributes'][attribute]) == accessor_bytes(trial, trial_binary, new_primitive['attributes'][attribute]), attribute
old_index, new_index = old_primitive['attributes']['COLOR_0'], new_primitive['attributes']['COLOR_0']
old_acc, new_acc = old['accessors'][old_index], trial['accessors'][new_index]
assert {k: v for k, v in old_acc.items() if k != 'bufferView'} == {k: v for k, v in new_acc.items() if k != 'bufferView'}
old_view, new_view = old['bufferViews'][old_acc['bufferView']], trial['bufferViews'][new_acc['bufferView']]
assert old_view['byteLength'] == new_view['byteLength'] and old_view.get('byteStride') == new_view.get('byteStride')
start, length, new_start = old_view.get('byteOffset', 0), old_view['byteLength'], new_view.get('byteOffset', 0)
binary[start:start+length] = trial_binary[new_start:new_start+length]
for old_name, new_name in ((old_shell_name, 'MAT_Sprout_DaylightShell_v006'), (old_core_name, 'MAT_Sprout_DaylightCore_v006')):
    index = next(i for i, material in enumerate(doc['materials']) if material['name'] == old_name)
    new_material = copy.deepcopy(next(m for m in trial['materials'] if m['name'] == new_name))
    # Source exporter resource ordering is independently checked before copying
    # texture indices into the frozen runtime container.
    assert trial['textures'] == old['textures']
    doc['materials'][index] = new_material
doc['extensionsUsed'] = sorted(set(old.get('extensionsUsed', [])) | set(trial.get('extensionsUsed', [])))
json_bytes = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
json_bytes += b' ' * (-len(json_bytes) % 4)
data = struct.pack('<III', 0x46546c67, 2, 28+len(json_bytes)+len(binary))
data += struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes
data += struct.pack('<II', len(binary), 0x004e4942) + binary
open(OUTPUT, 'wb').write(data)
for field in ('nodes', 'skins', 'animations', 'meshes', 'accessors', 'bufferViews', 'images', 'textures'):
    assert doc[field] == old[field], field
assert len(doc['animations']) == 11
assert all(accessor_bytes(old, old_binary, i) == accessor_bytes(doc, binary, i)
           for i in range(len(doc['accessors'])) if i != old_index)
assert all(sha(path) == digest for path, digest in preserved.items())
report = {'variant': 'daylight-v006', 'status': 'Candidate material variant, runtime appearance acceptance pending',
          'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(data),
          'editable_source': EDITABLE, 'editable_source_sha256': sha(EDITABLE),
          'source_export': TRIAL, 'source_export_sha256': sha(TRIAL),
          'baseline_path': previous['path'], 'baseline_sha256': sha(previous['path']),
          'blender': bpy.app.version_string, 'settings': settings, 'profile': 'happy-morph-v005',
          'material_changes': {'shell_roughness': [.06, .11], 'shell_clearcoat': [.85, .52],
                               'shell_coat_roughness': [.045, .10], 'shell_transmission': [.88, .80],
                               'core_emission': [1.1, .78], 'shell_vertex_linear_multiplier': [.78, .90, 1]},
          'source_lighting': {'cards': card_settings, 'key_watts': 385, 'fill_watts': 45, 'rim_watts': 200,
                              'world_strength': .18, 'scope': 'Cycles approximation of daylight runtime reflection direction; not identical renderer pixels'},
          'materials': doc['materials'], 'baseline_source_inspection': before_scene,
          'preservation': {'pass': True, 'v005_file_hashes': preserved, 'changed_accessor': old_index,
                           'exception': 'Only SPROUT_BODY COLOR_0 values and two source-exported material dictionaries change',
                           'all_other_accessor_bytes_exact': True, 'nodes_skins_animations_meshes_exact': True,
                           'animation_count': 11, 'original_texture_bytes_exact': True},
          'eye_clips': previous['eye_clips'], 'removed_rendered_objects': previous['removed_rendered_objects'],
          'scope': 'New material/look-development source only. Original v005 files and live unsaved Blender untouched.'}
json.dump(report, open(MANIFEST, 'w', encoding='utf8'), indent=2)
print(json.dumps({'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(data), 'source': EDITABLE, 'preservation_pass': True}))
