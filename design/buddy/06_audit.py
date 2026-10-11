"""Structural and evaluated motion audit; writes reviewable numerical evidence."""
import bpy, bmesh, json, os
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from mathutils.bvhtree import BVHTree
scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
heroes = [o for o in scene.objects if o.type == 'MESH' and o.name.startswith('HERO_')]
report = {'scene':scene.name,'active_filepath':bpy.data.filepath,
          'protected_scene_objects':sorted(o.name for o in bpy.data.scenes['Scene'].objects),
          'structure':[], 'motion_samples':[]}
for ob in heroes:
    bm = bmesh.new(); bm.from_mesh(ob.data)
    result = {'object':ob.name,'vertices':len(bm.verts),'faces':len(bm.faces),
        'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),
        'signed_volume':bm.calc_volume(signed=True),
        'parent':ob.parent.name if ob.parent else None,
        'material':ob.data.materials[0].name,
        'modifiers':[(m.name,m.type) for m in ob.modifiers]}
    assert result['non_manifold_edges'] == 0, result
    assert result['signed_volume'] > 0, result
    report['structure'].append(result); bm.free()
matrices = {}
for frame in [1,13,37,73,109,144,145]:
    scene.frame_set(frame); bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    coordinates = []
    for ob in heroes:
        evaluated = ob.evaluated_get(graph); mesh = evaluated.to_mesh()
        coordinates.extend(world_to_camera_view(scene,scene.camera,evaluated.matrix_world@v.co) for v in mesh.vertices)
        evaluated.to_mesh_clear()
    bounds = {'x':[min(v.x for v in coordinates),max(v.x for v in coordinates)],
              'y':[min(v.y for v in coordinates),max(v.y for v in coordinates)],
              'min_depth':min(v.z for v in coordinates)}
    assert bounds['x'][0] > 0.06 and bounds['x'][1] < 0.94, bounds
    assert bounds['y'][0] > 0.06 and bounds['y'][1] < 0.94, bounds
    assert bounds['min_depth'] > 0, bounds
    matrices[frame] = {ob.name:[v for row in ob.matrix_world for v in row] for ob in heroes}
    report['motion_samples'].append({'frame':frame,'camera_bounds':bounds})
report['seam_matrix_max_error'] = max(abs(a-b) for name in matrices[1] for a,b in zip(matrices[1][name],matrices[145][name]))
report['departure_matrix_max_delta'] = max(abs(a-b) for name in matrices[1] for a,b in zip(matrices[1][name],matrices[13][name]))
assert report['seam_matrix_max_error'] < 1e-5
assert report['departure_matrix_max_delta'] > 0.1
ring = bpy.data.objects['HERO_titanium_ribbon']
report['ring_min_vertex_radius_m'] = min(v.co.length for v in ring.data.vertices)
bm = bmesh.new(); bm.from_mesh(ring.data)
report['ring_min_surface_radius_m'] = BVHTree.FromBMesh(bm).find_nearest(Vector((0,0,0)))[3]
bm.free()
report['maximum_core_radius_m'] = 0.6*1.008
report['surface_clearance_m'] = report['ring_min_surface_radius_m']-report['maximum_core_radius_m']
assert report['surface_clearance_m'] > 0.025
assert report['protected_scene_objects'] == ['Camera','Cube','Light']
assert bpy.data.filepath == ''
report['camera'] = {'blender_position':list(scene.camera.location),'gltf_position':[scene.camera.location.x,scene.camera.location.z,-scene.camera.location.y], 'gltf_up':[0,1,0], 'target':[0,0,0],'orthographic_span':scene.camera.data.ortho_scale}
report['lights'] = [{'name':o.name,'gltf_position':[o.location.x,o.location.z,-o.location.y], 'watts':o.data.energy,'linear_rgb':list(o.data.color),'rectangle_size':[o.data.size,o.data.size_y]} for o in scene.objects if o.type=='LIGHT']
report['color_management'] = {'view_transform':scene.view_settings.view_transform,'exposure':scene.view_settings.exposure}
folder = r'D:\hackathon2026\insightos-ui\design\buddy'
with open(os.path.join(folder,'audit.json'),'w',encoding='utf8') as output: json.dump(report,output,indent=2)
scene.frame_set(1)
print(report)
