"""CPU-only combined attention/clip containment check on the owned refined C.

No asset export or source save. BODY.scale is bone-local in both Blender and
glTF; REACTION_ROOT/mount axes below explicitly convert the scene's Z-up.
"""
import bpy
import hashlib
import json
import math
import os
from mathutils.bvhtree import BVHTree

BASE = os.path.dirname(os.path.abspath(__file__))
source = bpy.data.filepath
assert os.path.basename(source) in ('sprout-core-refined-v003.blend', 'sprout-core-luminous-v003.blend', 'sprout-core-royal-v003.blend')
checkpoint = os.path.basename(source).replace('.blend', '')
with open(os.path.join(BASE, checkpoint + '.manifest.json'), encoding='utf8') as handle:
    manifest = json.load(handle)
digest = hashlib.sha256(open(source, 'rb').read()).hexdigest()
assert digest == manifest['editable_source_sha256']
scene = next(scene for scene in bpy.data.scenes if scene.name.startswith('INSIGHTOS_Sprout_v003'))
bpy.context.window.scene = scene
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects['SPROUT_CORE']
rig = bpy.data.objects['RIG_Sprout']
root = bpy.data.objects['SPROUT_ROOT']
reaction = bpy.data.objects['REACTION_ROOT']
owners = [rig, body.data.shape_keys, core.data.shape_keys, reaction, bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
for item in (body, core):
    # Three allows additive morph weights above1. Blender's UI slider otherwise
    # clamps this source-only worst-case probe and would understate its envelope.
    item.data.shape_keys.key_blocks['Jelly_Squash'].slider_max = 3.0

def evaluated(ob):
    item = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = item.to_mesh()
    points = [item.matrix_world @ vertex.co for vertex in mesh.vertices]
    faces = [tuple(face.vertices) for face in mesh.polygons]
    item.to_mesh_clear()
    return points, faces

rows = []
for clip in ('Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak', 'Sprout_Click'):
    frames = (1, 37, 73, 109, 145) if clip != 'Sprout_Click' else (3,)
    for frame in frames:
        for level in (0.296, 1.0):
            active = [clip] if clip != 'Sprout_Click' else ['Sprout_Idle', 'Sprout_Click']
            for owner in owners:
                if owner.animation_data:
                    for track in owner.animation_data.nla_tracks:
                        track.mute = track.name not in active
            reaction.location = (0, 0, 0)
            reaction.rotation_euler = (0, 0, 0)
            reaction.scale = (1, 1, 1)
            for side in ('L', 'R'):
                bpy.data.objects['LID_' + side].scale = (0.003, 0.004, 0.001)
            # Common mount rotation tests coordinates/camera-envelope motivation;
            # containment is invariant to this shared rigid transform.
            root.rotation_euler = (math.radians(-6), 0, math.radians(10))
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            baseline = tuple(rig.pose.bones['BODY'].scale)
            scale = (1 + 0.055 * level, 1 - 0.085 * level, 1 + 0.055 * level)
            rig.pose.bones['BODY'].scale = tuple(x * y for x, y in zip(baseline, scale))
            for ob in (body, core):
                key = ob.data.shape_keys.key_blocks['Jelly_Squash']
                key.value += level
            bpy.context.view_layer.update()
            assert max(abs(x - y * z) for x, y, z in zip(rig.pose.bones['BODY'].scale, baseline, scale)) < 1e-6
            shell_points, shell_faces = evaluated(body)
            tree = BVHTree.FromPolygons(shell_points, shell_faces)
            points, _ = evaluated(core)
            samples = [tree.find_nearest(point) for point in points]
            signed = [(point - nearest).dot(normal) for point, (nearest, normal, _, _) in zip(points, samples)]
            bounds = lambda pts: {'min': [min(point[index] for point in pts) for index in range(3)],
                                  'max': [max(point[index] for point in pts) for index in range(3)]}
            rows.append({'clip': clip, 'frame': frame, 'attention_level': level,
                         'BODY_local_scale_multiplier': scale, 'BODY_evaluated_scale': list(rig.pose.bones['BODY'].scale),
                         'combined_squash': {'shell': body.data.shape_keys.key_blocks['Jelly_Squash'].value,
                                             'core': core.data.shape_keys.key_blocks['Jelly_Squash'].value},
                         'reaction_scale_blender': list(reaction.scale),
                         'outside_core_vertices': sum(value >= -1e-5 for value in signed),
                         'min_clearance': min(sample[3] for sample in samples), 'max_signed_distance': max(signed),
                         'shell_world_bounds': bounds(shell_points), 'core_world_bounds': bounds(points)})
report = {'source': source, 'source_sha256': digest, 'blender': bpy.app.version_string,
          'asset_sha256': manifest['sha256'],
          'pass': all(row['outside_core_vertices'] == 0 for row in rows),
          'minimum_clearance': min(row['min_clearance'] for row in rows), 'sample_count': len(rows), 'samples': rows,
          'scope': 'Source geometry, 42 combined authored-clip/attention states. Shared10degree yaw/-6degree pitch; measured .296lag plus configured1bound. No GPU, browser pixels, GLB pose, camera-frustum, or runtime mixer acceptance.'}
output = os.path.join(BASE, 'proofs', checkpoint.replace('sprout-', '') + '-attention-clearance.json')
with open(output, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == digest
assert report['pass'], 'Core escaped shell under combined motion.'
print(json.dumps({'output': output, 'pass': report['pass'], 'minimum_clearance': report['minimum_clearance'], 'samples': len(rows)}))
