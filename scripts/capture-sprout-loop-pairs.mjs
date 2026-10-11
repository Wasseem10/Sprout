import { chromium, expect } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Proof-only route instrumentation. The delivered renderer/controller and GLB
// stay unchanged; its authored camera, material handling and environment run.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/sprout-loop-pairs');
const sourceProofs = path.join(root, 'design/buddy/sprout/proofs');
const baseURL = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';
const phases = [
  { name: 'start', seconds: 0, frame: 1 },
  { name: 'mid', seconds: 3, frame: 73 },
  { name: 'seam', seconds: 6, frame: 145 },
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = await readFile(path.join(root, 'design/buddy/sprout/sprout-prism-v002.glb'));
const assetSha256 = digest(canonical);
assert.equal(digest(await readFile(path.join(root, 'public/buddy/sprout-v002.glb'))), assetSha256);
await mkdir(output, { recursive: true });
const reportFile = path.join(output, 'report.json');

const hook = `
  // Injected by capture-sprout-loop-pairs.mjs in this isolated proof only.
  window.__sproutLoopProof = {
    capture(seconds) {
      if (asset !== 'sprout' || !controller) throw new Error('Expected actual Sprout controller');
      if (![0, 3, 6].includes(seconds)) throw new Error('Unexpected proof timestamp');
      cancelAnimationFrame(frame);
      frame = 0;
      nextBlink = Infinity;
      pointer = { x: 0, y: 0 };
      settings = { phase: 'idle', motion: true, gaze: { x: 0, y: 0 } };
      // Public controller resets clear reactions/gaze. No private bone/morph
      // overrides: actual Idle is evaluated by the delivered mixer/compositor.
      controller.setPhase('idle');
      controller.setMotion(false);
      controller.setMotion(true);
      controller.setGaze(0, 0);
      controller.update(seconds);
      elapsed = seconds;
      envelope.reset();
      draw(performance.now(), 0);
      model.updateMatrixWorld(true);
      const matrices = {};
      const morphs = {};
      const named = new Set(['ROOT','BODY','FACE_MOUNT','BUD_L_BASE','BUD_L_TIP',
        'BUD_R_BASE','BUD_R_TIP','FOOT_L','FOOT_R','REACTION_ROOT','GAZE_L','GAZE_R',
        'EYE_L','EYE_R','LID_L','LID_R']);
      model.traverse((node) => {
        if (named.has(node.name)) matrices[node.name] = node.matrixWorld.toArray();
        if (node.morphTargetInfluences) morphs[node.name] = [...node.morphTargetInfluences];
      });
      return {
        png: canvas.toDataURL('image/png'),
        requestedSeconds: seconds,
        snapshot: controller.snapshot(),
        matrices,
        morphs,
        camera: {
          position: camera.position.toArray(), up: camera.up.toArray(),
          quaternion: camera.quaternion.toArray(),
          left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom,
          near: camera.near, far: camera.far,
        },
        resolution: [canvas.width, canvas.height],
        asset,
        clips: gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration })),
      };
    },
    dispose() { controller.dispose(); },
  };
`;

let report;
if (process.argv.includes('--assemble-only')) {
  report = JSON.parse(await readFile(reportFile, 'utf8'));
  assert.equal(report.assetSha256, assetSha256);
  assert.equal(report.browserPass, true);
} else {
  report = {
    checkedAt: new Date().toISOString(),
    assetSha256,
    assetBytes: canonical.byteLength,
    scope:
      'Exact-time pose/shape captures through the actual buddyRenderer on a local Vite origin; not a performance, provider or physical-display test.',
    instrumentation: [
      'A Playwright response route injects a capture closure into the served buddyRenderer module; no shipping source or model changes.',
      'Automatic RAF advancement is disabled only in this isolated page. The actual public SproutMotionController resets and evaluates Idle at 0, 3 and 6 seconds.',
      'Gaze is centered; no click/manual blink or automatic blink is scheduled. The 6-second repeating action wraps to its opening pose, representing the playback seam.',
      'Camera, glTF material handling, AgX tone mapping, authored browser reflection-card environment and directional lights are unchanged.',
    ],
    sourceHashes: {
      renderer: digest(await readFile(path.join(root, 'src/buddyRenderer.ts'))),
      controller: digest(await readFile(path.join(root, 'src/buddyMotionController.ts'))),
    },
    errors: [],
    apiCalls: [],
    servedAssets: [],
    captures: [],
    browserPass: false,
    pass: false,
  };
  const browser = await chromium.launch();
  const deadline = setTimeout(() => void browser.close(), 60000);
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 320 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) report.apiCalls.push(request.url());
    });
    await page.route('**/api/**', (route) => route.abort());
    const inspections = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname !== '/buddy/sprout-v002.glb') return;
      inspections.push(
        (async () => {
          const bytes = await response.body();
          assert.equal(response.status(), 200);
          assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
          assert.equal(bytes.readUInt32LE(4), 2);
          assert.equal(bytes.readUInt32LE(8), bytes.length);
          assert.equal(digest(bytes), assetSha256);
          report.servedAssets.push({
            url: response.url(),
            contentType: response.headers()['content-type'],
            version: 2,
            bytes: bytes.length,
            sha256: digest(bytes),
          });
        })(),
      );
    });
    let instrumentedModules = 0;
    await page.route(/\/src\/buddyRenderer\.ts(?:\?|$)/, async (route) => {
      const response = await route.fetch();
      let code = await response.text();
      assert.equal(code.split('const shouldAnimate = () =>').length - 1, 1);
      assert.equal(code.split('const tick = (now) => {').length - 1, 1);
      code = code.replace('const shouldAnimate = () =>', 'const shouldAnimate = () => false &&');
      code = code.replace('const tick = (now) => {', `${hook}\nconst tick = (now) => {`);
      instrumentedModules += 1;
      await route.fulfill({ response, body: code });
    });
    await page.route(`${baseURL}/__sprout-loop-proof`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><title>Sprout exact-time proof fixture</title>
        <style>html,body{margin:0;width:320px;height:320px;background:transparent}
        #proof{width:320px;height:320px}canvas{display:block;width:100%;height:100%}</style></head>
        <body><div id="proof"><canvas aria-label="Test-only exact-time Sprout" id="model"></canvas></div>
        <script type="module">import { createBuddyRenderer } from '/src/buddyRenderer.ts';
        window.__loopReady=false;
        window.__loopRenderer=await createBuddyRenderer(document.querySelector('#model'),
          {phase:'idle',motion:false},ready=>window.__loopReady=ready);
        </script></body></html>`,
      }),
    );
    await page.goto(`${baseURL}/__sprout-loop-proof`);
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__loopReady && window.__sproutLoopProof)), {
        timeout: 30000,
      })
      .toBe(true);
    for (const phase of phases) {
      const capture = await page.evaluate(
        (seconds) => window.__sproutLoopProof.capture(seconds),
        phase.seconds,
      );
      const bytes = Buffer.from(capture.png.split(',')[1], 'base64');
      const filename = `browser-idle-${phase.name}.png`;
      await writeFile(path.join(output, filename), bytes);
      const { png, ...evidence } = capture;
      assert.equal(capture.asset, 'sprout');
      assert.deepEqual(capture.resolution, [320, 320]);
      assert.equal(capture.snapshot.phase, 'idle');
      assert.equal(capture.snapshot.weights.Sprout_Idle, 1);
      assert.equal(capture.snapshot.clickActive, false);
      assert.equal(capture.snapshot.blinkActive, false);
      assert.deepEqual(capture.snapshot.gaze, { x: 0, y: 0 });
      report.captures.push({
        filename,
        pngSha256: digest(bytes),
        sourceFrame: phase.frame,
        ...evidence,
      });
    }
    await Promise.all(inspections);
    assert.equal(instrumentedModules, 1);
    assert.equal(report.servedAssets.length, 1);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.apiCalls, []);
    const start = report.captures[0];
    const seam = report.captures[2];
    report.endpointMatrixMaxDifference = Math.max(
      ...Object.keys(start.matrices).flatMap((name) =>
        start.matrices[name].map((value, index) => Math.abs(value - seam.matrices[name][index])),
      ),
    );
    assert.ok(report.endpointMatrixMaxDifference < 1e-5);
    report.browserEndpointPixelsIdentical = start.pngSha256 === seam.pngSha256;
    report.browserPass = true;
    await page.evaluate(() => window.__loopRenderer.dispose());
  } catch (error) {
    report.failure = error.stack || String(error);
    throw error;
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  }
}

const inventory = JSON.parse(
  await readFile(path.join(sourceProofs, 'final-idle-loop-inventory.json'), 'utf8'),
);
assert.equal(inventory.clip, 'Sprout_Idle');
assert.equal(inventory.size, 320);
assert.equal(digest(await readFile(inventory.source)), inventory.source_sha256);
report.blender = inventory;
report.comparisonScope =
  'Matched authored camera and Idle sample times compare silhouette, eye mounting, pose and broad normal/specular flow. Cycles/Three lights, reflections, tone mapping and antialiasing differ; no pixel-identical rendering claim.';
const board = createCanvas(1008, 764);
const context = board.getContext('2d');
context.fillStyle = '#e6edf1';
context.fillRect(0, 0, board.width, board.height);
context.fillStyle = '#142d46';
context.font = 'bold 20px Arial';
context.fillText('Sprout Idle — matched authored pose / camera', 16, 27);
context.font = '13px Arial';
context.fillText(
  'Blender above · actual browser renderer below · original current GLB · lighting/raster differences expected',
  16,
  49,
);
report.pairs = [];
for (const [index, phase] of phases.entries()) {
  const source = inventory.images.find((item) => item.frame === phase.frame);
  assert.equal(source?.clipSeconds, phase.seconds);
  const browserFile = `browser-idle-${phase.name}.png`;
  const blenderBytes = await readFile(path.join(sourceProofs, source.file));
  const browserBytes = await readFile(path.join(output, browserFile));
  const blenderImage = await loadImage(blenderBytes);
  const browserImage = await loadImage(browserBytes);
  assert.equal(blenderImage.width, 320);
  assert.equal(blenderImage.height, 320);
  assert.equal(browserImage.width, 320);
  assert.equal(browserImage.height, 320);
  const x = 16 + index * 328;
  context.drawImage(blenderImage, x, 64);
  context.drawImage(browserImage, x, 414);
  context.fillStyle = '#142d46';
  context.font = '16px Arial';
  context.fillText(`Blender frame ${phase.frame} · ${phase.seconds}s`, x + 7, 405);
  context.fillText(`Browser Idle ${phase.seconds}s · ${phase.name}`, x + 7, 755);
  report.pairs.push({
    seconds: phase.seconds,
    sourceFrame: phase.frame,
    blenderFile: path.relative(root, path.join(sourceProofs, source.file)).replaceAll('\\', '/'),
    blenderPngSha256: digest(blenderBytes),
    browserFile,
    browserPngSha256: digest(browserBytes),
  });
}
await writeFile(path.join(output, 'matched-idle-board.png'), board.toBuffer('image/png'));
report.board = 'matched-idle-board.png';
report.pass = true;
await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    pass: report.pass,
    assetSha256,
    reportFile,
    board: path.join(output, report.board),
    endpointMatrixMaxDifference: report.endpointMatrixMaxDifference,
    browserEndpointPixelsIdentical: report.browserEndpointPixelsIdentical,
  }),
);
