"""Portable Principled material values, with no procedural shading dependency."""
import bpy

scene = bpy.data.scenes['INSIGHTOS_Buddy_v001']
bpy.context.window.scene = scene

def principled(name, color, metallic, roughness, transmission=0, emission=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    if bsdf is None: bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    out = next((n for n in nodes if n.bl_idname == 'ShaderNodeOutputMaterial'), None)
    if out is None: out = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    values = {'Base Color':(*color,1), 'Metallic':metallic,
        'Roughness':roughness, 'Transmission Weight':transmission,
        'IOR':1.25 if transmission else 1.46,
        'Coat Weight':0.25 if transmission else 0.15,
        'Coat Roughness':0.08 if transmission else 0.16,
        'Emission Color':(*color,1), 'Emission Strength':emission}
    for key, value in values.items(): bsdf.inputs[key].default_value = value
    return mat

roles = [
    ('HERO_pearl_core','MAT_buddy_pearl_glass',(0.90,0.96,0.91),0,0.07,0.94,0.055),
    ('HERO_titanium_ribbon','MAT_buddy_titanium',(0.32,0.35,0.34),1,0.255,0,0),
    ('HERO_flow_sage','MAT_buddy_flow_sage',(0.15,0.53,0.38),0.12,0.24,0.25,0.45),
    ('HERO_flow_cyan','MAT_buddy_flow_cyan',(0.045,0.58,0.57),0.1,0.20,0.3,0.85),
    ('HERO_flow_ivory','MAT_buddy_flow_ivory',(0.71,0.80,0.63),0.1,0.27,0.2,0.3),
]
for name, matname, color, metal, rough, trans, emission in roles:
    ob = bpy.data.objects[name]
    mat = principled(matname,color,metal,rough,trans,emission)
    ob.data.materials.clear(); ob.data.materials.append(mat)
    if name == 'HERO_pearl_core' and ob.modifiers.get('Polished_surface') is None:
        valid = [i.identifier for i in ob.modifiers.bl_rna.functions['new'].parameters['type'].enum_items]
        mod = ob.modifiers.new('Polished_surface',next(i for i in valid if i == 'SUBSURF'))
        mod.levels = mod.render_levels = 1
    ob['material_role'] = matname
print({'stage':'portable_materials','roles':[r[:2] for r in roles],'path':bpy.data.filepath})
