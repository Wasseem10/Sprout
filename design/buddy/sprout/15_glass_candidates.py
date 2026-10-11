"""Author v003 material studies from an immutable v002 master in background Blender.

No public asset promotion, topology edits to SPROUT_BODY, or live-session mutation.
Run: blender --background source/sprout-prism-v002.blend --python this.py -- volume|core
"""
import bpy
import bmesh
import hashlib
import json
import math
import os
import struct
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# Factory preferences avoid starting unrelated user addons/network integrations.
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2

BASE = os.path.dirname(os.path.abspath(__file__))
variant = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'volume'
assert variant in ('volume', 'core')
source = bpy.data.filepath
assert os.path.basename(source) == 'sprout-prism-v002.blend', 'Open immutable v002 first.'
source_hash = hashlib.sha256(open(source, 'rb').read()).hexdigest()
expected_source_hash = 'd636554af1d2ae493a8414de322a0028779f1fd6d47baff2133be0546a12a2ae'
assert source_hash == expected_source_hash, 'Inspect changed baseline instead of overwriting.'
scene = bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v003_' + variant
body = bpy.data.objects['SPROUT_BODY']
rig = bpy.data.objects['RIG_Sprout']
reaction = bpy.data.objects['REACTION_ROOT']
model = bpy.data.collections['SPROUT_MODEL']
body_position_digest = hashlib.sha256(b''.join(struct.pack('<fff', *v.co) for v in body.data.vertices)).hexdigest()
assert len(rig.data.bones) == 9
assert [k.name for k in body.data.shape_keys.key_blocks] == ['Basis', 'Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R']
assert bpy.data.objects.get('SPROUT_CORE') is None
output = os.path.join(BASE, 'sprout-' + variant + '-v003.glb')
editable = os.path.join(BASE, 'source', 'sprout-' + variant + '-v003.blend')
assert not os.path.exists(output) and not os.path.exists(editable), 'Use a new version/checkpoint, do not overwrite.'

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))

