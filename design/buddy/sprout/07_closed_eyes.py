"""Tiny closed-eye creases travel with the separately owned eyelid transforms."""
import bpy
import math

model=bpy.data.collections['SPROUT_MODEL']
for side in ['L','R']:
    name='CLOSED_EYE_'+side
    assert bpy.data.objects.get(name) is None, 'Inspect existing crease before rebuilding.'
    vertices=[];faces=[]
    for i in range(21):
        t=i/20*2-1
        x=t*.11
        z=-.26+.028*t*t
        for j in range(8):
            theta=j*math.pi/4
            vertices.append((x,-.033+.009*math.cos(theta),z+.009*math.sin(theta)))
    for i in range(20):
        for j in range(8):
            a=i*8+j;b=i*8+(j+1)%8
            faces.append((a,b,b+8,a+8))
    faces.append(tuple(reversed(range(8))))
    faces.append(tuple(range(160,168)))
    mesh=bpy.data.meshes.new(name+'_Mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);model.objects.link(ob)
    ob.parent=bpy.data.objects['LID_'+side]
    mesh.materials.append(bpy.data.materials['MAT_Sprout_Eyes'])
    for polygon in mesh.polygons:polygon.use_smooth=True
print({'closed_eye_creases':[bpy.data.objects['CLOSED_EYE_'+s].name for s in ['L','R']]})
