"""Read-only inspection of the frozen v003 source before authoring v004."""
import bpy
import hashlib
import json
import os
import sys

scene = next(s for s in bpy.data.scenes if s.name.startswith('INSIGHTOS_Sprout_v003'))
bpy.context.window.scene = scene
rig = bpy.data.objects['RIG_Sprout']
report = {
    'source': bpy.data.filepath,
    'source_sha256': hashlib.sha256(open(bpy.data.filepath, 'rb').read()).hexdigest(),
    'scene': scene.name,
    'fps': scene.render.fps,
    'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None,
               'head': list(b.head_local), 'tail': list(b.tail_local),
               'matrix': [list(row) for row in b.matrix_local]} for b in rig.data.bones],
    'objects': [],
    'owners': [],
}
for name in ('SPROUT_BODY', 'SPROUT_CORE', 'FACE_ANCHOR', 'GAZE_L', 'GAZE_R',
             'LID_L', 'LID_R', 'EYE_L', 'EYE_R', 'CLOSED_EYE_L', 'CLOSED_EYE_R'):
    ob = bpy.data.objects[name]
    record = {'name': name, 'type': ob.type, 'parent': ob.parent.name if ob.parent else None,
              'location': list(ob.location), 'rotation': list(ob.rotation_euler),
              'scale': list(ob.scale), 'constraints': [{'type': c.type, 'target': getattr(getattr(c, 'target', None), 'name', None), 'subtarget': getattr(c, 'subtarget', None)} for c in ob.constraints]}
    if ob.type == 'MESH':
        groups = {g.index: g.name for g in ob.vertex_groups}
        record['weight_counts'] = {name: sum(any(g.group == index and g.weight > .01 for g in v.groups) for v in ob.data.vertices) for index, name in groups.items()}
        record['bounds'] = [[min(v.co[a] for v in ob.data.vertices), max(v.co[a] for v in ob.data.vertices)] for a in range(3)]
    report['objects'].append(record)
owners = [rig, bpy.data.objects['SPROUT_BODY'].data.shape_keys,
          bpy.data.objects['SPROUT_CORE'].data.shape_keys,
          bpy.data.objects['REACTION_ROOT'], bpy.data.objects['LID_L'], bpy.data.objects['LID_R']]
for owner in owners:
    ad = owner.animation_data
    record = {'owner': owner.name, 'tracks': []}
    if ad:
        for track in ad.nla_tracks:
            for strip in track.strips:
                slot = strip.action_slot
                curves = [fc.data_path for layer in strip.action.layers for action_strip in layer.strips for bag in action_strip.channelbags if bag.slot_handle == slot.handle for fc in bag.fcurves]
                record['tracks'].append({'name': track.name, 'action': strip.action.name, 'range': [strip.frame_start, strip.frame_end], 'curves': sorted(set(curves))})
    report['owners'].append(record)
output = sys.argv[sys.argv.index('--') + 1]
with open(output, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
print(json.dumps({'report': output, 'fps': report['fps'], 'bones': [{k: b[k] for k in ('name', 'parent', 'head', 'tail')} for b in report['bones']], 'objects': report['objects']}))
