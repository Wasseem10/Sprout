"""Small static expression, added after the actual 44/96px eye-readability gate."""
import bpy
import math

name='FACE_Smile'
assert bpy.data.objects.get(name) is None
verts=[];faces=[]
for i in range(25):
    t=i/24*2-1
    for j in range(8):
        theta=j*math.pi/4
        verts.append((t*.13,-.690+.013*math.cos(theta),-.28+.048*t*t+.013*math.sin(theta)))
for i in range(24):
    for j in range(8):
        a=i*8+j;b=i*8+(j+1)%8
        faces.append((a,b,b+8,a+8))
faces.append(tuple(reversed(range(8))))
faces.append(tuple(range(192,200)))
mesh=bpy.data.meshes.new(name+'_Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
ob=bpy.data.objects.new(name,mesh);bpy.data.collections['SPROUT_MODEL'].objects.link(ob)
ob.parent=bpy.data.objects['FACE_ANCHOR']
mesh.materials.append(bpy.data.materials['MAT_Sprout_Eyes'])
for p in mesh.polygons:p.use_smooth=True
print({'static_expression':ob.name,'lip_sync':False})
