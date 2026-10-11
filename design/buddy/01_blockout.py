"""Staged live Blender authoring. Set PHASE then exec this source in Blender.

Each stage is idempotent and touches only INSIGHTOS_Buddy_v001 datablocks.
No startup defaults are deleted, reused, hidden, or recolored.
"""
import bpy
import bmesh
import math
from mathutils import Vector

SCENE_NAME = 'INSIGHTOS_Buddy_v001'
PHASE = globals().get('PHASE', 'bounds')

def collection(name, scene):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        scene.collection.children.link(col)
    return col

def empty(name, col, parent=None):
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, None)
        col.objects.link(ob)
    ob.parent = parent
    return ob

def mesh_object(name, vertices, faces, col, parent):
    ob = bpy.data.objects.get(name)
    if ob is None:
        mesh = bpy.data.meshes.new(name + '_mesh')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        ob = bpy.data.objects.new(name, mesh)
        col.objects.link(ob)
        ob.parent = parent
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    return ob

def ring_mesh(segments=96, sides=12):
    vertices, faces = [], []
    for i in range(segments):
        t = math.tau * i / segments
        radial = Vector((math.cos(t), 0, math.sin(t)))
        side = Vector((0, 1, 0))
        radius = 0.73 + 0.022 * math.cos(2 * t + 0.5)
        center = radial * radius + side * (0.045 * math.sin(2 * t))
        twist = t + 0.2 * math.sin(2 * t)
        u = radial * math.cos(twist) + side * math.sin(twist)
        v = -radial * math.sin(twist) + side * math.cos(twist)
        width = 0.064 + 0.011 * math.sin(t + 0.2)
        for j in range(sides):
            p = center + u * (width * math.cos(math.tau * j / sides)) + v * (0.0175 * math.sin(math.tau * j / sides))
            vertices.append(tuple(p))
    for i in range(segments):
        for j in range(sides):
            a, b = i * sides + j, ((i + 1) % segments) * sides + j
            faces.append((a, b, ((i + 1) % segments) * sides + (j + 1) % sides, i * sides + (j + 1) % sides))
    return vertices, faces

def flow_mesh(phase, segments=48, sides=8):
    vertices, faces = [], []
    for i in range(segments + 1):
        t = i / segments
        angle = -1.1 + t * 4.2 + phase
        radius = 0.31 + 0.045 * math.sin(math.pi * t)
        center = Vector((radius * math.cos(angle), radius * math.sin(angle), (t - 0.5) * 0.61))
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-radius * math.sin(angle), radius * math.cos(angle), 0.61 / 4.2)).normalized()
        binormal = tangent.cross(radial).normalized()
        width = 0.015 + 0.060 * math.sin(math.pi * t) ** 0.8
        for j in range(sides):
            a = math.tau * j / sides
            p = center + radial * width * math.cos(a) + binormal * 0.008 * math.sin(a)
            vertices.append(tuple(p))
    for i in range(segments):
        for j in range(sides):
            a, b = i * sides + j, (i + 1) * sides + j
            faces.append((a, b, (i + 1) * sides + (j + 1) % sides, i * sides + (j + 1) % sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(segments * sides + j for j in range(sides)))
    return vertices, faces

if PHASE == 'dry_run':
    print({'dry_run': True, 'create_scene': SCENE_NAME, 'protected': {s.name: [o.name for o in s.objects] for s in bpy.data.scenes}, 'planned_names': ['RIG_buddy_root', 'HERO_pearl_core', 'RIG_aperture_pose', 'RIG_aperture_spin', 'HERO_titanium_aperture', 'RIG_inner_flow', 'HERO_flow_sage', 'HERO_flow_cyan', 'HERO_flow_ivory', 'CAM_buddy_hero'], 'delete': []})
else:
    scene = bpy.data.scenes.get(SCENE_NAME)
    if scene is None:
        assert PHASE == 'bounds', 'Run bounds first'
        scene = bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    col = collection('INSIGHTOS_Buddy_Geometry_v001', scene)
    root = empty('RIG_buddy_root', col)
    if PHASE == 'bounds':
        scene.unit_settings.scale_length = 1.0
        scene.render.resolution_x = scene.render.resolution_y = 640
        scene.render.resolution_percentage = 100
        scene.render.fps = 24
        scene.frame_start, scene.frame_end = 1, 145
        scene.render.film_transparent = True
        camera_col = collection('INSIGHTOS_Buddy_Camera_v001', scene)
        cam = bpy.data.objects.get('CAM_buddy_hero')
        if cam is None:
            data = bpy.data.cameras.new('CAM_buddy_hero_data')
            cam = bpy.data.objects.new('CAM_buddy_hero', data)
            camera_col.objects.link(cam)
        data = cam.data
        valid = [i.identifier for i in data.bl_rna.properties['type'].enum_items]
        data.type = next(i for i in valid if i == 'ORTHO')
        data.ortho_scale = 2.08
        cam.location = (2.2, -5.2, 1.55)
        cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.camera = cam
    elif PHASE == 'primary_masses':
        core = bpy.data.objects.get('HERO_pearl_core')
        if core is None:
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=0.6)
            mesh = bpy.data.meshes.new('HERO_pearl_core_mesh')
            bm.to_mesh(mesh)
            bm.free()
            core = bpy.data.objects.new('HERO_pearl_core', mesh)
            col.objects.link(core)
            core.parent = root
            for p in mesh.polygons: p.use_smooth = True
        pose = empty('RIG_aperture_pose', col, root)
        pose.rotation_euler = (0.12, -0.20, -0.28)
        spin = empty('RIG_aperture_spin', col, pose)
        ring = mesh_object('HERO_titanium_aperture', *ring_mesh(), col, spin)
        ring['major_radius_m'] = 0.73
        ring['section_width_m'] = 0.128
        ring['section_thickness_m'] = 0.035
    elif PHASE == 'secondary_masses':
        flow = empty('RIG_inner_flow', col, root)
        for name, phase in [('sage', 0), ('cyan', 2.15), ('ivory', 4.30)]:
            mesh_object('HERO_flow_' + name, *flow_mesh(phase), col, flow)
    elif PHASE not in ('silhouette_proportions', 'pivots_attachments', 'camera_review'):
        raise ValueError('Unknown phase: ' + PHASE)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = next(i.identifier for i in area.spaces.active.region_3d.bl_rna.properties['view_perspective'].enum_items if i.identifier == 'CAMERA')
            area.spaces.active.overlay.show_overlays = False
    bpy.context.view_layer.update()
    print({'phase': PHASE, 'scene': scene.name, 'camera': scene.camera.name, 'objects': [{'name': o.name, 'dimensions': [round(v,4) for v in o.dimensions], 'parent': o.parent.name if o.parent else None} for o in scene.objects], 'active_filepath': bpy.data.filepath})
