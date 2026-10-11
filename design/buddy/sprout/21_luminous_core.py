"""New luminous C checkpoint with one original portable colour/emission map.

No runtime shader, alpha trick, source overwrite, public promotion, or render.
The PNG is an analytically authored material data map, not reference pixels.
"""
import bpy
import hashlib
import json
import math
import os
import struct
import sys
import zlib
from mathutils.bvhtree import BVHTree

if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
import io_scene_gltf2

BASE = os.path.dirname(os.path.abspath(__file__))
source = bpy.data.filepath
assert os.path.basename(source) == 'sprout-core-refined-v003.blend'
source_hash = hashlib.sha256(open(source, 'rb').read()).hexdigest()
assert source_hash == '70e6f1f95a82f0f9040f0c5537cb922c78969656a3d438d2ad172392b3ec529d'
variant = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'luminous'
assert variant in ('luminous', 'royal', 'prism')
checkpoint = 'sprout-core-' + variant + '-v003'
output = os.path.join(BASE, checkpoint + '.glb')
editable = os.path.join(BASE, 'source', checkpoint + '.blend')
texture_file = os.path.join(BASE, 'textures', 'sprout-core-' + ('light' if variant == 'luminous' else variant) + '-v003.png')
assert not any(os.path.exists(path) for path in (output, editable, texture_file)), 'New checkpoint required.'
scene = bpy.data.scenes['INSIGHTOS_Sprout_v003_core_refined']
bpy.context.window.scene = scene
scene.name = 'INSIGHTOS_Sprout_v003_core_' + variant
if variant in ('royal', 'prism'):
    # Verified in the installed OCIO config and an isolated assignment probe.
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
body, core, rig = [bpy.data.objects[name] for name in ('SPROUT_BODY', 'SPROUT_CORE', 'RIG_Sprout')]
reaction = bpy.data.objects['REACTION_ROOT']
body_digest = hashlib.sha256(b''.join(struct.pack('<fff', *point.co) for point in body.data.vertices)).hexdigest()

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t*t*(3-2*t)

def mix(a, b, t):
    return tuple(x + (y-x)*t for x, y in zip(a, b))

def linear(x):
    return x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4

def rgba(rgb):
    return tuple(linear(value) for value in rgb) + (1,)

width, height = 128, 64
pixels = bytearray()
for py in range(height):
    pixels.append(0)  # PNG filter0, rows stored top to bottom.
    v = 1 - (py + .5)/height
    nz = math.sin((v-.5)*math.pi)
    radius = math.sqrt(max(0, 1-nz*nz))
    for px in range(width):
        phi = (px+.5)/width*2*math.pi
        nx = math.cos(phi)*radius
        projected_radius = math.sqrt(nx*nx + nz*nz)
        blue = mix((.015, .61, 1), (.005, .43, 1), smooth(-.7, .7, nz)) if variant == 'luminous' else mix((.015, .40, 1), (.005, .28, 1), smooth(-.7, .7, nz))
        edge = smooth(.40, .99, projected_radius)**1.2
        rgb = mix(blue, (.025, .87, 1), edge*.78)
        lower = math.exp(-((nz+.65)/.43)**2)
        lateral = .32 + .68*smooth(.08, .90, abs(nx))
        tint = mix((.70, .40, 1), (1, .69, .46), smooth(-.63, .63, nx))
        if variant == 'prism':
            # Broad lower flanks with little tint on the central blue face.
            lower = math.exp(-((nz+.40)/.55)**2)
            lateral = .05 + .95*smooth(.08, .70, abs(nx))
            rgb = mix(rgb, tint, lower*lateral*.84)
        else:
            rgb = mix(rgb, tint, lower*lateral*.60)
        pixels.extend(round(max(0, min(1, value))*255) for value in rgb)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data)&0xffffffff)

png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
png += chunk(b'sRGB', b'\x00') + chunk(b'IDAT', zlib.compress(bytes(pixels), 9)) + chunk(b'IEND', b'')
os.makedirs(os.path.dirname(texture_file), exist_ok=True)
with open(texture_file, 'wb') as handle:
    handle.write(png)
image = bpy.data.images.load(texture_file)
image.name = 'TEX_Sprout_Core_' + variant + '_v003'
assert 'sRGB' in [item.identifier for item in image.colorspace_settings.bl_rna.properties['name'].enum_items]
image.colorspace_settings.name = 'sRGB'
image.pack()  # Editable source is portable; original PNG remains reviewable.

