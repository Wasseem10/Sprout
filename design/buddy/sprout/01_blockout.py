"""Original Sprout construction study. Run one PHASE in the live Blender session.

Only creates/updates the named Sprout scene. Existing scenes are untouched.
The coarse source masses are retained separately from the derived runtime mesh.
"""
import bpy
import bmesh
import json
import math
import os
from mathutils import Vector

BASE = r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
PHASE = globals().get('PHASE', 'bounds')
scene = bpy.data.scenes.get('INSIGHTOS_Sprout_v002')
if scene is None:
    scene = bpy.data.scenes.new('INSIGHTOS_Sprout_v002')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 145
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
try:
    scene.render.engine = 'CYCLES'
except TypeError:
    raise RuntimeError('Cycles unavailable; inspect supported render engines before retrying')
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure = 0
valid_formats = [e.identifier for e in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
assert 'PNG' in valid_formats
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

def collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
    return c

proxies = collection('SPROUT_PROXIES')
model = collection('SPROUT_MODEL')
studio = collection('SPROUT_STUDIO')

def material(name, color, roughness):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m

clay = material('MAT_Sprout_Clay', (0.48, 0.64, 0.69), 0.40)
navy = material('MAT_Sprout_Eyes', (0.003, 0.009, 0.028), 0.23)
glint = material('MAT_Sprout_Glints', (0.96, 0.99, 1.0), 0.15)

def ellipsoid(name, location, scale, mat=clay, target=proxies, rotation=0):
    old = bpy.data.objects.get(name)
    if old is not None:
        return old
    mesh = bpy.data.meshes.new(name + '_Mesh')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=28, radius=1)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    target.objects.link(ob)
    ob.location = location
    ob.rotation_euler[1] = rotation
    mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    return ob

def empty(name, parent=None):
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, None)
        model.objects.link(ob)
    ob.parent = parent
    return ob

root = empty('SPROUT_ROOT')
reaction = empty('REACTION_ROOT', root)

camera = bpy.data.objects.get('CAM_sprout_hero')
if camera is None:
    camera = bpy.data.objects.new('CAM_sprout_hero', bpy.data.cameras.new('CAM_sprout_hero_Data'))
    studio.objects.link(camera)
camera.location = (0.10, -6, 0.24)
target = Vector((0, 0, 0.08))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.8
scene.camera = camera

world = bpy.data.worlds.get('WORLD_Sprout_Studio') or bpy.data.worlds.new('WORLD_Sprout_Studio')
world.use_nodes = True
background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs['Color'].default_value = (0.70, 0.79, 0.90, 1)
background.inputs['Strength'].default_value = 0.28
scene.world = world

for name, loc, energy, size in [
    ('LGT_sprout_key', (-3,-4,4), 430, 4),
    ('LGT_sprout_fill', (3,-2,1.5), 120, 3),
    ('LGT_sprout_rim', (1.2,2.0,3.0), 300, 3),
]:
    light = bpy.data.objects.get(name)
    if light is None:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name + '_Data', 'AREA'))
        studio.objects.link(light)
    light.location = loc
    light.rotation_euler = (-light.location).to_track_quat('-Z','Y').to_euler()
    light.data.energy, light.data.size = energy, size
    light['purpose'] = name.rsplit('_',1)[1]

if PHASE == 'bounds':
    bound = empty('PROXY_Sprout_Bounds')
    bound.empty_display_type = 'CUBE'
    bound.empty_display_size = 1
    bound.scale = (1.05, 0.69, 1.14)
elif PHASE == 'primary_masses':
    body = ellipsoid('SOURCE_Sprout_Body', (0,0,0), (1.0,0.66,0.91))
    if not body.get('pear_applied'):
        for v in body.data.vertices:
            t = v.co.z / 0.91
            v.co.x *= 1.0 - 0.16*t
            v.co.y *= 1.0 - 0.08*t
        body.data.update()
        body['pear_applied'] = True
elif PHASE == 'secondary_masses':
    ellipsoid('SOURCE_Bud_L_Base', (-0.31,0.01,0.79), (0.18,0.20,0.32), rotation=-0.32)
    ellipsoid('SOURCE_Bud_L_Tip', (-0.44,0.01,1.05), (0.245,0.22,0.19), rotation=-0.20)
    ellipsoid('SOURCE_Bud_R_Base', (0.34,0.02,0.77), (0.18,0.20,0.25), rotation=0.42)
    ellipsoid('SOURCE_Bud_R_Tip', (0.47,0.02,0.96), (0.24,0.22,0.18), rotation=0.25)
    ellipsoid('SOURCE_Foot_L', (-0.43,-0.06,-0.84), (0.24,0.35,0.24), rotation=-0.22)
    ellipsoid('SOURCE_Foot_R', (0.43,-0.06,-0.84), (0.24,0.35,0.24), rotation=0.22)
elif PHASE == 'silhouette_proportions':
    # Parameter choices remain in the source masses; record measured envelope.
    pass
elif PHASE == 'pivots_attachments':
    face = empty('FACE_ANCHOR', reaction)
    for side, x in [('L',-0.34),('R',0.34)]:
        gaze = empty('GAZE_' + side, face)
        eye = ellipsoid('EYE_' + side, (x,-0.626,0.015), (0.155,0.080,0.215), navy, model, rotation=(-0.12 if side=='L' else 0.12))
        eye.parent = gaze
        shine = ellipsoid('GLINT_' + side, (x+0.043,-0.704,0.110), (0.046,0.018,0.058), glint, model)
        shine.parent = gaze
elif PHASE == 'camera_review':
    pass
else:
    raise ValueError('Unknown blockout phase: ' + PHASE)

for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.type = 'SOLID'
        area.spaces.active.shading.color_type = 'MATERIAL'
        area.spaces.active.overlay.show_overlays = PHASE == 'bounds'
bpy.context.view_layer.update()
os.makedirs(os.path.join(BASE,'proofs'), exist_ok=True)
os.makedirs(os.path.join(BASE,'source'), exist_ok=True)
data = {'phase':PHASE,'scene':scene.name,'objects':len(scene.objects),'source_bounds':{o.name:[round(v,4) for v in o.dimensions] for o in proxies.objects},'active_filepath':bpy.data.filepath}
with open(os.path.join(BASE,'proofs','blockout-'+PHASE+'.json'),'w') as f:
    json.dump(data,f,indent=2)
print(json.dumps(data))
