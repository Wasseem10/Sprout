"""Six-second loop: distinct orbit, inner flow and breathing channels."""
import bpy, math
scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 145

def curves(ob):
    action = ob.animation_data.action
    handle = ob.animation_data.action_slot.handle
    return [f for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags if bag.slot_handle == handle for f in bag.fcurves]

for name, angle in [('RIG_ribbon_spin',math.tau),('RIG_inner_flow',-math.tau)]:
    ob = bpy.data.objects[name]
    ob.rotation_euler = (0,0,0)
    ob.keyframe_insert(data_path='rotation_euler',frame=1)
    ob.rotation_euler.z = angle
    ob.keyframe_insert(data_path='rotation_euler',frame=145)
    ob.animation_data.action.name = name + '_loop'
    for curve in curves(ob):
        for key in curve.keyframe_points:
            valid = [i.identifier for i in key.bl_rna.properties['interpolation'].enum_items]
            key.interpolation = next(i for i in valid if i == 'LINEAR')
core = bpy.data.objects['HERO_pearl_core']
for frame, size in [(1,0.992),(37,1.0),(73,1.008),(109,1.0),(145,0.992)]:
    core.scale = (size,)*3
    core.keyframe_insert(data_path='scale',frame=frame)
core.animation_data.action.name = 'HERO_pearl_core_breath'
for curve in curves(core):
    for key in curve.keyframe_points:
        key.interpolation = next(i.identifier for i in key.bl_rna.properties['interpolation'].enum_items if i.identifier == 'BEZIER')
        valid = [i.identifier for i in key.bl_rna.properties['handle_left_type'].enum_items]
        key.handle_left_type = key.handle_right_type = next(i for i in valid if i == 'AUTO_CLAMPED')
scene.frame_set(1)
print({'stage':'motion_loop', 'fps':24, 'unique_frames':144,'seam_frame':145,'channels':[(o.name,o.animation_data.action.name) for o in scene.objects if o.animation_data and o.animation_data.action]})
