"""Mirror the runtime's fixed tapered cards in a new owned lighting source.

No render, model/GLB mutation, public promotion, or live Blender mutation.
"""
import bpy
import hashlib
import json
import os
from mathutils import Matrix, Vector

BASE = os.path.dirname(os.path.abspath(__file__))
source = bpy.data.filepath
filename = os.path.basename(source)
assert filename in ('sprout-core-refined-v003.blend', 'sprout-core-luminous-v003.blend', 'sprout-core-royal-v003.blend', 'sprout-core-prism-v003.blend', 'sprout-clear-prism-v003.blend', 'sprout-clear-prism-rim-v003.blend')
is_luminous = filename == 'sprout-core-luminous-v003.blend'
is_royal = filename == 'sprout-core-royal-v003.blend'
is_prism = filename == 'sprout-core-prism-v003.blend'
is_clear_prism = filename == 'sprout-clear-prism-v003.blend'
is_clear_rim = filename == 'sprout-clear-prism-rim-v003.blend'
digest = hashlib.sha256(open(source, 'rb').read()).hexdigest()
with open(os.path.join(BASE, filename.replace('.blend', '.manifest.json')), encoding='utf8') as handle:
    manifest = json.load(handle)
assert digest == manifest['editable_source_sha256']
name = 'clear-prism-rim-matched-v003' if is_clear_rim else 'clear-prism-matched-v003' if is_clear_prism else 'core-prism-matched-v003' if is_prism else 'core-royal-matched-v003' if is_royal else 'core-luminous-lighting-v003' if is_luminous else 'core-tapered-v003'
model_name = filename.replace('.blend', '.glb')
output = os.path.join(BASE, 'source', 'sprout-' + name + '.blend')
assert not os.path.exists(output), 'Create a new lighting checkpoint.'
scene = next(scene for scene in bpy.data.scenes if scene.name.startswith('INSIGHTOS_Sprout_v003'))
bpy.context.window.scene = scene
collection = bpy.data.collections.new('SPROUT_REFLECTION_STUDY_v003')
scene.collection.children.link(collection)
profile = [(-0.12, -0.5)]
segments = [(-0.4, -0.44, -0.5, -0.15, -0.32, 0.08),
            (-0.12, 0.3, -0.1, 0.43, 0, 0.5),
            (0.16, 0.56, 0.34, 0.43, 0.28, 0.29),
            (0.22, 0.15, 0.36, -0.1, 0.4, -0.32),
            (0.42, -0.46, 0.12, -0.55, -0.12, -0.5)]
for x1, y1, x2, y2, x3, y3 in segments:
    x0, y0 = profile[-1]
    for index in range(1, 25):
        t = index / 24
        u = 1 - t
        profile.append((u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
                        u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3))
profile.pop()  # Last cubic closes back to start.

def create_card(name, position, width, height, rgb, intensity, tapered=True):
    # Three's +Y up/+Z front becomes Blender +Z up/-Y front.
    location = Vector((position[0], -position[2], position[1]))
    normal = (-location).normalized()
    right = Vector((0, 0, 1)).cross(normal).normalized()
    up = normal.cross(right).normalized()
    coordinates = profile if tapered else [(-.5, -.5), (-.5, .5), (.5, .5), (.5, -.5)]
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata([(x * width, y * height, 0) for x, y in coordinates], [], [tuple(reversed(range(len(coordinates))))])
    mesh.update()
    item = bpy.data.objects.new(name, mesh)
    collection.objects.link(item)
    item.matrix_world = Matrix((right, up, normal)).transposed().to_4x4()
    item.location = location
    mat = bpy.data.materials.new(name + '_Emission')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for node in list(nodes):
        nodes.remove(node)
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (*rgb, 1)
    emission.inputs['Strength'].default_value = intensity
    output_node = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emission.outputs['Emission'], output_node.inputs['Surface'])
    mesh.materials.append(mat)
    return {'name': name, 'position_three': position, 'position_blender': list(location),
            'width': width, 'height': height, 'colour_linear': rgb, 'intensity': intensity,
            'shape': 'fixed normalized cubic profile' if tapered else 'rectangle'}

if is_royal or is_prism or is_clear_prism or is_clear_rim:
    cards = [create_card('REFLECTION_sprout_key_v003', [-3.5, 3.8, 3], 1.55, 3.4, [1, .95, .9], 18),
             create_card('REFLECTION_sprout_fill_v003', [3.2, 1.5, 2], 1.1, 3.2, [.95, 1, 1], 18),
             create_card('REFLECTION_sprout_rim_v003', [1.2, 3, -2], 2.8, .9, [.84, 1, .95], 16, False),
             create_card('REFLECTION_sprout_upper_v003', [-.3, 2.4, 3.4], 4.3, .85, [.95, 1, 1], 20)]
else:
    cards = [create_card('REFLECTION_sprout_key_v003', [-3.5, 3.8, 3], 1.15, 3.4, [1, .95, .9], 6),
             create_card('REFLECTION_sprout_fill_v003', [3.2, 1.5, 2], .75, 2.6, [.75, .92, 1], .8),
             create_card('REFLECTION_sprout_rim_v003', [1.2, 3, -2], 2.8, .9, [1, 1, 1], 6.4, False)]
if is_luminous:
    cards.extend([create_card('REFLECTION_sprout_upper_v003', [-.3, 2.4, 3.4], 4.3, .65, [.95, 1, 1], 5),
                  create_card('REFLECTION_sprout_lavender_v003', [-2.2, -1.6, 1.8], 3.2, .85, [.66, .50, 1], 3.2),
                  create_card('REFLECTION_sprout_coral_v003', [2.2, -1.4, 1.5], 2.8, .75, [1, .64, .55], 3.4)])
lights = []
for role in ('key', 'fill', 'rim'):
    light = bpy.data.objects['LGT_sprout_' + role]
    assert hasattr(light.data, 'specular_factor') and hasattr(light, 'visible_glossy')
    light.data.specular_factor = 0
    light.visible_glossy = False
    lights.append({'role': role, 'energy': light.data.energy, 'specular_factor': light.data.specular_factor,
                   'visible_glossy': light.visible_glossy})
assert all(item.name not in bpy.data.collections['SPROUT_MODEL'].objects for item in collection.objects)
bpy.ops.wm.save_as_mainfile(filepath=output, copy=True)
report = {'source': source, 'source_sha256': digest, 'lighting_source': output,
          'lighting_source_sha256': hashlib.sha256(open(output, 'rb').read()).hexdigest(),
          'model_glb': os.path.join(BASE, model_name),
          'model_glb_sha256': hashlib.sha256(open(os.path.join(BASE, model_name), 'rb').read()).hexdigest(),
          'blender': bpy.app.version_string, 'cards': cards, 'profile_start': [-.12, -.5], 'profile_cubics': segments,
          'unchanged_diffuse_lights': lights, 'scope': 'Supporting fixed-card Cycles recipe mirrored from runtime tapered trial. Physical diffuse lighting/raster PMREM differ; no pixel-equivalence, model export, public promotion, or render performed.'}
with open(os.path.join(BASE, 'proofs', name + '.json'), 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == digest
print(json.dumps({'path': output, 'sha256': report['lighting_source_sha256'], 'cards': len(cards)}))
