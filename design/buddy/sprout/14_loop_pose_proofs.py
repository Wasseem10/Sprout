"""Render named loop phases from the saved master without saving or changing it.

Run in a separate background Blender process with source/sprout-prism-v002.blend.
The connected interactive Blender session is not used by this proof.
"""
import bpy
import hashlib
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
source = bpy.data.filepath
if os.path.basename(source) != 'sprout-prism-v002.blend':
    raise RuntimeError('Open the versioned Sprout master before running this proof.')
scene = bpy.data.scenes['INSIGHTOS_Sprout_v002']
bpy.context.window.scene = scene
scene.cycles.device = 'CPU'
helper_path = os.path.join(BASE, '06_render_proof.py')
with open(helper_path, encoding='utf8') as handle:
    helper = compile(handle.read(), helper_path, 'exec')
SIZE = 320
SAMPLES = 24
CLIP = 'Sprout_Idle'
images = []
for FRAME, label in [(1, 'start'), (73, 'mid'), (145, 'seam')]:
    OUTPUT = 'final-idle-' + label + '.png'
    exec(helper)
    images.append({'file': OUTPUT, 'frame': FRAME, 'clipSeconds': (FRAME - 1) / 24})
with open(source, 'rb') as handle:
    source_hash = hashlib.sha256(handle.read()).hexdigest()
report = {
    'source': source,
    'source_sha256': source_hash,
    'clip': CLIP,
    'size': SIZE,
    'samples': SAMPLES,
    'fps': scene.render.fps,
    'camera': scene.camera.name,
    'camera_location': list(scene.camera.location),
    'orthographic_span': scene.camera.data.ortho_scale,
    'view_transform': scene.view_settings.view_transform,
    'exposure': scene.view_settings.exposure,
    'images': images,
    'scope': 'Separate background Blender; exact authored Idle keyframes. No source save or live-host mutation.',
}
with open(os.path.join(BASE, 'proofs', 'final-idle-loop-inventory.json'), 'w', encoding='utf8') as handle:
    json.dump(report, handle, indent=2)
print(json.dumps(report))
