"""Replace the authored aperture study with the approved continuous ribbon.

The old study mesh stays in Blender as a recoverable datablock. Only our
semantic hero object changes. Geometry is explicit, closed and glTF portable.
"""
import bpy, bmesh, math
from mathutils import Vector

scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
ob = bpy.data.objects.get('HERO_titanium_ribbon') or bpy.data.objects['HERO_titanium_aperture']
ob.name = 'HERO_titanium_ribbon'
vertices, faces = [], []
segments, sides = 160, 16
for i in range(segments + 1):
    t = i / segments
    angle = -0.45 + math.tau * 1.22 * t
    radius = 0.73 + 0.105 * math.sin(math.pi * t)
    center = Vector((radius * math.cos(angle), radius * math.sin(angle), 1.01 - 2.02 * t))
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    tangent = Vector((-radius * math.sin(angle), radius * math.cos(angle), -2.02 / (math.tau * 1.22))).normalized()
    normal = tangent.cross(radial).normalized()
    twist = 0.30 + 0.55 * math.sin(math.tau * t - 0.35)
    wide = radial * math.cos(twist) + normal * math.sin(twist)
    thin = -radial * math.sin(twist) + normal * math.cos(twist)
    half_width = 0.13 + 0.065 * math.sin(math.pi * t) ** 0.6
    for j in range(sides):
        a = math.tau * j / sides
        vertices.append(tuple(center + wide * half_width * math.cos(a) + thin * 0.011 * math.sin(a)))
for i in range(segments):
    for j in range(sides):
        faces.append((i*sides+j, (i+1)*sides+j, (i+1)*sides+(j+1)%sides, i*sides+(j+1)%sides))
faces.append(tuple(reversed(range(sides))))
faces.append(tuple(segments*sides+j for j in range(sides)))
mesh = bpy.data.meshes.new('HERO_titanium_ribbon_mesh')
mesh.from_pydata(vertices, [], faces)
mesh.update()
bm = bmesh.new(); bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(mesh); bm.free()
ob.data = mesh
for polygon in mesh.polygons: polygon.use_smooth = True
pose = bpy.data.objects.get('RIG_ribbon_pose') or bpy.data.objects['RIG_aperture_pose']
pose.name = 'RIG_ribbon_pose'; pose.rotation_euler = (0, 0, -0.20)
spin = bpy.data.objects.get('RIG_ribbon_spin') or bpy.data.objects['RIG_aperture_spin']
spin.name = 'RIG_ribbon_spin'
ob['geometry_intent'] = 'one continuous asymmetrical titanium ribbon; 1.22 turns'
ob['section_thickness_m'] = 0.022
ob['center_radius_m'] = 0.73
camera = scene.camera
camera.location = (0.35, -5.8, 0.75)
camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.ortho_scale = 2.72
bpy.context.view_layer.update()
print({'stage':'ribbon_blockout', 'dimensions':list(ob.dimensions), 'minimum_ribbon_radius':min(v.co.length for v in mesh.vertices), 'camera':list(camera.location), 'ortho_scale':camera.data.ortho_scale, 'path':bpy.data.filepath})
