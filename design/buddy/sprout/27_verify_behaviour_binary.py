"""CPU audit of exact packaged animation/material/bind streams; no image decoding."""
import hashlib
import json
import math
import os
import struct

BASE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(BASE, 'sprout-prism-v004.glb')

def load(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF'
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert version == 2 and length == len(data)
    json_length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4e4f534a
    return data, json.loads(data[20:20+json_length]), data[28+json_length:]

data, doc, binary = load(PATH)
old_data, old, old_binary = load(os.path.join(BASE, 'sprout-prism-v003.glb'))
manifest = json.load(open(PATH.replace('.glb', '.manifest.json'), encoding='utf8'))
assert hashlib.sha256(data).hexdigest() == manifest['sha256']
assert binary[:len(old_binary)] == old_binary
for key in ('nodes', 'skins', 'meshes', 'materials', 'textures', 'images', 'samplers'):
    assert doc[key] == old[key]
assert doc['animations'][:len(old['animations'])] == old['animations']
assert len(doc['animations']) == 11
assert len(doc['skins'][0]['joints']) == 9

def values(index):
    accessor = doc['accessors'][index]
    view = doc['bufferViews'][accessor['bufferView']]
    assert accessor['componentType'] == 5126 and 'sparse' not in accessor
    width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    flat = struct.unpack_from('<' + 'f'*(accessor['count']*width), binary, start)
    assert all(math.isfinite(value) for value in flat)
    return list(flat), width

channels = {}
checks = []
bone_names = {'ROOT', 'BODY', 'FACE_MOUNT', 'FOOT_L', 'FOOT_R', 'BUD_L_BASE', 'BUD_L_TIP', 'BUD_R_BASE', 'BUD_R_TIP'}
for animation in doc['animations'][6:]:
    name = animation['name']
    expected = {('REACTION_ROOT', prop) for prop in ('rotation', 'scale')} if name == 'Sprout_Done' else {(bone, prop) for bone in bone_names for prop in ('translation', 'rotation', 'scale')} | {('SPROUT_BODY', 'weights'), ('SPROUT_CORE', 'weights')}
    if name in ('Sprout_SleepEnter', 'Sprout_SleepLoop', 'Sprout_Wake'):
        expected |= {(lid, 'scale') for lid in ('LID_L', 'LID_R')}
    actual = {(doc['nodes'][c['target']['node']]['name'], c['target']['path']) for c in animation['channels']}
    assert actual == expected and len(actual) == len(animation['channels'])
    channels[name] = {}
    duration = 0
    for c in animation['channels']:
        signature = (doc['nodes'][c['target']['node']]['name'], c['target']['path'])
        sampler = animation['samplers'][c['sampler']]
        times, _ = values(sampler['input'])
        flat, width = values(sampler['output'])
        width = 3 if signature[1] == 'weights' else width
        assert len(flat) == len(times)*width
        assert times[0] == 0 and all(b > a for a, b in zip(times, times[1:]))
        duration = max(duration, times[-1])
        channels[name][signature] = {'times': times, 'values': [flat[i:i+width] for i in range(0, len(flat), width)]}
    assert abs(duration - manifest['new_clips'][name]['duration']) < 1e-6
    left, right = channels[name].get(('SPROUT_BODY', 'weights')), channels[name].get(('SPROUT_CORE', 'weights'))
    assert left == right
    checks.append({'clip': name, 'duration': duration, 'channels': len(actual), 'complete_ownership': True, 'paired_morph_samples_equal': left is not None if name != 'Sprout_Done' else 'not_owned'})

def pose(clip, last=False):
    return {signature: channel['values'][-1 if last else 0] for signature, channel in channels[clip].items()}

def error(a, b):
    assert set(a) == set(b)
    return max(abs(x-y) for signature in a for x, y in zip(a[signature], b[signature]))

seams = {'Joy_neutral_endpoints': error(pose('Sprout_JoyJump'), pose('Sprout_JoyJump', True)),
         'Done_neutral_endpoints': error(pose('Sprout_Done'), pose('Sprout_Done', True)),
         'Sleep_enter_to_loop': error(pose('Sprout_SleepEnter', True), pose('Sprout_SleepLoop')),
         'Sleep_loop_endpoint': error(pose('Sprout_SleepLoop'), pose('Sprout_SleepLoop', True)),
         'Sleep_loop_to_wake': error(pose('Sprout_SleepLoop'), pose('Sprout_Wake'))}
joy_neutral = pose('Sprout_JoyJump')
wake_neutral = {signature: value for signature, value in pose('Sprout_Wake', True).items() if signature in joy_neutral}
seams['Wake_to_neutral'] = error(joy_neutral, wake_neutral)
assert max(seams.values()) < 1e-6
lid_errors = {}
for lid in ('LID_L', 'LID_R'):
    scale = channels['Sprout_SleepLoop'][(lid, 'scale')]['values']
    lid_errors[lid] = max(abs(a-b) for row in scale for a,b in zip(row, scale[0]))
    assert lid_errors[lid] < 1e-6, 'Sleeping lids must stay closed within float32 export precision.'
    assert scale[0][0] >= .999 and scale[0][2] >= .999
sleep = channels['Sprout_SleepLoop']
velocities = []
for signature, channel in sleep.items():
    if len(channel['times']) < 3:
        continue
    times, rows = channel['times'], channel['values']
    v0 = [(b-a)/(times[1]-times[0]) for a,b in zip(rows[0], rows[1])]
    v1 = [(b-a)/(times[-1]-times[-2]) for a,b in zip(rows[-2], rows[-1])]
    velocities.append({'node': signature[0], 'path': signature[1], 'max_one_sided_seam_velocity_difference': max(abs(a-b) for a,b in zip(v0,v1))})
report = {'asset': PATH, 'sha256': manifest['sha256'], 'bytes': len(data), 'pass': True,
          'old_v003_sha256': hashlib.sha256(old_data).hexdigest(),
          'preserved': ['exact old binary prefix', 'nodes/skins/geometry/materials/images/textures', 'all6 old animation streams'],
          'new_clips': checks, 'endpoint_max_error': seams, 'sleep_lid_max_sample_spread': lid_errors, 'sleep_velocity_seam': velocities,
          'scope': 'Exact glTF stream/owner/sample audit; no material pixel decoding, skin collision, controller crossfade, or display timing claim.'}
output = os.path.join(BASE, 'proofs', 'v004-binary-contract.json')
with open(output, 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
print(json.dumps({'report': output, 'pass': True, 'seams': seams, 'max_sleep_velocity_difference': max(row['max_one_sided_seam_velocity_difference'] for row in velocities)}))
