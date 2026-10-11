"""Fuse the approved source masses and finalize the runtime basis before keys.

This operation touches only SPROUT_BODY and the owned face mesh datablocks.
Never rerun on an already keyed/skinned asset; preserve that asset first.
"""
import bpy
import bmesh
import json
import math
import os
from mathutils import Vector

BASE = r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
scene = bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene = scene
model = bpy.data.collections['SPROUT_MODEL']
sources = bpy.data.collections['SPROUT_PROXIES']
assert bpy.data.objects.get('SPROUT_BODY') is None, 'Preserve existing runtime body before rebuilding.'
vertices, faces = [], []
for source in sources.objects:
    if source.type != 'MESH':
        continue
    offset = len(vertices)
    vertices.extend(tuple(source.matrix_world @ v.co) for v in source.data.vertices)
    faces.extend(tuple(offset+i for i in p.vertices) for p in source.data.polygons)
mesh = bpy.data.meshes.new('SPROUT_BODY_RuntimeBasis')
mesh.from_pydata(vertices, [], faces)
mesh.update()
body = bpy.data.objects.new('SPROUT_BODY', mesh)
model.objects.link(body)
body.parent = bpy.data.objects['REACTION_ROOT']

for ob in bpy.context.selected_objects:
    ob.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active = body
assert body.mode == 'OBJECT'
mesh.remesh_voxel_size = 0.047
bpy.ops.object.voxel_remesh()

# Smooth only the new unkeyed runtime surface; source masses remain editable.
bm = bmesh.new()
bm.from_mesh(body.data)
for _ in range(12):
    bmesh.ops.smooth_vert(bm, verts=list(bm.verts), factor=0.42,
                         use_axis_x=True, use_axis_y=True, use_axis_z=True)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(body.data)
bm.free()
body.data.materials.clear()
body.data.materials.append(bpy.data.materials['MAT_Sprout_Clay'])
for p in body.data.polygons:
    p.use_smooth = True

# Spherical UV map supplies a stable optional texture basis before morphs.
uv = body.data.uv_layers.new(name='SproutUV')
for p in body.data.polygons:
    us = []
    for li in p.loop_indices:
        co = body.data.vertices[body.data.loops[li].vertex_index].co
        u = (math.atan2(co.y,co.x)/(2*math.pi)+0.5)
        v = max(0.0,min(1.0,(co.z+1.10)/2.36))
        us.append((li,u,v))
    seam = max(x[1] for x in us)-min(x[1] for x in us)>0.5
    for li,u,v in us:
        uv.data[li].uv = (u+1 if seam and u<0.5 else u, v)

# Reduce face tessellation before rigging; small glossy silhouettes stay smooth.
for side in ['L','R']:
    for prefix, scale, seg, rings in [
        ('EYE_', (0.177,0.080,0.235), 28, 20),
        ('GLINT_', (0.048,0.019,0.060), 16, 12),
    ]:
        ob=bpy.data.objects[prefix+side]
        old_mesh=ob.data
        m=bpy.data.meshes.new(prefix+side+'_RuntimeBasis')
        bm=bmesh.new()
        bmesh.ops.create_uvsphere(bm,u_segments=seg,v_segments=rings,radius=1)
        for v in bm.verts:
            v.co.x*=scale[0];v.co.y*=scale[1];v.co.z*=scale[2]
        bm.to_mesh(m);bm.free()
        for material in old_mesh.materials:
            m.materials.append(material)
        for p in m.polygons:p.use_smooth=True
        ob.data=m

sources.hide_render = True
sources.hide_viewport = True
bpy.data.objects['PROXY_Sprout_Bounds'].hide_render = True
bpy.data.objects['PROXY_Sprout_Bounds'].hide_set(True)
scene.camera=bpy.data.objects['CAM_sprout_hero']
bpy.context.view_layer.update()

bm=bmesh.new();bm.from_mesh(body.data)
nonmanifold=sum(not e.is_manifold for e in bm.edges)
bm.free()
body.data.calc_loop_triangles()
report={'body_vertices':len(body.data.vertices),'body_triangles':len(body.data.loop_triangles),
        'nonmanifold_edges':nonmanifold,'dimensions':list(body.dimensions),
        'runtime_mesh_vertices':sum(len(o.data.vertices) for o in model.objects if o.type=='MESH'),
        'source_masses_preserved':[o.name for o in sources.objects],
        'topology_finalized_before_keys':body.data.shape_keys is None}
assert nonmanifold==0, report
with open(os.path.join(BASE,'proofs','geometry-audit.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report))
