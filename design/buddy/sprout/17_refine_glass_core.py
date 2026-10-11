"""Refine the owned C study; never overwrite its source, v002, or public files.

Run a fresh --factory-startup background process opened on sprout-core-v003.blend.
This is a real material/geometry checkpoint, not a baked screenshot substitute.
"""
import bpy
import hashlib
import json
import math
import os
import struct
from mathutils.bvhtree import BVHTree

if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2

BASE = os.path.dirname(os.path.abspath(__file__))
source = bpy.data.filepath
assert os.path.basename(source) == 'sprout-core-v003.blend'
source_hash = hashlib.sha256(open(source, 'rb').read()).hexdigest()
assert source_hash == 'e1dea294315e97abc280108537f025350b78b351be00ffc47cfa37cc0782c5c1'
checkpoint = 'sprout-core-refined-v003'
output = os.path.join(BASE, checkpoint + '.glb')
editable = os.path.join(BASE, 'source', checkpoint + '.blend')
assert not os.path.exists(output) and not os.path.exists(editable), 'New checkpoint required.'
scene = bpy.data.scenes['INSIGHTOS_Sprout_v003_core']
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v003_core_refined'
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects['SPROUT_CORE']
rig = bpy.data.objects['RIG_Sprout']
reaction = bpy.data.objects['REACTION_ROOT']
model = bpy.data.collections['SPROUT_MODEL']
body_digest = hashlib.sha256(b''.join(struct.pack('<fff', *v.co) for v in body.data.vertices)).hexdigest()
assert len(rig.data.bones) == 9
assert [k.name for k in core.data.shape_keys.key_blocks] == ['Basis', 'Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R']

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))

def linear(x):
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4

def rgba(rgb):
    return tuple(linear(x) for x in rgb) + (1.0,)

# Give the inset a gently unequal pear profile, without changing the shell.
# Its cyan colour transition avoids a hard uniformly shaded circular boundary.
for point in core.data.shape_keys.key_blocks['Basis'].data:
    x, y, z = point.co
    nz = (z + 0.015) / 0.72
    nx = x / (0.82 * (1 - 0.10 * nz))
    offset = 0.020 * math.sin(nz * math.pi * 1.3) * (1 - nz * nz)
    point.co = (nx * 0.84 * (1 - 0.13 * nz) + offset, y, nz * 0.77 - 0.005)
for index, vertex in enumerate(core.data.vertices):
    vertex.co = core.data.shape_keys.key_blocks['Basis'].data[index].co
for name in ('Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R'):
    key = core.data.shape_keys.key_blocks[name]
    for index, point in enumerate(key.data):
        x, y, z = core.data.shape_keys.key_blocks['Basis'].data[index].co
        face = math.exp(-((x / 0.77) ** 6 + (z / 0.43) ** 6)) * smooth(0.20, 0.56, -y)
        mask = (1 - face) * (1 - smooth(0.72, 1.04, -z)) * (1 - smooth(0.51, 0.92, z))
        if name == 'Jelly_Squash':
            point.co = (x * (1 + 0.038 * mask), y * (1 + 0.023 * mask), z - 0.050 * z * mask)
        else:
            direction = -1 if name.endswith('_L') else 1
            point.co = (x + direction * 0.050 * mask * (0.55 + 0.45 * math.cos(z * 2)),
                        y, z + direction * 0.022 * x * mask)

