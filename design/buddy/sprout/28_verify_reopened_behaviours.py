"""Reopen-source/full-mesh envelope audit, without saving or rendering."""
import bpy
import hashlib
import json
import os
from mathutils.bvhtree import BVHTree

BASE = os.path.dirname(os.path.abspath(__file__))
source = os.path.realpath(bpy.data.filepath)
assert os.path.basename(source) == 'sprout-prism-behaviours-v004.blend'
source_hash = hashlib.sha256(open(source, 'rb').read()).hexdigest()
manifest_path = os.path.join(BASE, 'sprout-prism-v004.manifest.json')
manifest = json.load(open(manifest_path, encoding='utf8'))
assert source_hash == manifest['editable_source_sha256']
scene = bpy.data.scenes['INSIGHTOS_Sprout_v004_behaviours']
bpy.context.window.scene = scene
rig = bpy.data.objects['RIG_Sprout']
body = bpy.data.objects['SPROUT_BODY']
core = bpy.data.objects['SPROUT_CORE']
reaction = bpy.data.objects['REACTION_ROOT']
lids = [bpy.data.objects['LID_' + side] for side in ('L', 'R')]
owners = [rig, body.data.shape_keys, core.data.shape_keys, reaction, *lids]
assert len(rig.pose.bones) == 9
assert [key.name for key in body.data.shape_keys.key_blocks] == [key.name for key in core.data.shape_keys.key_blocks] == ['Basis', 'Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R']
assert bpy.data.objects['FACE_ANCHOR'].parent_bone == 'FACE_MOUNT'
assert all(bpy.data.objects['CLOSED_EYE_'+s].parent == bpy.data.objects['LID_'+s] for s in ('L', 'R'))
model = [ob for ob in bpy.data.collections['SPROUT_MODEL'].objects if ob.type == 'MESH']
assert len(model) == 11
actual_clips = {track.name for owner in owners if owner.animation_data for track in owner.animation_data.nla_tracks}
assert actual_clips == set(manifest['retained_clips']) | set(manifest['new_clips'])

def evaluated(ob):
    item = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = item.to_mesh()
    points = [item.matrix_world @ v.co for v in mesh.vertices]
    faces = [tuple(p.vertices) for p in mesh.polygons]
    item.to_mesh_clear()
    return points, faces

def box(points):
    points = [(p.x, p.z, -p.y) for p in points]
    return {'min': [min(p[a] for p in points) for a in range(3)],
            'max': [max(p[a] for p in points) for a in range(3)]}

rows = []
for clip, spec in manifest['new_clips'].items():
    union = {'min': [float('inf')]*3, 'max': [float('-inf')]*3}
    active = ['Sprout_Idle', clip] if clip == 'Sprout_Done' else [clip]
    for frame in range(1, spec['frames'] + 1):
        for owner in owners:
            if owner.animation_data:
                owner.animation_data.action = None
                for track in owner.animation_data.nla_tracks:
                    track.mute = track.name not in active
        reaction.location = (0, 0, 0)
        reaction.rotation_euler = (0, 0, 0)
        reaction.scale = (1, 1, 1)
        for lid in lids:
            lid.scale = (.003, .004, .001)
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        points = []
        for ob in model:
            p, _ = evaluated(ob)
            points.extend(p)
        bounds = box(points)
        for axis in range(3):
            union['min'][axis] = min(union['min'][axis], bounds['min'][axis])
            union['max'][axis] = max(union['max'][axis], bounds['max'][axis])
        if frame in (1, spec['frames']) or frame in [round(t*scene.render.fps)+1 for t in spec['beats'].values()]:
            shell_points, shell_faces = evaluated(body)
            core_points, _ = evaluated(core)
            tree = BVHTree.FromPolygons(shell_points, shell_faces)
            nearest = [tree.find_nearest(p) for p in core_points]
            signed = [(p-hit[0]).dot(hit[1]) for p,hit in zip(core_points, nearest)]
            assert all(d < -1e-5 for d in signed), 'Reopened core escaped shell.'
            lids_closed = all(abs(lid.scale.x-1) < 1e-6 and abs(lid.scale.z-1) < 1e-6 for lid in lids)
            row = {'clip': clip, 'frame': frame, 'bounds_all11meshes_gltf': bounds,
                   'outside_core_vertices': sum(d >= -1e-5 for d in signed),
                   'minimum_core_clearance': min(hit[3] for hit in nearest),
                   'sleep_lids_closed': lids_closed if clip == 'Sprout_SleepLoop' else 'not_asserted'}
            if clip == 'Sprout_SleepLoop' and frame == 1:
                lid_points = [point for ob in lids for point in evaluated(ob)[0]]
                lid_bounds = box(lid_points)
                row['head_emitter_anchor_gltf'] = [0, lid_bounds['max'][1] + .05, (lid_bounds['min'][2]+lid_bounds['max'][2])/2]
                manifest['sleeping_hold']['head_emitter_anchor_gltf'] = row['head_emitter_anchor_gltf']
                manifest['sleeping_hold']['bounds_all11meshes_gltf'] = bounds
            rows.append(row)
    spec.setdefault('bounds_shell_only', spec['bounds'])
    spec['bounds'] = union
    spec['bounds_sample_count'] = spec['frames']
    spec['bounds_scope'] = 'All11evaluated mesh vertices, every authored24Hz frame; continuous subframe extrema/native projection/Z path belong to integration.'

report = {'source': source, 'source_sha256': source_hash, 'asset_sha256': manifest['sha256'],
          'pass': True, 'scene': scene.name, 'bones': len(rig.pose.bones), 'meshes': len(model),
          'clips': sorted(actual_clips), 'sample_count': sum(spec['frames'] for spec in manifest['new_clips'].values()),
          'all_mesh_bounds': {clip: spec['bounds'] for clip,spec in manifest['new_clips'].items()},
          'minimum_core_clearance': min(row['minimum_core_clearance'] for row in rows), 'keyposes': rows,
          'scope': 'Reopened editable source, complete11mesh authored-frame envelopes and sampled core containment. No save/live scene mutation/GPU/native/display proof.'}
output = os.path.join(BASE, 'proofs', 'v004-reopened-source.json')
with open(output, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
manifest['reopened_source_audit'] = {'path': output, 'sha256': hashlib.sha256(open(output, 'rb').read()).hexdigest(), 'pass': True}
with open(manifest_path, 'w', encoding='utf8') as handle:
    json.dump(manifest, handle, indent=2)
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == source_hash
print(json.dumps({'report': output, 'pass': True, 'minimum_clearance': report['minimum_core_clearance'], 'all_mesh_bounds': report['all_mesh_bounds'], 'head_anchor': manifest['sleeping_hold']['head_emitter_anchor_gltf']}))
