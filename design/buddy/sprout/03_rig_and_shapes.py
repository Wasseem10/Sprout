"""Original nine-bone FK rig and fixed-topology jelly shapes for Sprout."""
import bpy
import bmesh
import json
import math
import os
from mathutils import Matrix, Vector

BASE=r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
scene=bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene=scene
body=bpy.data.objects['SPROUT_BODY']
model=bpy.data.collections['SPROUT_MODEL']
assert bpy.data.objects.get('RIG_Sprout') is None, 'Rig already exists; inspect rather than duplicate.'
assert body.data.shape_keys is None, 'Topology/shape stage already completed.'

arm=bpy.data.armatures.new('RIG_Sprout_Data')
rig=bpy.data.objects.new('RIG_Sprout',arm)
model.objects.link(rig)
rig.parent=bpy.data.objects['REACTION_ROOT']
rig.show_in_front=True
for ob in bpy.context.selected_objects:ob.select_set(False)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
spec=[
 ('ROOT',None,(0,0,-0.60),(0,0,-0.20)),
 ('BODY','ROOT',(0,0,-0.50),(0,0,0.60)),
 ('FACE_MOUNT','BODY',(0,-0.626,0.015),(0,-0.626,0.24)),
 ('BUD_L_BASE','BODY',(-0.30,0,0.67),(-0.41,0,0.94)),
 ('BUD_L_TIP','BUD_L_BASE',(-0.41,0,0.94),(-0.46,0,1.20)),
 ('BUD_R_BASE','BODY',(0.31,0,0.66),(0.42,0,0.87)),
 ('BUD_R_TIP','BUD_R_BASE',(0.42,0,0.87),(0.48,0,1.13)),
 ('FOOT_L','ROOT',(-0.43,0,-0.61),(-0.43,0,-1.04)),
 ('FOOT_R','ROOT',(0.43,0,-0.61),(0.43,0,-1.04)),
]
for name,parent,head,tail in spec:
    bone=arm.edit_bones.new(name);bone.head=head;bone.tail=tail
    if parent:bone.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for pb in rig.pose.bones:pb.rotation_mode='XYZ'
body.parent=rig
deform=body.modifiers.new('Sprout_FK','ARMATURE');deform.object=rig
groups={name:body.vertex_groups.new(name=name) for name,*_ in spec}

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

for vert in body.data.vertices:
    x,y,z=vert.co
    influence={}
    for side,sign in [('L',-1),('R',1)]:
        bud=smooth(0.49,0.96,z)*math.exp(-((x-sign*0.41)/0.35)**4)
        tip=smooth(0.89 if side=='L' else 0.82,1.17 if side=='L' else 1.09,z)
        influence['BUD_'+side+'_BASE']=bud*(1-tip)
        influence['BUD_'+side+'_TIP']=bud*tip
        foot=smooth(0.60,0.96,-z)*math.exp(-((x-sign*0.43)/0.38)**4)
        influence['FOOT_'+side]=foot
    influence['BODY']=max(0,1-sum(influence.values()))
    ordered=sorted(influence.items(),key=lambda p:p[1],reverse=True)[:4]
    total=sum(w for _,w in ordered)
    for name,w in ordered:
        if w>1e-6:groups[name].add([vert.index],w/total,'REPLACE')

basis=body.shape_key_add(name='Basis')
for name in ['Jelly_Squash','Jelly_Sway_L','Jelly_Sway_R']:
    key=body.shape_key_add(name=name)
    for i,p in enumerate(key.data):
        co=basis.data[i].co
        x,y,z=co
        face=math.exp(-((x/0.77)**6+(z/0.43)**6))*smooth(0.20,0.56,-y)
        soles=1-smooth(0.72,1.04,-z)
        buds=1-smooth(0.51,0.92,z)
        mask=(1-face)*soles*buds
        if name=='Jelly_Squash':
            p.co=(x*(1+0.038*mask),y*(1+0.023*mask),z-0.050*z*mask)
        else:
            direction=-1 if name.endswith('_L') else 1
            p.co=(x+direction*0.050*mask*(0.55+0.45*math.cos(z*2)),y,z+direction*0.022*x*mask)

# Preserve the face's exact world pose while attaching it to the rigid bone.
face=bpy.data.objects['FACE_ANCHOR']
before=face.matrix_world.copy()
face.parent=rig;face.parent_type='BONE';face.parent_bone='FACE_MOUNT'
bpy.context.view_layer.update()
face.matrix_world=before
bpy.context.view_layer.update()
assert max(abs(face.matrix_world[r][c]-before[r][c]) for r in range(4) for c in range(4))<1e-5

for side,x in [('L',-0.34),('R',0.34)]:
    mesh=bpy.data.meshes.new('LID_'+side+'_Mesh')
    bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=24,v_segments=16,radius=1)
    for v in bm.verts:
        v.co.x*=0.196;v.co.y*=0.028;v.co.z=v.co.z*0.248-0.248
    bm.to_mesh(mesh);bm.free()
    lid=bpy.data.objects.new('LID_'+side,mesh);model.objects.link(lid)
    lid.parent=face;lid.location=(x,-0.747,0.265);lid.scale=(0.003,0.004,0.001)
    mesh.materials.append(bpy.data.materials['MAT_Sprout_Clay'])
    for poly in mesh.polygons:poly.use_smooth=True

scene.frame_set(1);bpy.context.view_layer.update()
report={'bones':[b.name for b in arm.bones],'shape_keys':[k.name for k in body.data.shape_keys.key_blocks],
        'body_vertices':len(body.data.vertices),'face_world_pose_preserved':True,
        'shape_extreme_weight_sum_limit':1,'weight_max_influences':max(len(v.groups) for v in body.data.vertices),
        'face_nodes':{n:list(bpy.data.objects[n].matrix_world.translation) for n in ['EYE_L','EYE_R','LID_L','LID_R']}}
with open(os.path.join(BASE,'proofs','rig-audit.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report))
