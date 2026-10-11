"""Export only our authored model collection, including evaluated surfaces and loop."""
import bpy, os, json
scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene
scene.frame_set(1)
path = r'D:\hackathon2026\insightos-ui\public\buddy\insight-core-v1.glb'
os.makedirs(os.path.dirname(path),exist_ok=True)
selected_before = list(bpy.context.selected_objects)
active_before = bpy.context.view_layer.objects.active
for ob in bpy.context.selected_objects: ob.select_set(False)
collection = bpy.data.collections['INSIGHTOS_Buddy_Geometry_v001']
for ob in collection.objects: ob.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['HERO_titanium_ribbon']
rna = bpy.ops.export_scene.gltf.get_rna_type()
format_enum = [i.identifier for i in rna.properties['export_format'].enum_items]
animation_enum = [i.identifier for i in rna.properties['export_animation_mode'].enum_items]
try:
    result = bpy.ops.export_scene.gltf(filepath=path,
        export_format='GLB',
        use_selection=True,use_active_scene=True,export_apply=True,
        export_cameras=False,export_lights=False,
        export_animations=True,export_frame_range=True,
        export_animation_mode=next(i for i in animation_enum if i=='SCENE'),
        export_force_sampling=True,export_anim_slide_to_zero=True,
        export_anim_scene_split_object=False,
        export_nla_strips_merged_animation_name='InsightOS_Ribbon_Loop')
finally:
    for ob in collection.objects: ob.select_set(False)
    for ob in selected_before: ob.select_set(True)
    bpy.context.view_layer.objects.active = active_before
assert os.path.isfile(path)
print({'export':path,'bytes':os.path.getsize(path),'result':str(result),'active_filepath':bpy.data.filepath})
