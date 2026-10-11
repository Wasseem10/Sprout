"""Product studio lighting. Set LIGHT_STAGE for isolated contribution proofs."""
import bpy, os
from mathutils import Vector

scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
scene.render.engine = 'CYCLES'  # Accepted by live Blender 5.2.2; RNA underreports this dynamic enum.
LIGHT_STAGE = globals().get('LIGHT_STAGE', 'full')
world = bpy.data.worlds.get('WORLD_buddy_studio') or bpy.data.worlds.new('WORLD_buddy_studio')
world.use_nodes = True; scene.world = world
background = next(n for n in world.node_tree.nodes if n.bl_idname == 'ShaderNodeBackground')
background.inputs['Color'].default_value = (0.48,0.53,0.51,1)
background.inputs['Strength'].default_value = 0 if LIGHT_STAGE == 'zero_world' else 0.045

def light(role, location, energy, color, size, size_y):
    colname = 'INSIGHTOS_Buddy_Lighting_' + role
    col = bpy.data.collections.get(colname)
    if col is None:
        col = bpy.data.collections.new(colname); scene.collection.children.link(col)
    name = 'LGT_buddy_' + role
    ob = bpy.data.objects.get(name)
    if ob is None:
        valid = [i.identifier for i in bpy.types.Light.bl_rna.properties['type'].enum_items]
        data = bpy.data.lights.new(name + '_data', next(i for i in valid if i == 'AREA'))
        ob = bpy.data.objects.new(name,data); col.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (-ob.location).to_track_quat('-Z','Y').to_euler()
    data = ob.data
    valid = [i.identifier for i in data.bl_rna.properties['shape'].enum_items]
    data.shape = next(i for i in valid if i == 'RECTANGLE')
    data.size, data.size_y = size, size_y
    data.energy, data.color = energy, color
    ob.hide_render = LIGHT_STAGE not in ('full', role + '_only')
    return ob

lights = [
    light('key',(-3.2,-3.4,3.2),650,(1.0,0.93,0.81),2.4,4.0),
    light('fill',(3.0,-2.5,0.4),190,(0.75,0.92,1.0),2.4,2.0),
    light('rim',(1.7,2.8,2.5),700,(0.84,1.0,0.95),1.0,3.2),
]
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = next(i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items if i.identifier == 'PNG')
scene.render.image_settings.color_mode = next(i.identifier for i in scene.render.image_settings.bl_rna.properties['color_mode'].enum_items if i.identifier == 'RGBA')
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 8
else:
    scene.eevee.use_raytracing = True
    scene.eevee.taa_render_samples = 96
print({'stage':'lighting_'+LIGHT_STAGE, 'engine':scene.render.engine, 'view_transform':scene.view_settings.view_transform, 'exposure':scene.view_settings.exposure,'lights':[(l.name,l.hide_render,l.data.energy) for l in lights], 'path':bpy.data.filepath})
