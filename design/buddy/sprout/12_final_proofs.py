"""Small evaluated pose/light diagnostics for the locked original character."""
import bpy
import json
import os

BASE=r'D:\hackathon2026\insightos-ui\design\buddy\sprout'
scene=bpy.data.scenes['INSIGHTOS_Sprout_v002']
helper=compile(open(os.path.join(BASE,'06_render_proof.py'),encoding='utf8').read(),'06_render_proof.py','exec')
SIZE=320
SAMPLES=24
mode=globals().get('PROOF_MODE','poses')
outputs=[]
if mode=='poses':
    for CLIP,FRAME,label in [('Sprout_Blink',2,'blink-mid'),('Sprout_Blink',3,'blink-closed'),
        ('Sprout_Click',3,'click-squash'),('Sprout_Listen',37,'listen'),
        ('Sprout_Think',73,'think'),('Sprout_Speak',37,'speak')]:
        OUTPUT='final-'+label+'.png'
        exec(helper)
        outputs.append(OUTPUT)
else:
    lights={role:bpy.data.objects['LGT_sprout_'+role] for role in ['key','fill','rim']}
    energy={role:ob.data.energy for role,ob in lights.items()}
    world=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
    strength=world.inputs['Strength'].default_value
    CLIP='Sprout_Idle'
    FRAME=1
    try:
        for role in ['world-only','zero-world','key','fill','rim','full']:
            for name,ob in lights.items():
                ob.data.energy=energy[name] if role in ['zero-world','full',name] else 0
            world.inputs['Strength'].default_value=strength if role in ['world-only','full'] else 0
            OUTPUT='final-light-'+role+'.png'
            exec(helper)
            outputs.append(OUTPUT)
    finally:
        for name,ob in lights.items():ob.data.energy=energy[name]
        world.inputs['Strength'].default_value=strength
with open(os.path.join(BASE,'proofs','final-'+mode+'-inventory.json'),'w') as f:
    json.dump({'size':SIZE,'samples':SAMPLES,'exposure':scene.view_settings.exposure,'images':outputs},f,indent=2)
print(json.dumps(outputs))
