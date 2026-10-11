"""Author four logical clips on independent properties using slotted actions."""
import bpy
import json
import math
import os

BASE=r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
scene=bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene=scene
rig=bpy.data.objects['RIG_Sprout']
body=bpy.data.objects['SPROUT_BODY']
keys=body.data.shape_keys
reaction=bpy.data.objects['REACTION_ROOT']
BASE_CLIPS=globals().get('BASE_CLIPS',['Sprout_Idle','Sprout_Listen'])
AUTHOR_REACTIONS=globals().get('AUTHOR_REACTIONS',True)
assert not rig.animation_data or not any(t.name in BASE_CLIPS for t in rig.animation_data.nla_tracks), 'Inspect existing clips before authoring again.'

def start(owner):
    owner.animation_data_create()
    owner.animation_data.action=None

def stash(owner,clip,detail):
    ad=owner.animation_data
    act=ad.action
    assert act is not None
    act.name=clip+'_'+detail
    slot=ad.action_slot
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                if bag.slot_handle!=slot.handle:continue
                for fc in bag.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation='BEZIER'
                        kp.handle_left_type=kp.handle_right_type='AUTO_CLAMPED'
                    if clip in ['Sprout_Idle','Sprout_Listen','Sprout_Think','Sprout_Speak'] and len(fc.keyframe_points)>2:
                        pts=fc.keyframe_points
                        slope=(pts[1].co.y-pts[-2].co.y)/(2*(pts[1].co.x-pts[0].co.x))
                        for kp in [pts[0],pts[-1]]:
                            kp.handle_left_type=kp.handle_right_type='FREE'
                            kp.handle_left=(kp.co.x-2,kp.co.y-2*slope)
                            kp.handle_right=(kp.co.x+2,kp.co.y+2*slope)
                    fc.update()
    track=ad.nla_tracks.new();track.name=clip
    strip=track.strips.new(clip,1,act);strip.action_slot=slot
    strip.blend_type='REPLACE';strip.extrapolation='NOTHING'
    ad.action=None
    track.mute=clip!='Sprout_Idle'
    return act

for clip in BASE_CLIPS:
    start(rig);start(keys)
    attentive=clip=='Sprout_Listen'
    thinking=clip=='Sprout_Think'
    speaking=clip=='Sprout_Speak'
    for frame in range(1,146,6):
        phase=2*math.pi*(frame-1)/144
        for bone in rig.pose.bones:
            bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
        rig.pose.bones['BODY'].rotation_euler=(0.037 if attentive else .012*math.sin(phase*2) if speaking else 0,
            (-.025 if thinking else 0)+0.016*math.sin(phase),0.007*math.sin(phase))
        pulse=math.sin(phase*2) if speaking else math.sin(phase)
        amplitude=1.7 if speaking else 1
        rig.pose.bones['BODY'].scale=(1+0.006*pulse*amplitude,1+0.004*pulse*amplitude,1-0.008*pulse*amplitude)
        for side,sign in [('L',-1),('R',1)]:
            rig.pose.bones['BUD_'+side+'_BASE'].rotation_euler[1]=sign*(0.065 if attentive else -.035 if thinking else 0.0)+0.038*math.sin(phase-0.28+sign*0.1)
            rig.pose.bones['BUD_'+side+'_TIP'].rotation_euler[1]=0.050*math.sin(phase-0.53+sign*0.12)
            rig.pose.bones['FOOT_'+side].rotation_euler[1]=0.015*math.sin(phase+sign*0.25)
        for bone in rig.pose.bones:
            for prop in ['location','rotation_euler','scale']:
                bone.keyframe_insert(data_path=prop,frame=frame,group=bone.name)
        keys.key_blocks['Jelly_Squash'].value=(0.20 if attentive else .24 if speaking else 0.13)*(0.5+0.5*math.cos(phase*2 if speaking else phase))
        keys.key_blocks['Jelly_Sway_L'].value=0.16*(0.5+0.5*math.sin(phase))
        keys.key_blocks['Jelly_Sway_R'].value=0.16*(0.5-0.5*math.sin(phase))
        for key in list(keys.key_blocks)[1:]:key.keyframe_insert(data_path='value',frame=frame)
    stash(rig,clip,'Rig');stash(keys,clip,'Jelly')

if AUTHOR_REACTIONS:
    start(reaction)
    for frame,scale,roll in [
     (1,(1,1,1),0),(3,(1.065,1.035,0.925),-0.018),
     (5,(0.980,0.993,1.042),0.012),(8,(1.008,1.002,0.988),-0.004),(11,(1,1,1),0),
    ]:
        reaction.scale=scale;reaction.rotation_euler=(0,roll,0);reaction.location=(0,0,0)
        for prop in ['scale','rotation_euler','location']:reaction.keyframe_insert(data_path=prop,frame=frame)
    stash(reaction,'Sprout_Click','Reaction')
    reaction.scale=(1,1,1);reaction.rotation_euler=(0,0,0)
    for side in ['L','R']:
        lid=bpy.data.objects['LID_'+side];start(lid)
        for frame,close in [(1,0.001),(2,0.70),(3,1.0),(4,0.35),(5,0.001)]:
            lid.scale=(min(1,close*3),min(1,close*4),close);lid.keyframe_insert(data_path='scale',frame=frame)
        stash(lid,'Sprout_Blink',side)
        lid.scale=(0.003,0.004,0.001)

scene.frame_set(1)
report={}
for owner in [rig,keys,reaction,bpy.data.objects['LID_L'],bpy.data.objects['LID_R']]:
    report[owner.name]=[{'track':t.name,'range':[s.frame_start,s.frame_end],'action':s.action.name,'slot':s.action_slot.identifier} for t in owner.animation_data.nla_tracks for s in t.strips]
with open(os.path.join(BASE,'proofs','authored-clip-inventory.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report))