def linear(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

def color_linear(rgb):
    return tuple(linear(x) for x in rgb) + (1,)

def undertone(co):
    x, y, z = co
    if variant == 'volume':
        blue = mix((0.09, 0.51, 0.98), (0.14, 0.80, 1.0), smooth(-0.85, 0.85, z))
    else:
        blue = mix((0.38, 0.82, 1.0), (0.53, 0.94, 1.0), smooth(-0.80, 0.95, z))
    # Wide, low-strength edge undertones; no narrow painted lower ribbon.
    lower = math.exp(-((z + 0.59) / 0.54) ** 2)
    lateral = 0.35 + 0.65 * smooth(0.22, 0.90, abs(x))
    tint = mix((0.76, 0.72, 1.0), (1.0, 0.81, 0.77), smooth(-0.60, 0.66, x))
    return color_linear(mix(blue, tint, lower * lateral * 0.22))

def new_principled(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

settings = {
    'Metallic': 0.0,
    'Roughness': 0.105 if variant == 'volume' else 0.095,
    'IOR': 1.38 if variant == 'volume' else 1.36,
    'Coat Weight': 0.85 if variant == 'volume' else 0.90,
    'Coat Roughness': 0.055 if variant == 'volume' else 0.045,
    'Transmission Weight': 0.84 if variant == 'volume' else 0.90,
    'Alpha': 1.0,
}
thickness = 0.48 if variant == 'volume' else 0.36
attenuation_distance = 3.5 if variant == 'volume' else 4.5
attenuation_srgb = (0.38, 0.77, 1.0) if variant == 'volume' else (0.80, 0.96, 1.0)
glass, shader = new_principled('MAT_Sprout_' + variant.title() + '_v003')
for name, value in settings.items():
    assert name in shader.inputs, name
    shader.inputs[name].default_value = value
color = glass.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'Prism_Color'
glass.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
# The exporter deliberately recognizes this custom Thickness socket.
from io_scene_gltf2.blender.com.material_helpers import create_settings_group
# Use the installed exporter helper, including its Occlusion input. Blender5.2's
# inline-material route recognizes that socket to retain the metadata group;
# a hand-made Thickness-only group is inlined away and silently loses volume.
thickness_group = create_settings_group('glTF Material Output v003 ' + variant)
thickness_node = glass.node_tree.nodes.new('ShaderNodeGroup')
thickness_node.node_tree = thickness_group
thickness_node.inputs['Thickness'].default_value = thickness
absorption = glass.node_tree.nodes.new('ShaderNodeVolumeAbsorption')
absorption.inputs['Color'].default_value = color_linear(attenuation_srgb)
absorption.inputs['Density'].default_value = 1.0 / attenuation_distance
material_output = next(n for n in glass.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
glass.node_tree.links.new(absorption.outputs['Volume'], material_output.inputs['Volume'])
glass.use_backface_culling = True
glass.diffuse_color = color_linear((0.14, 0.72, 1.0) if variant == 'volume' else (0.47, 0.90, 1.0))
body.data.materials.clear()
body.data.materials.append(glass)
colors = body.data.color_attributes['Prism_Color']
for vert in body.data.vertices:
    colors.data[vert.index].color = undertone(vert.co)

lid_mat, lid_shader = new_principled('MAT_Sprout_Lids_v003')
lid_rgb = (0.13, 0.63, 0.97) if variant == 'volume' else (0.025, 0.47, 0.98)
lid_shader.inputs['Base Color'].default_value = color_linear(lid_rgb)
for name, value in {'Metallic': 0.0, 'Roughness': 0.16, 'Coat Weight': 0.65,
                    'Coat Roughness': 0.065, 'Transmission Weight': 0.0, 'Alpha': 1.0}.items():
    lid_shader.inputs[name].default_value = value
lid_mat.diffuse_color = color_linear(lid_rgb)
for side in ('L', 'R'):
    lid = bpy.data.objects['LID_' + side]
    lid.data.materials.clear()
    lid.data.materials.append(lid_mat)

core = None
if variant == 'core':
    mesh = bpy.data.meshes.new('SPROUT_CORE_RuntimeBasis_v003')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        v.co = (x * 0.82 * (1 - 0.10 * z), y * 0.47 - 0.025, z * 0.72 - 0.015)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    core = bpy.data.objects.new('SPROUT_CORE', mesh)
    model.objects.link(core)
    core.parent = rig
    modifier = core.modifiers.new('Sprout_Core_FK', 'ARMATURE')
    modifier.object = rig
    group = core.vertex_groups.new(name='BODY')
    group.add(list(range(len(mesh.vertices))), 1.0, 'REPLACE')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    core_mat, core_shader = new_principled('MAT_Sprout_CoreBlue_v003')
    core_shader.inputs['Base Color'].default_value = color_linear((0.015, 0.39, 1.0))
    core_shader.inputs['Roughness'].default_value = 0.23
    core_shader.inputs['Metallic'].default_value = 0.0
    core_shader.inputs['Coat Weight'].default_value = 0.20
    core_shader.inputs['Coat Roughness'].default_value = 0.10
    core_mat.diffuse_color = color_linear((0.015, 0.39, 1.0))
    mesh.materials.append(core_mat)
    basis = core.shape_key_add(name='Basis')
    # Same original displacement fields, evaluated on the new inset basis.
    for name in ('Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R'):
        key = core.shape_key_add(name=name)
        for index, point in enumerate(key.data):
            x, y, z = basis.data[index].co
            face = math.exp(-((x / 0.77) ** 6 + (z / 0.43) ** 6)) * smooth(0.20, 0.56, -y)
            mask = (1 - face) * (1 - smooth(0.72, 1.04, -z)) * (1 - smooth(0.51, 0.92, z))
            if name == 'Jelly_Squash':
                point.co = (x * (1 + 0.038 * mask), y * (1 + 0.023 * mask), z - 0.050 * z * mask)
            else:
                direction = -1 if name.endswith('_L') else 1
                point.co = (x + direction * 0.050 * mask * (0.55 + 0.45 * math.cos(z * 2)),
                            y, z + direction * 0.022 * x * mask)
    core.data.shape_keys.animation_data_create()
    for original in body.data.shape_keys.animation_data.nla_tracks:
        assert original.name in ('Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak')
        track = core.data.shape_keys.animation_data.nla_tracks.new()
        track.name = original.name
        for original_strip in original.strips:
            action = original_strip.action.copy()
            action.name = original.name + '_Core_v003'
            strip = track.strips.new(original.name, int(original_strip.frame_start), action)
            source_slot = original_strip.action_slot
            strip.action_slot = action.slots.get(source_slot.identifier)
            strip.blend_type = original_strip.blend_type
            strip.extrapolation = original_strip.extrapolation
        track.mute = original.mute

owners = [rig, body.data.shape_keys, reaction, bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
if core:
    owners.append(core.data.shape_keys)

def rest():
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for side in ('L', 'R'):
        bpy.data.objects['LID_' + side].scale = (0.003, 0.004, 0.001)

def set_clip(clip, frame):
    for owner in owners:
        if owner.animation_data:
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name != clip
    rest()
    scene.frame_set(frame)
    bpy.context.view_layer.update()

def evaluated_world(ob):
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    polygons = [tuple(p.vertices) for p in mesh.polygons]
    evaluated.to_mesh_clear()
    return points, polygons

clearance = []
if core:
    for clip in ('Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak'):
        for frame in (1, 37, 73, 109, 145):
            set_clip(clip, frame)
            shell_points, shell_faces = evaluated_world(body)
            tree = BVHTree.FromPolygons(shell_points, shell_faces, all_triangles=False)
            points, _ = evaluated_world(core)
            samples = [tree.find_nearest(point) for point in points]
            signed = [(point - nearest).dot(normal) for point, (nearest, normal, _, _) in zip(points, samples)]
            clearance.append({'clip': clip, 'frame': frame, 'vertices': len(points),
                              'min_distance': min(sample[3] for sample in samples),
                              'max_signed_distance': max(signed), 'outside_vertices': sum(v >= -1e-5 for v in signed)})
    # Full independent shape-key corners plus click peak, beyond authored base weights.
    for owner in owners:
        if owner.animation_data:
            for track in owner.animation_data.nla_tracks:
                track.mute = True
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    for corner in range(8):
        values = [(corner >> index) & 1 for index in range(3)]
        for ob in (body, core):
            for key, value in zip(list(ob.data.shape_keys.key_blocks)[1:], values):
                key.value = value
        reaction.scale = (1.065, 1.035, 0.925)
        reaction.rotation_euler = (0, -0.018, 0)
        bpy.context.view_layer.update()
        shell_points, shell_faces = evaluated_world(body)
        tree = BVHTree.FromPolygons(shell_points, shell_faces, all_triangles=False)
        points, _ = evaluated_world(core)
        samples = [tree.find_nearest(point) for point in points]
        signed = [(point - nearest).dot(normal) for point, (nearest, normal, _, _) in zip(points, samples)]
        clearance.append({'morph_corner': values, 'reaction': 'Click peak', 'vertices': len(points),
                          'min_distance': min(sample[3] for sample in samples),
                          'max_signed_distance': max(signed), 'outside_vertices': sum(v >= -1e-5 for v in signed)})
    assert all(item['outside_vertices'] == 0 for item in clearance), 'Core escaped shell: inspect proof.'

set_clip('Sprout_Idle', 1)
for ob in bpy.context.selected_objects:
    ob.select_set(False)
for ob in model.objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
export = dict(filepath=output, export_format='GLB', use_selection=True, use_active_scene=True,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
              export_frame_step=1, export_anim_slide_to_zero=True, export_apply=False,
              export_def_bones=False, export_morph=True, export_morph_normal=True,
              export_morph_animation=True, export_normals=True, export_texcoords=True,
              export_vertex_color='ACTIVE', export_all_vertex_colors=True,
              export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True)
valid = bpy.ops.export_scene.gltf.get_rna_type().properties
assert all(key in valid for key in export)
assert export['export_format'] in [item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context)]
for key in ('export_animation_mode', 'export_vertex_color'):
    assert export[key] in [item.identifier for item in valid[key].enum_items]
bpy.ops.export_scene.gltf(**export)
data = open(output, 'rb').read()
assert data[:4] == b'glTF'
length, kind = struct.unpack_from('<II', data, 12)
assert kind == 0x4e4f534a
doc = json.loads(data[20:20 + length])
nodes = doc['nodes']
assert 'KHR_materials_volume' in doc['extensionsUsed']
assert 'KHR_materials_transmission' in doc['extensionsUsed']
assert 'KHR_materials_ior' in doc['extensionsUsed']
assert len(doc['skins'][0]['joints']) == 9
assert set(a['name'] for a in doc['animations']) == {'Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak', 'Sprout_Click', 'Sprout_Blink'}
assert hashlib.sha256(b''.join(struct.pack('<fff', *v.co) for v in body.data.vertices)).hexdigest() == body_position_digest
set_clip('Sprout_Idle', 1)
bpy.ops.wm.save_as_mainfile(filepath=editable, copy=True)
report = {
    'variant': variant, 'path': output, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
    'editable_source': editable, 'editable_source_sha256': hashlib.sha256(open(editable, 'rb').read()).hexdigest(),
    'immutable_source': source, 'immutable_source_sha256': source_hash,
    'blender': bpy.app.version_string, 'generator': doc['asset']['generator'], 'units': 'metres; body width approximately 2 units',
    'camera': {'position': list(scene.camera.location), 'target': [0, 0, 0.08], 'orthographic_span': scene.camera.data.ortho_scale},
    'settings': export, 'body_settings': settings,
    'volume': {'thickness': thickness, 'attenuation_distance': attenuation_distance, 'attenuation_srgb': attenuation_srgb,
               'limitation': 'Constant raster thickness approximation; not a measured thickness map or scattering simulation.'},
    'materials': doc.get('materials'), 'extensions': doc['extensionsUsed'],
    'nodes': [n.get('name') for n in nodes],
    'skins': [{'joints': [nodes[index]['name'] for index in skin['joints']]} for skin in doc['skins']],
    'meshes': [{'name': mesh.get('name'), 'morphs': mesh.get('extras', {}).get('targetNames'),
                'primitives': [{'attributes': list(p['attributes']), 'targets': [list(t) for t in p.get('targets', [])]} for p in mesh['primitives']]} for mesh in doc['meshes']],
    'animations': [{'name': a['name'], 'channels': [{'node': nodes[c['target']['node']].get('name'), 'path': c['target']['path']} for c in a['channels']]} for a in doc['animations']],
    'core': {'name': 'SPROUT_CORE', 'vertices': len(core.data.vertices), 'bone': 'BODY',
             'morph_owner': 'same base mixer via paired full vectors', 'clearance_samples': clearance} if core else None,
    'body_basis_unchanged': True,
    'scope': 'Authored from immutable saved v002 in isolated background Blender. No live-session mutation or runtime promotion.',
}
manifest = output.replace('.glb', '.manifest.json')
with open(manifest, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == source_hash
print(json.dumps({'path': output, 'sha256': report['sha256'], 'bytes': len(data), 'source': editable,
                  'extensions': doc['extensionsUsed'], 'clips': [a['name'] for a in doc['animations']],
                  'core_min_clearance': min(item['min_distance'] for item in clearance) if clearance else None}))