shell = body.data.materials[0]
shell.name = 'MAT_Sprout_GlassRefined_v003'
shell_shader = next(node for node in shell.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
shell_values = {'Roughness': 0.065, 'IOR': 1.40, 'Coat Weight': 0.85,
                'Coat Roughness': 0.045, 'Transmission Weight': 0.90, 'Metallic': 0.0, 'Alpha': 1.0}
for name, value in shell_values.items():
    shell_shader.inputs[name].default_value = value
thickness_node = next(node for node in shell.node_tree.nodes if node.type == 'GROUP' and 'Thickness' in node.inputs)
thickness_node.inputs['Thickness'].default_value = 0.34
absorption = next(node for node in shell.node_tree.nodes if node.type == 'VOLUME_ABSORPTION')
absorption.inputs['Color'].default_value = rgba((0.75, 0.94, 1.0))
absorption.inputs['Density'].default_value = 1.0 / 4.5
for vertex in body.data.vertices:
    x, y, z = vertex.co
    blue = mix((0.10, 0.68, 1.0), (0.15, 0.89, 1.0), smooth(-0.8, 0.9, z))
    lower = math.exp(-((z + 0.60) / 0.53) ** 2)
    lateral = 0.35 + 0.65 * smooth(0.17, 0.85, abs(x))
    tint = mix((0.66, 0.55, 1.0), (1.0, 0.77, 0.69), smooth(-0.65, 0.65, x))
    body.data.color_attributes['Prism_Color'].data[vertex.index].color = rgba(mix(blue, tint, lower * lateral * 0.46))

core_mat = core.data.materials[0]
core_mat.name = 'MAT_Sprout_CoreGradient_v003'
shader = next(node for node in core_mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
shader.inputs['Roughness'].default_value = 0.17
shader.inputs['Coat Weight'].default_value = 0.04
shader.inputs['Coat Roughness'].default_value = 0.10
shader.inputs['Emission Strength'].default_value = 0.16
shader.inputs['Emission Color'].default_value = rgba((0.015, 0.49, 1.0))
colors = core.data.color_attributes.new(name='Core_Blue', type='FLOAT_COLOR', domain='POINT')
for vertex in core.data.vertices:
    x, y, z = vertex.co
    radius = math.sqrt((x / 0.87) ** 2 + ((z + 0.005) / 0.79) ** 2)
    blue = mix((0.015, 0.53, 1.0), (0.015, 0.46, 1.0), smooth(-0.65, 0.65, z))
    edge = smooth(0.56, 0.99, radius)
    rgb = mix(blue, (0.045, 0.82, 1.0), edge * 0.86)
    lower = math.exp(-((z + 0.64) / 0.38) ** 2) * edge
    tint = mix((0.56, 0.46, 1.0), (0.95, 0.72, 0.72), smooth(-0.65, 0.65, x))
    colors.data[vertex.index].color = rgba(mix(rgb, tint, lower * 0.10))
color_node = core_mat.node_tree.nodes.new('ShaderNodeVertexColor')
color_node.layer_name = 'Core_Blue'
core_mat.node_tree.links.new(color_node.outputs['Color'], shader.inputs['Base Color'])
# glTF supports a constant emissive factor; vertex-colour-driven emission would
# require another texture or custom shader. Keep this authored blue fill honest.
core.data.color_attributes.active_color = colors
core_mat.diffuse_color = rgba((0.015, 0.49, 1.0))

owners = [rig, body.data.shape_keys, core.data.shape_keys, reaction, bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
def pose(clip, frame):
    for owner in owners:
        if owner.animation_data:
            for track in owner.animation_data.nla_tracks:
                track.mute = track.name != clip
    reaction.location = (0, 0, 0)
    reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for side in ('L', 'R'):
        bpy.data.objects['LID_' + side].scale = (0.003, 0.004, 0.001)
    scene.frame_set(frame)
    bpy.context.view_layer.update()

def evaluated(ob):
    item = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = item.to_mesh()
    points = [item.matrix_world @ vertex.co for vertex in mesh.vertices]
    faces = [tuple(face.vertices) for face in mesh.polygons]
    item.to_mesh_clear()
    return points, faces

clearance = []
def measure(tag):
    shell_points, shell_faces = evaluated(body)
    tree = BVHTree.FromPolygons(shell_points, shell_faces)
    points, _ = evaluated(core)
    samples = [tree.find_nearest(point) for point in points]
    signed = [(point - nearest).dot(normal) for point, (nearest, normal, _, _) in zip(points, samples)]
    clearance.append(dict(tag, vertices=len(points), min_distance=min(sample[3] for sample in samples),
                          max_signed_distance=max(signed), outside_vertices=sum(value >= -1e-5 for value in signed)))

for clip in ('Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak'):
    for frame in (1, 37, 73, 109, 145):
        pose(clip, frame)
        measure({'clip': clip, 'frame': frame})
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
    for item in (body, core):
        for key, value in zip(list(item.data.shape_keys.key_blocks)[1:], values):
            key.value = value
    reaction.scale = (1.065, 1.035, 0.925)
    reaction.rotation_euler = (0, -0.018, 0)
    bpy.context.view_layer.update()
    measure({'morph_corner': values, 'reaction': 'Click peak'})
assert all(item['outside_vertices'] == 0 for item in clearance), 'Inset escaped shell.'

pose('Sprout_Idle', 1)
for item in bpy.context.selected_objects:
    item.select_set(False)
for item in model.objects:
    item.select_set(True)
bpy.context.view_layer.objects.active = rig
settings = dict(filepath=output, export_format='GLB', use_selection=True, use_active_scene=True,
                export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                export_frame_step=1, export_anim_slide_to_zero=True, export_apply=False, export_def_bones=False,
                export_morph=True, export_morph_normal=True, export_morph_animation=True, export_normals=True,
                export_texcoords=True, export_vertex_color='ACTIVE', export_all_vertex_colors=True,
                export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True)
valid = bpy.ops.export_scene.gltf.get_rna_type().properties
assert all(key in valid for key in settings)
assert settings['export_format'] in [item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context)]
bpy.ops.export_scene.gltf(**settings)
data = open(output, 'rb').read()
assert data[:4] == b'glTF'
length, kind = struct.unpack_from('<II', data, 12)
assert kind == 0x4e4f534a
doc = json.loads(data[20:20 + length])
assert all(name in doc['extensionsUsed'] for name in ('KHR_materials_volume', 'KHR_materials_transmission', 'KHR_materials_ior'))
assert len(doc['skins'][0]['joints']) == 9
assert len(doc['animations']) == 6
assert hashlib.sha256(b''.join(struct.pack('<fff', *vertex.co) for vertex in body.data.vertices)).hexdigest() == body_digest
pose('Sprout_Idle', 1)
bpy.ops.wm.save_as_mainfile(filepath=editable, copy=True)
nodes = doc['nodes']
report = {'variant': 'core-refined', 'path': output, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
          'editable_source': editable, 'editable_source_sha256': hashlib.sha256(open(editable, 'rb').read()).hexdigest(),
          'immutable_source': source, 'immutable_source_sha256': source_hash, 'blender': bpy.app.version_string,
          'generator': doc['asset']['generator'], 'settings': settings, 'body_settings': shell_values,
          'volume': {'thickness': 0.34, 'attenuation_distance': 4.5, 'attenuation_srgb': [0.75, 0.94, 1.0]},
          'core': {'name': core.name, 'vertices': len(core.data.vertices), 'bone': 'BODY', 'emission_strength': 0.16,
                   'colour_attribute': 'Core_Blue', 'morph_names': [key.name for key in core.data.shape_keys.key_blocks][1:],
                   'clearance_samples': clearance},
          'materials': doc.get('materials'), 'extensions': doc['extensionsUsed'],
          'animations': [{'name': clip['name'], 'channels': [{'node': nodes[channel['target']['node']].get('name'),
                              'path': channel['target']['path']} for channel in clip['channels']]} for clip in doc['animations']],
          'body_basis_unchanged': True,
          'scope': 'New unaccepted owned study. Original B/C, v002, live Blender, and public assets remain unchanged.'}
with open(output.replace('.glb', '.manifest.json'), 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == source_hash
print(json.dumps({'path': output, 'sha256': report['sha256'], 'bytes': len(data), 'editable': editable,
                  'core_min_clearance': min(item['min_distance'] for item in clearance)}))
