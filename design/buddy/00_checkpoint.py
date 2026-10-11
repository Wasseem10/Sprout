"""Recovery copy only; explicitly preserve the active document path."""
import bpy
import datetime
import os
folder = r'D:\hackathon2026\insightos-ui\.local\blender-checkpoints'
os.makedirs(folder, exist_ok=True)
label = globals().get('LABEL', 'Aperture-checkpoint')
before = bpy.data.filepath
target = os.path.join(folder, datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '_' + label + '.blend')
bpy.ops.wm.save_as_mainfile(filepath=target, copy=True, compress=True, check_existing=False)
assert bpy.data.filepath == before
print({'checkpoint': target, 'active_filepath_unchanged': bpy.data.filepath == before})
