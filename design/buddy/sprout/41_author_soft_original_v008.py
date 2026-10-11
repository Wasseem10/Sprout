"""Restore Original appearance on v007 motion in a separate Blender source.

Run in isolated Blender --background --factory-startup on speaking-v007.blend.
The runtime package changes two materials and shell COLOR_0 only. It keeps
every geometry, rig, morph, eye and animation byte from v007, including Speak.
"""
import bpy
import copy
import hashlib
import json
import os
import shutil
import struct

BASE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.realpath(os.path.join(BASE, '../../../public/buddy'))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
read_json = lambda p: json.load(open(p, encoding='utf8'))
previous = read_json(os.path.join(BASE, 'sprout-speaking-v007.manifest.json'))
original = read_json(os.path.join(BASE, 'sprout-prism-v005.manifest.json'))
SOURCE = previous['editable_source']
EDITABLE = os.path.join(BASE, 'source/sprout-soft-original-v008.blend')
TRIAL = os.path.join(BASE, 'sprout-soft-original-source-v008.glb')
OUTPUT = os.path.join(BASE, 'sprout-soft-original-v008.glb')
MANIFEST = OUTPUT.replace('.glb', '.manifest.json')
assert os.path.realpath(bpy.data.filepath) == os.path.realpath(SOURCE)
assert sha(SOURCE) == previous['editable_source_sha256']
assert not any(os.path.exists(p) for p in (EDITABLE, TRIAL, OUTPUT, MANIFEST)), 'Use a fresh version.'
preserved = {}
for version, stem in [('v005', 'sprout-prism'), ('v006', 'sprout-daylight'), ('v007', 'sprout-speaking')]:
    info = read_json(os.path.join(BASE, stem + '-' + version + '.manifest.json'))
    for p in (info['path'], info['source_export'], info['editable_source']):
        preserved[p] = sha(p)
    for suffix in ('.glb', '.png', '-sleep.png'):
        p = os.path.join(PUBLIC, 'sprout-' + version + suffix)
        preserved[p] = sha(p)

scene = bpy.data.scenes['INSIGHTOS_Sprout_v007_speaking']
bpy.context.window.scene = scene
body, core = [scene.objects[n] for n in ('SPROUT_BODY', 'SPROUT_CORE')]
rig = scene.objects['RIG_Sprout']
assert len(rig.pose.bones) == 9
before_object_names = set(bpy.data.objects.keys())
with bpy.data.libraries.load(original['editable_source'], link=False) as (available, loaded):
    loaded.scenes = ['INSIGHTOS_Sprout_v005_eyes']
reference = loaded.scenes[0]

def ref_object(name):
    return next(o for o in reference.objects if o.name == name or o.name.startswith(name + '.'))

def lighting_report(source_scene):
    lights, cards = [], []
    for ob in source_scene.objects:
        if ob.type == 'LIGHT':
            lights.append({'name': ob.name.split('.')[0], 'type': ob.data.type,
                           'energy_watts': ob.data.energy, 'color_linear': list(ob.data.color),
                           'location_blender': list(ob.location), 'rotation_euler': list(ob.rotation_euler),
                           'size': getattr(ob.data, 'size', None), 'size_y': getattr(ob.data, 'size_y', None)})
        elif ob.name.startswith('REFLECTION_sprout_'):
            node = next(n for n in ob.data.materials[0].node_tree.nodes if n.type == 'EMISSION')
            cards.append({'name': ob.name.split('.')[0], 'emission_strength': node.inputs['Strength'].default_value,
                          'color_linear': list(node.inputs['Color'].default_value),
                          'location_blender': list(ob.location), 'rotation_euler': list(ob.rotation_euler),
                          'dimensions': list(ob.dimensions), 'visible_camera': ob.visible_camera})
    world = next(n for n in source_scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    return {'lights': lights, 'cards': cards, 'world_color_linear': list(world.inputs['Color'].default_value),
            'world_strength': world.inputs['Strength'].default_value,
            'view_transform': source_scene.view_settings.view_transform,
            'look': source_scene.view_settings.look, 'exposure': source_scene.view_settings.exposure,
            'gamma': source_scene.view_settings.gamma,
            'scope': 'Actual Original Cycles source values; Blender power units and transport are not directly interchangeable with Three.js environment intensity.'}

source_lighting = lighting_report(reference)
# Assign the two actual Original node materials, not approximated colour values.
for target in (body, core):
    source_object = ref_object(target.name)
    assert len(target.data.materials) == len(source_object.data.materials) == 1
    target.data.materials[0] = source_object.data.materials[0]
original_colours = ref_object('SPROUT_BODY').data.color_attributes['Prism_Color']
colours = body.data.color_attributes['Prism_Color']
assert original_colours.domain == colours.domain == 'POINT'
assert len(original_colours.data) == len(colours.data)
for src, dst in zip(original_colours.data, colours.data):
    dst.color = src.color

# Restore source illumination to the exact source of the approved still.
for ob in list(scene.objects):
    if ob.type == 'LIGHT':
        source_object = ref_object(ob.name)
        ob.data = source_object.data.copy()
        # Appended scenes have not been dependency-graph evaluated: matrix_world
        # can still be identity. These unparented source lights use explicit TRS.
        assert ob.parent is None and source_object.parent is None
        ob.location = source_object.location.copy()
        ob.rotation_euler = source_object.rotation_euler.copy()
        ob.scale = source_object.scale.copy()
    elif ob.name.startswith('REFLECTION_sprout_'):
        source_object = ref_object(ob.name)
        ob.data.materials[0] = source_object.data.materials[0]
        assert ob.parent is None and source_object.parent is None
        ob.location = source_object.location.copy()
        ob.rotation_euler = source_object.rotation_euler.copy()
        ob.scale = source_object.scale.copy()
        ob.visible_camera = False
scene.world = reference.world.copy()
for prop in ('view_transform', 'look', 'exposure', 'gamma'):
    setattr(scene.view_settings, prop, getattr(reference.view_settings, prop))

# Remove imported scene/object duplicates; all v007 model/action owners survive.
bpy.data.scenes.remove(reference)
for ob in list(bpy.data.objects):
    if ob.name not in before_object_names:
        bpy.data.objects.remove(ob, do_unlink=True)
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v008_soft_original'
assert len(scene.objects) == 30
for ob in bpy.context.selected_objects:
    ob.select_set(False)
for ob in bpy.data.collections['SPROUT_MODEL'].objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=EDITABLE)
bpy.ops.wm.open_mainfile(filepath=EDITABLE)
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2
settings = dict(previous['settings'], filepath=TRIAL)
assert all(k in bpy.ops.export_scene.gltf.get_rna_type().properties for k in settings)

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