# UVs derive from the original sphere parameterization, before narrower X.
uvs = core.data.uv_layers.new(name='Core_Light_UV')
for polygon in core.data.polygons:
    coordinates = []
    for loop_index in polygon.loop_indices:
        index = core.data.loops[loop_index].vertex_index
        x, y, z = core.data.shape_keys.key_blocks['Basis'].data[index].co
        nz = max(-1, min(1, (z+.005)/.77))
        offset = .020*math.sin(nz*math.pi*1.3)*(1-nz*nz)
        nx = (x-offset)/(.84*(1-.13*nz))
        ny = (y+.025)/.47
        u = math.atan2(ny, nx)/(2*math.pi)%1
        v = .5+math.asin(nz)/math.pi
        coordinates.append([loop_index, u, v])
    if max(item[1] for item in coordinates)-min(item[1] for item in coordinates) > .5:
        for item in coordinates:
            if item[1] < .5:
                item[1] += 1
    for loop_index, u, v in coordinates:
        uvs.data[loop_index].uv = (u, v)
core.data.uv_layers.active = uvs
for key in core.data.shape_keys.key_blocks:
    for point in key.data:
        point.co.x *= .89
for index, vertex in enumerate(core.data.vertices):
    vertex.co = core.data.shape_keys.key_blocks['Basis'].data[index].co
for attribute in core.data.color_attributes:
    for point in attribute.data:
        point.color = (1, 1, 1, 1)  # No unintended texture/vertex double tint.

mat = core.data.materials[0]
mat.name = 'MAT_Sprout_CoreLuminous_v003'
shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
for node in list(mat.node_tree.nodes):
    if node.type == 'VERTEX_COLOR':
        mat.node_tree.nodes.remove(node)
