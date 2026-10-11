"""Refined broad strip reflections; intentionally matched to Sprout's browser rig."""
import bpy
import json
from mathutils import Vector

scene=bpy.data.scenes['INSIGHTOS_Sprout_v002']
specs={
    'key':{'position':(-3.5,-3.0,3.8),'shape':'RECTANGLE','size':1.45,'size_y':3.4,'energy':550,'color':(1,.965,.93)},
    'fill':{'position':(3.2,-2,1.5),'shape':'ELLIPSE','size':1.3,'size_y':2.2,'energy':45,'color':(.72,.91,1)},
    'rim':{'position':(1.2,2,3),'shape':'RECTANGLE','size':2.8,'size_y':.9,'energy':300,'color':(.78,.93,1)},
}
for role,s in specs.items():
    ob=bpy.data.objects['LGT_sprout_'+role]
    ob.location=s['position'];ob.rotation_euler=(Vector((0,0,.08))-ob.location).to_track_quat('-Z','Y').to_euler()
    for name in ['shape','size','size_y','energy','color']:setattr(ob.data,name,s[name])
world=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
world.inputs['Strength'].default_value=.18
print(json.dumps({'lights':specs,'world_strength':.18,'exposure':scene.view_settings.exposure}))
