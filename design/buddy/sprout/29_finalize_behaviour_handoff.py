"""Record owned PNG/check integrity and historical provenance; no public writes."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
manifest_path = BASE/'sprout-prism-v004.manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
for kind, filename, report in [('idle', 'sprout-prism-v004.png', 'v004-idle-render.json'),
                               ('sleeping', 'sprout-prism-sleep-v004.png', 'v004-sleep-render.json')]:
    render = json.loads((BASE/'proofs'/report).read_text(encoding='utf8'))
    image = render['images'][0]
    path = BASE/filename
    assert hashlib.sha256(path.read_bytes()).hexdigest() == image['sha256']
    assert render['asset_sha256'] == manifest['sha256']
    assert render['source_sha256'] == manifest['editable_source_sha256']
    manifest.setdefault('fallbacks', {})[kind] = {'path': str(path), 'sha256': image['sha256'],
                                                 'bytes': path.stat().st_size, 'size': render['size'],
                                                 'clip': image['clip'], 'time': image['time'],
                                                 'render_report': str(BASE/'proofs'/report), 'visually_reviewed': True,
                                                 'public_promotion': 'Integration lead only'}
for kind, filename in [('binary_contract', 'v004-binary-contract.json'), ('validator', 'v004-gltf-validation.json')]:
    path = BASE/'proofs'/filename
    report = json.loads(path.read_text(encoding='utf8'))
    assert report['sha256'] == manifest['sha256']
    passed = report.get('pass', report.get('issues', {}).get('numErrors', 1) == 0)
    assert passed
    manifest.setdefault('checks', {})[kind] = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'pass': passed}
manifest['visual_selection'] = {'sleep_variant': 'D', 'recline_radians': -.91, 'BODY_local_vertical_scale': .82,
                                'FACE_MOUNT_countertilt_radians': .55, 'lids': 'Original thin closed lids, full scale1; no extra eye/glint/gaze channels',
                                'reason': 'Fine creases face viewer; navy eye undersides are covered while body still reclines with feet forward.',
                                'reference_image': str(BASE/'proofs/sprout-v004-sleep-face-D.png'),
                                'accepted_scope': 'Root visual source-pose approval and reviewed final sleeping PNG; actual browser/native integration separately verified by lead/runtime.'}
manifest['limits'] = ['Nearest-normal core containment is sampled, not exhaustive collision proof.',
                      'All11mesh bounds sampled every authored24Hz frame; continuous subframe extrema/native projection/Z path belong to integration.',
                      'Cycles PNGs are source-backed approximations, not identical Three pixels or native desktop refraction.']
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf8')
initial_path = BASE/'sprout-prism-initial-v004.manifest.json'
initial = json.loads(initial_path.read_text(encoding='utf8'))
initial['path'] = str(BASE/'sprout-prism-initial-v004.glb')
initial['editable_source'] = str(BASE/'source/sprout-prism-behaviours-initial-v004.blend')
initial['status'] = 'Historical initial candidate rejected for visible navy eye undersides in reclined sleep; use finalv004 instead.'
initial.pop('source_export', None)
initial.pop('source_export_sha256', None)
assert hashlib.sha256(Path(initial['path']).read_bytes()).hexdigest() == initial['sha256']
assert hashlib.sha256(Path(initial['editable_source']).read_bytes()).hexdigest() == initial['editable_source_sha256']
initial_path.write_text(json.dumps(initial, indent=2)+'\n', encoding='utf8')
for filename in ('v004-poses-render.json', 'v004-sleep-study-render.json', 'v004-sleep-study-corrected-render.json', 'v004-sleep-face-study-render.json'):
    path = BASE/'proofs'/filename
    report = json.loads(path.read_text(encoding='utf8'))
    if report['source_sha256'] == initial['editable_source_sha256']:
        report['source'] = initial['editable_source']
        report['asset_path'] = initial['path']
        report['historical_initial_candidate'] = True
    if filename == 'v004-sleep-study-render.json':
        report['valid'] = False
        report['reason'] = 'NLA reevaluation restored initial pose duringrender, undoing temporary study overrides; excluded from acceptance.'
        report['superseded_by'] = str(BASE/'proofs/v004-sleep-study-corrected-render.json')
    path.write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
print(json.dumps({'asset_sha256': manifest['sha256'], 'fallbacks': manifest['fallbacks'], 'checks': manifest['checks']}))