map_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
map_node.image = image
map_node.interpolation = 'Linear'
map_node.extension = 'REPEAT'
uv_node = mat.node_tree.nodes.new('ShaderNodeUVMap')
uv_node.uv_map = 'Core_Light_UV'
mat.node_tree.links.new(uv_node.outputs['UV'], map_node.inputs['Vector'])
mat.node_tree.links.new(map_node.outputs['Color'], shader.inputs['Base Color'])
mat.node_tree.links.new(map_node.outputs['Color'], shader.inputs['Emission Color'])
shader.inputs['Emission Strength'].default_value = 1.1
shader.inputs['Roughness'].default_value = .15
shader.inputs['Coat Weight'].default_value = .04
shader.inputs['Coat Roughness'].default_value = .10
shell = body.data.materials[0]
shell.name = 'MAT_Sprout_GlassLuminous_v003'
shell_shader = next(node for node in shell.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
shell_shader.inputs['Transmission Weight'].default_value = .88
shell_shader.inputs['Roughness'].default_value = .060
for point in body.data.vertices:
    x, y, z = point.co
    blue = mix((.08, .66, 1), (.13, .88, 1), smooth(-.8, .9, z))
    lower = math.exp(-((z+.60)/.53)**2)
    lateral = .35+.65*smooth(.17, .85, abs(x))
    tint = mix((.68, .46, 1), (1, .75, .62), smooth(-.65, .65, x))
    body.data.color_attributes['Prism_Color'].data[point.index].color = rgba(mix(blue, tint, lower*lateral*.52))

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
        bpy.data.objects['LID_'+side].scale = (.003, .004, .001)
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
for clip in ('Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak'):
    for frame in (1, 37, 73, 109, 145):
        pose(clip, frame)
        shell_points, shell_faces = evaluated(body)
        tree = BVHTree.FromPolygons(shell_points, shell_faces)
        points, _ = evaluated(core)
        samples = [tree.find_nearest(point) for point in points]
        signed = [(point-nearest).dot(normal) for point, (nearest, normal, _, _) in zip(points, samples)]
        clearance.append({'clip': clip, 'frame': frame, 'min_distance': min(sample[3] for sample in samples),
                          'outside_vertices': sum(value >= -1e-5 for value in signed), 'max_signed_distance': max(signed)})
assert all(item['outside_vertices'] == 0 for item in clearance)
pose('Sprout_Idle', 1)
for item in bpy.context.selected_objects:
    item.select_set(False)
for item in bpy.data.collections['SPROUT_MODEL'].objects:
    item.select_set(True)
bpy.context.view_layer.objects.active = rig
settings = dict(filepath=output, export_format='GLB', use_selection=True, use_active_scene=True,
                export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                export_frame_step=1, export_anim_slide_to_zero=True, export_apply=False, export_def_bones=False,
                export_morph=True, export_morph_normal=True, export_morph_animation=True, export_normals=True,
                export_texcoords=True, export_vertex_color='ACTIVE', export_all_vertex_colors=True,
                export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True)
assert all(key in bpy.ops.export_scene.gltf.get_rna_type().properties for key in settings)
assert settings['export_format'] in [item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context)]
bpy.ops.export_scene.gltf(**settings)
data = open(output, 'rb').read()
length, kind = struct.unpack_from('<II', data, 12)
assert data[:4] == b'glTF' and kind == 0x4e4f534a
doc = json.loads(data[20:20+length])
assert len(doc.get('images', [])) == 1 and 'bufferView' in doc['images'][0]
emitted = next(material for material in doc['materials'] if material['name'] == mat.name)
# Blender may emit two texture definitions for the same one image/sampler.
# Verify actual shared image data instead of assuming identical texture indices.
emissive_texture = doc['textures'][emitted['emissiveTexture']['index']]
base_texture = doc['textures'][emitted['pbrMetallicRoughness']['baseColorTexture']['index']]
assert emissive_texture['source'] == base_texture['source'] == 0
assert emissive_texture.get('sampler') == base_texture.get('sampler')
assert all(name in doc['extensionsUsed'] for name in ('KHR_materials_volume', 'KHR_materials_transmission', 'KHR_materials_ior'))
assert len(doc['skins'][0]['joints']) == 9 and len(doc['animations']) == 6
assert hashlib.sha256(b''.join(struct.pack('<fff', *point.co) for point in body.data.vertices)).hexdigest() == body_digest
pose('Sprout_Idle', 1)
bpy.ops.wm.save_as_mainfile(filepath=editable, copy=True)
nodes = doc['nodes']
report = {'variant': 'core-' + variant, 'path': output, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
          'editable_source': editable, 'editable_source_sha256': hashlib.sha256(open(editable, 'rb').read()).hexdigest(),
          'immutable_source': source, 'immutable_source_sha256': source_hash, 'blender': bpy.app.version_string,
          'generator': doc['asset']['generator'], 'settings': settings, 'materials': doc['materials'],
          'extensions': doc['extensionsUsed'], 'images': doc['images'], 'textures': doc['textures'],
          'texture': {'path': texture_file, 'sha256': hashlib.sha256(png).hexdigest(), 'bytes': len(png),
                      'size': [width, height], 'colour_space': 'sRGB, original analytically generated RGB8 PNG',
                      'UV': 'Core_Light_UV, spherical parameterization before X narrowing, seam-unwrapped, repeat',
                      'source': 'Equations in21_luminous_core.py. No reference pixels/texture scroll/runtime shader.',
                      'packed_in_blend': True, 'embedded_in_glb': True, 'linear_emissive_strength': 1.1},
          'core': {'vertices': len(core.data.vertices), 'bone': 'BODY', 'narrowed_X_factor': .89,
                   'paired_morph_names': [key.name for key in core.data.shape_keys.key_blocks][1:], 'clearance_samples': clearance},
          'animations': [{'name': clip['name'], 'channels': [{'node': nodes[channel['target']['node']].get('name'),
                              'path': channel['target']['path']} for channel in clip['channels']]} for clip in doc['animations']],
          'body_basis_unchanged': True, 'scope': 'New unaccepted material checkpoint; no render/runtime promotion/live source mutation.'}
report['source_colour'] = {'view_transform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
                           'exposure': scene.view_settings.exposure}
report['texture']['centre_palette_srgb'] = [0.01, .52 if variant == 'luminous' else .34, 1]
report['texture']['lower_lobe'] = {'centre_nz': -.40, 'width': .55, 'lateral_strength': .84,
                                   'centre_mask_floor': .05} if variant == 'prism' else {'centre_nz': -.65, 'width': .43, 'lateral_strength': .60, 'centre_mask_floor': .32}
with open(output.replace('.glb', '.manifest.json'), 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == source_hash
print(json.dumps({'path': output, 'sha256': report['sha256'], 'bytes': len(data), 'source': editable,
                  'texture_sha256': report['texture']['sha256'], 'texture_bytes': len(png),
                  'minimum_clearance': min(item['min_distance'] for item in clearance)}))
