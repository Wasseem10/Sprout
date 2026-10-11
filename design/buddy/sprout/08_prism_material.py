"""Portable original Prism color recipe, evaluated on the fixed runtime basis."""
import bpy
import math
import json
import os

BASE=r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
variant=globals().get('VARIANT','glossy')
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)
def mix(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def prism(co):
    x,y,z=co
    base=mix((.015,.27,.86),(.015,.55,1.0),smooth(-.90,.70,z))
    base=mix(base,(.015,.83,.91),smooth(.40,1.15,z))
    # A single rising lower-side ribbon; the eye band stays predominately aqua.
    band=math.exp(-((z-(-.66+.12*x+.09*x*x))/.17)**2)
    violet=(.66,.50,1.0)
    coral=(1.0,.75,.63)
    sweep=mix(violet,coral,smooth(-.25,.70,x))
    strength=band*(.75+.22*smooth(-.65,.85,x))
    color=mix(base,sweep,strength)
    peach=.45*math.exp(-(((x-.65)/.20)**2+((z+.52)/.15)**2))
    color=mix(color,(1,.82,.64),peach)
    return tuple(linear(v) for v in color)+(1,)

mat=bpy.data.materials.get('MAT_Sprout_Prism') or bpy.data.materials.new('MAT_Sprout_Prism')
mat.use_nodes=True
node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
color=next((n for n in mat.node_tree.nodes if n.type=='VERTEX_COLOR'),None)
if color is None:color=mat.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name='Prism_Color';color.location=(-280,60)
mat.node_tree.links.new(color.outputs['Color'],node.inputs['Base Color'])
values={'Metallic':.035,'Roughness':.16,'IOR':1.44,'Coat Weight':.50,'Coat Roughness':.10,
    'Transmission Weight':.38 if variant=='transmission' else 0.0}
for name,value in values.items():node.inputs[name].default_value=value
mat.diffuse_color=(.04,.50,.88,1)
face=bpy.data.objects['FACE_ANCHOR']
for name in ['SPROUT_BODY','LID_L','LID_R']:
    ob=bpy.data.objects[name]
    attr=ob.data.color_attributes.get('Prism_Color') or ob.data.color_attributes.new(name='Prism_Color',type='FLOAT_COLOR',domain='POINT')
    ob.data.color_attributes.active_color=attr
    ob.data.color_attributes.render_color_index=list(ob.data.color_attributes).index(attr)
    for vert in ob.data.vertices:
        co=vert.co if name=='SPROUT_BODY' else face.matrix_world@(ob.location+vert.co)
        attr.data[vert.index].color=prism(co)
    ob.data.materials.clear();ob.data.materials.append(mat)
report={'variant':variant,'material':mat.name,'settings':values,'color_attribute':'Prism_Color',
    'portable_vertex_color':True,'external_textures':False,'recipe':'one rising violet/coral lower-side ribbon, dominant aqua/blue face'}
with open(os.path.join(BASE,'proofs','material-'+variant+'.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report))