old, old_binary = glb(previous['path'])
ref, ref_binary = glb(original['path'])
trial, _ = glb(TRIAL)
doc, binary = copy.deepcopy(old), bytearray(old_binary)
body_mesh = next(m for m in doc['meshes'] if m['name'] == 'SPROUT_BODY_RuntimeBasis')
colour_index = body_mesh['primitives'][0]['attributes']['COLOR_0']
assert ref['meshes'] == old['meshes']
assert ref['accessors'][colour_index] == old['accessors'][colour_index]
view_index = old['accessors'][colour_index]['bufferView']
view = old['bufferViews'][view_index]
assert view == ref['bufferViews'][view_index]
start, length = view.get('byteOffset', 0), view['byteLength']
binary[start:start+length] = ref_binary[start:start+length]
assert trial['textures'] == old['textures'] == ref['textures']
material_indices = [body_mesh['primitives'][0]['material'], next(m for m in doc['meshes'] if m['name'] == 'SPROUT_CORE_RuntimeBasis_v003')['primitives'][0]['material']]
for index in material_indices:
    target = ref['materials'][index]
    actual = next(m for m in trial['materials'] if m['name'] == target['name'])
    assert actual == target, (actual, target)
    doc['materials'][index] = copy.deepcopy(actual)
assert doc['materials'] == ref['materials']
json_bytes = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
json_bytes += b' ' * (-len(json_bytes) % 4)
data = struct.pack('<III', 0x46546c67, 2, 28+len(json_bytes)+len(binary))
data += struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes
data += struct.pack('<II', len(binary), 0x004e4942) + binary
open(OUTPUT, 'wb').write(data)
assert all(doc.get(k) == old.get(k) for k in old if k != 'materials')
assert binary[:start] == old_binary[:start] and binary[start+length:] == old_binary[start+length:]
assert all(sha(p) == digest for p, digest in preserved.items())
shutil.copyfile(OUTPUT, os.path.join(PUBLIC, 'sprout-v008.glb'))
fallbacks = []
for src_name, dst_name, public_name in [
    ('sprout-prism-v005.png', 'sprout-soft-original-v008.png', 'sprout-v008.png'),
    ('sprout-prism-sleep-v005.png', 'sprout-soft-original-sleep-v008.png', 'sprout-v008-sleep.png')]:
    src, dst, public = os.path.join(BASE, src_name), os.path.join(BASE, dst_name), os.path.join(PUBLIC, public_name)
    shutil.copyfile(src, dst)
    shutil.copyfile(src, public)
    fallbacks.append({'path': dst, 'public': public, 'inherited_from': src, 'sha256': sha(src),
                      'provenance': 'Exact approved v005 Cycles reference pixels. Original materials/colors restored with unchanged idle/sleep geometry/actions; not a new render or a browser screenshot.'})
manifest = {'variant': 'soft-original-v008', 'status': 'Versioned asset ready for separate runtime lighting integration',
            'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(data),
            'editable_source': EDITABLE, 'editable_source_sha256': sha(EDITABLE),
            'source_export': TRIAL, 'source_export_sha256': sha(TRIAL),
            'baseline_path': previous['path'], 'baseline_sha256': sha(previous['path']),
            'baseline_source_export': previous['source_export'],
            'appearance_reference_path': original['path'], 'appearance_reference_sha256': sha(original['path']),
            'blender': bpy.app.version_string, 'settings': settings,
            'profile': 'happy-morph-v005', 'appearance_profile': 'soft',
            'source_lighting': source_lighting, 'materials': doc['materials'],
            'eye_clips': previous['eye_clips'], 'removed_rendered_objects': previous['removed_rendered_objects'],
            'preservation': {'pass': True, 'previous_file_hashes': preserved,
                             'exception': 'Two Original material dictionaries and shell COLOR_0 restored exactly from v005; no other GLB dictionary or binary stream changes.',
                             'material_indices': material_indices, 'colour_accessor': colour_index,
                             'colour_byte_range': [start, start+length],
                             'all_other_binary_bytes_exact': True, 'all_eleven_animations_exact': True,
                             'geometry_skins_morphs_hierarchy_exact': True},
            'fallbacks': fallbacks,
            'scope': 'New immutable Original-material asset carrying all v007 motion. Source Cycles and web runtime use different renderers; visual match is verified separately.'}
json.dump(manifest, open(MANIFEST, 'w', encoding='utf8'), indent=2)
print(json.dumps({'path': OUTPUT, 'sha256': sha(OUTPUT), 'bytes': len(data), 'source': EDITABLE,
                  'colour_byte_range': [start, start+length], 'preservation_pass': True,
                  'source_lighting': source_lighting}))
