import { chromium, expect } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Box3,
  Group,
  OrthographicCamera,
  Ray,
  SkinnedMesh,
  Texture,
  Triangle,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Owned local proof fixture. It calls the actual public renderer interface;
// no scene, clock, shader or product-module instrumentation is injected.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = path.resolve(root, argument('output', 'artifacts/sprout-glossy-study'));
assert.ok(
  output.startsWith(path.join(root, 'artifacts') + path.sep),
  'Proof output must stay within artifacts',
);
const reflectionProfile = argument('profile', 'rectangular');
assert.ok(['rectangular', 'tapered'].includes(reflectionProfile));
const toneMapping = argument('tone', 'agx');
assert.ok(['agx', 'neutral'].includes(toneMapping));
const coreFilename = argument('core', 'sprout-core-v003.glb');
assert.ok(/^sprout-[a-z0-9-]+\.glb$/i.test(coreFilename));
const baseURL = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sizes = [44, 96, 160, 320];
const stillsOnly = process.argv.includes('--stills-only');
const captureSizes = stillsOnly ? [320, 96] : sizes;
const candidates = [
  { key: 'A', name: 'v002 control', filename: 'sprout-prism-v002.glb' },
  { key: 'B', name: 'volume glass', filename: 'sprout-volume-v003.glb' },
  { key: 'C', name: 'glass + blue core', filename: coreFilename },
];
await mkdir(output, { recursive: true });
const bytesByURL = new Map();
for (const candidate of candidates) {
  const bytes = await readFile(path.join(root, 'design/buddy/sprout', candidate.filename));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.byteLength);
  candidate.url = `/buddy/${candidate.filename}`;
  candidate.sha256 = digest(bytes);
  candidate.bytes = bytes.byteLength;
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binaryOffset = 20 + jsonLength + 8;
  candidate.images = (doc.images ?? []).map((image) => {
    assert.equal(image.mimeType, 'image/png');
    assert.equal(bytes.readUInt32LE(binaryOffset - 4), 0x004e4942);
    const view = doc.bufferViews[image.bufferView];
    const pixels = bytes.subarray(
      binaryOffset + (view.byteOffset ?? 0),
      binaryOffset + (view.byteOffset ?? 0) + view.byteLength,
    );
    assert.equal(pixels.toString('hex', 0, 8), '89504e470d0a1a0a');
    return {
      mimeType: image.mimeType,
      bytes: pixels.byteLength,
      sha256: digest(pixels),
      width: pixels.readUInt32BE(16),
      height: pixels.readUInt32BE(20),
    };
  });
  bytesByURL.set(candidate.url, bytes);
}
// Geometry-only CPU checks deliberately do not decode image pixels. The real
// browser loader is used separately for every material/look acceptance capture.
async function parseGeometry(bytes) {
  const loader = new GLTFLoader().register(() => ({
    name: 'OwnedProofNoImagePixels',
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
if (process.argv.includes('--containment-only')) {
  const { SproutMotionController, SproutAttentionController, auditSproutModel } =
    await import('../src/buddyMotionController.ts');
  const chosen = candidates[2];
  const gltf = await parseGeometry(bytesByURL.get(chosen.url));
  assert.deepEqual(auditSproutModel(gltf.scene, gltf.animations), []);
  const shell = gltf.scene.getObjectByName('SPROUT_BODY');
  const core = gltf.scene.getObjectByName('SPROUT_CORE');
  assert.ok(shell instanceof SkinnedMesh && core instanceof SkinnedMesh);
  const mount = new Group();
  mount.add(gltf.scene);
  const attention = new SproutAttentionController(mount);
  attention.setTarget(1, 1);
  attention.update(10);
  const count = shell.geometry.attributes.position.count;
  const points = Array.from({ length: count }, () => new Vector3());
  const index = shell.geometry.index;
  const triangleCount = (index?.count ?? count) / 3;
  const triangles = Array.from({ length: triangleCount }, (_, id) =>
    [0, 1, 2].map((offset) => index?.getX(id * 3 + offset) ?? id * 3 + offset),
  );
  const updatePoints = () => {
    mount.updateMatrixWorld(true);
    shell.skeleton.update();
    core.skeleton.update();
    for (let vertex = 0; vertex < count; vertex++)
      shell.getVertexPosition(vertex, points[vertex]).applyMatrix4(shell.matrixWorld);
  };
  updatePoints();
  // A small original triangle BVH accelerates exact posed-surface queries.
  // Its partition is built once; bounds are refit after each actual mixer pose.
  const makeNode = (ids) => {
    const box = new Box3();
    for (const id of ids) for (const vertex of triangles[id]) box.expandByPoint(points[vertex]);
    if (ids.length <= 12) return { box, ids };
    const extent = box.getSize(new Vector3());
    const axis = extent.x > extent.y && extent.x > extent.z ? 'x' : extent.y > extent.z ? 'y' : 'z';
    const center = (id) => triangles[id].reduce((sum, vertex) => sum + points[vertex][axis], 0);
    ids.sort((a, b) => center(a) - center(b));
    const middle = Math.floor(ids.length / 2);
    return { box, left: makeNode(ids.slice(0, middle)), right: makeNode(ids.slice(middle)) };
  };
  const bvh = makeNode(triangles.map((_, id) => id));
  const refit = (node) => {
    node.box.makeEmpty();
    if (node.ids) {
      for (const id of node.ids)
        for (const vertex of triangles[id]) node.box.expandByPoint(points[vertex]);
    } else {
      refit(node.left);
      refit(node.right);
      node.box.union(node.left.box).union(node.right.box);
    }
  };
  const triangle = new Triangle(),
    closest = new Vector3(),
    hit = new Vector3();
  const ray = new Ray(new Vector3(), new Vector3(0.917, 0.301, 0.263).normalize());
  const setTriangle = (id) => triangle.set(...triangles[id].map((vertex) => points[vertex]));
  const nearestDistance = (point) => {
    let best = Infinity;
    const visit = (node) => {
      if (node.box.distanceToPoint(point) >= best) return;
      if (node.ids) {
        for (const id of node.ids) {
          setTriangle(id).closestPointToPoint(point, closest);
          best = Math.min(best, point.distanceTo(closest));
        }
      } else {
        const children = [node.left, node.right].sort(
          (a, b) => a.box.distanceToPoint(point) - b.box.distanceToPoint(point),
        );
        for (const child of children) visit(child);
      }
    };
    visit(bvh);
    return best;
  };
  const inside = (point) => {
    ray.origin.copy(point);
    const hits = [];
    const visit = (node) => {
      if (!ray.intersectsBox(node.box)) return;
      if (node.ids) {
        for (const id of node.ids) {
          setTriangle(id);
          if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit))
            hits.push(point.distanceTo(hit));
        }
      } else {
        visit(node.left);
        visit(node.right);
      }
    };
    visit(bvh);
    hits.sort((a, b) => a - b);
    // Shared edge/split-vertex intersections describe one surface crossing.
    const unique = hits.filter((distance, i) => i === 0 || distance - hits[i - 1] > 1e-5);
    return unique.length % 2 === 1;
  };
  const states = [];
  for (const phase of ['idle', 'listening', 'thinking', 'speaking'])
    for (const seconds of [0, 0.75, 1.5, 3, 5.99])
      for (const compression of [8 / 27, 1]) states.push({ phase, seconds, compression });
  for (const seconds of [0.08, 0.16, 0.3, 0.55])
    for (const compression of [8 / 27, 1])
      states.push({ phase: 'idle', seconds, compression, click: true, blink: true });
  const proof = {
    checkedAt: new Date().toISOString(),
    scope:
      'CPU actual exported skinned/morphed core vertex containment against the posed shell surface using the actual motion controller, including paired additive weights and BODY/FACE compensation. Sampled states and vertices, not a continuous swept-volume proof or material/render/performance acceptance.',
    instrumentation:
      'GLTFLoader texture plugin returns empty Texture placeholders; image pixels are deliberately unverified here. Public controller setters and mixer update are exercised. Configured compression1 is a conservative manual stress input, not a claim that ordinary pointer motion reaches it. The outer attention mount is settled at right/up10/-6 degrees.',
    asset: chosen,
    sourceHashes: {
      controller: digest(await readFile(path.join(root, 'src/buddyMotionController.ts'))),
    },
    coreVertices: core.geometry.attributes.position.count,
    shellVertices: count,
    shellTriangles: triangleCount,
    states: [],
    pass: false,
  };
  const point = new Vector3();
  for (const state of states) {
    const controller = new SproutMotionController(gltf.scene, gltf.animations, 0.04);
    controller.setPhase(state.phase);
    controller.setGaze(1, 1);
    if (state.click) controller.react('Sprout_Click');
    if (state.blink) controller.react('Sprout_Blink');
    let remaining = state.seconds;
    while (remaining > 1e-9) {
      const step = Math.min(1 / 120, remaining);
      controller.update(step);
      remaining -= step;
    }
    controller.setAttentionCompression(0);
    controller.update(0);
    mount.updateMatrixWorld(true);
    const eyeScales = ['EYE_L', 'EYE_R'].map((name) =>
      gltf.scene.getObjectByName(name).getWorldScale(new Vector3()),
    );
    controller.setAttentionCompression(state.compression);
    controller.update(0);
    updatePoints();
    const eyeScaleRelativeError = Math.max(
      ...['EYE_L', 'EYE_R'].flatMap((name, i) => {
        const scale = gltf.scene.getObjectByName(name).getWorldScale(new Vector3());
        return ['x', 'y', 'z'].map((axis) => Math.abs(scale[axis] / eyeScales[i][axis] - 1));
      }),
    );
    refit(bvh);
    let outsideVertices = 0,
      minimumClearance = Infinity;
    for (let vertex = 0; vertex < proof.coreVertices; vertex++) {
      core.getVertexPosition(vertex, point).applyMatrix4(core.matrixWorld);
      if (!inside(point)) outsideVertices++;
      minimumClearance = Math.min(minimumClearance, nearestDistance(point));
    }
    proof.states.push({
      ...state,
      outsideVertices,
      minimumClearance,
      eyeScaleRelativeError,
      snapshot: controller.snapshot(),
    });
    controller.resetGaze();
    controller.dispose();
  }
  proof.pass = proof.states.every(
    (state) =>
      state.outsideVertices === 0 &&
      state.minimumClearance > 1e-5 &&
      state.eyeScaleRelativeError < 0.001,
  );
  proof.minimumClearance = Math.min(...proof.states.map((state) => state.minimumClearance));
  proof.maximumEyeScaleRelativeError = Math.max(
    ...proof.states.map((state) => state.eyeScaleRelativeError),
  );
  proof.eyeScaleScope =
    'World eye scale compared with the same authored pose at compression0; proposed acceptance tolerance0.1%. Inverse FACE compensation is sampled, so the error is bounded rather than mathematically zero for every animated BODY basis scale.';
  await writeFile(
    path.join(output, 'runtime-core-containment.json'),
    JSON.stringify(proof, null, 2) + '\n',
  );
  assert.ok(proof.pass, 'An exported runtime pose puts core vertices outside the shell');
  console.log(
    `Exported controller core containment passed: ${proof.states.length}states, min${proof.minimumClearance}`,
  );
  process.exit(0);
}
if (process.argv.includes('--quantify-goo')) {
  const bytes = bytesByURL.get(candidates[2].url);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const shell = gltf.scene.getObjectByName('SPROUT_BODY');
  assert.ok(shell instanceof SkinnedMesh);
  gltf.scene.updateMatrixWorld(true);
  shell.skeleton.update();
  const camera = new OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 30);
  camera.position.set(0.1, 0.24, 6);
  camera.lookAt(0, 0.08, 0);
  camera.updateMatrixWorld(true);
  const index = shell.morphTargetDictionary.Jelly_Squash;
  const point = new Vector3();
  const count = shell.geometry.attributes.position.count;
  const basis = new Float64Array(count * 2);
  shell.morphTargetInfluences.fill(0);
  for (let vertex = 0; vertex < count; vertex++) {
    shell.getVertexPosition(vertex, point).applyMatrix4(shell.matrixWorld).project(camera);
    basis[vertex * 2] = point.x;
    basis[vertex * 2 + 1] = point.y;
  }
  shell.morphTargetInfluences[index] = 1;
  let max = 0,
    sum = 0;
  for (let vertex = 0; vertex < count; vertex++) {
    shell.getVertexPosition(vertex, point).applyMatrix4(shell.matrixWorld).project(camera);
    const displacement =
      Math.hypot(point.x - basis[vertex * 2], point.y - basis[vertex * 2 + 1]) * 48;
    max = Math.max(max, displacement);
    sum += displacement * displacement;
  }
  // For a fixed target step, cascade6/9 peaks at ln(9/6)/(9-6).
  const peakSeconds = Math.log(9 / 6) / 3;
  const response = (6 * (Math.exp(-9 * peakSeconds) - Math.exp(-6 * peakSeconds))) / (6 - 9);
  const calibration = {
    scope:
      'CPU projected-vertex calibration of the actual C export at its bind pose, 96CSSpx, actual renderer camera/span. No raster, specular or complete animated silhouette measurement; morph deltas are linear at this fixed skin pose.',
    assetSha256: candidates[2].sha256,
    fullSquash: { maxVertexPixels: max, rmsVertexPixels: Math.sqrt(sum / count) },
    maximumOppositeCornerStep: {
      peakSeconds,
      response,
      baselineWeight: 0.065 * response,
      baselineMaxVertexPixels: max * 0.065 * response,
    },
    proposedTrials: [0.45, 0.65, 1].map((bound) => ({
      maximumCompression: bound,
      peakWeight: bound * response,
      maxVertexPixels: max * bound * response,
    })),
  };
  await writeFile(
    path.join(output, 'goo-calibration.json'),
    JSON.stringify(calibration, null, 2) + '\n',
  );
  console.log(JSON.stringify(calibration, null, 2));
  process.exit(0);
}
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    'Actual Three renderer on an isolated local browser fixture. A/B/C use the same camera, lights, exposure and fixed PMREM environment. Not a native performance, provider, device-audio or physical-display test.',
  instrumentation:
    'Only network routes serve owned candidate GLBs and an isolated HTML fixture. The public createBuddyRenderer/diagnostics/update/dispose interface is used unchanged. Still captures park the authored Idle opening pose with motion:false. Pointer motion uses real Playwright mouse events; the blur-handler check dispatches an explicitly simulated window blur/focus event.',
  sourceHashes: {
    renderer: digest(await readFile(path.join(root, 'src/buddyRenderer.ts'))),
    controller: digest(await readFile(path.join(root, 'src/buddyMotionController.ts'))),
  },
  candidates,
  reflectionProfile,
  toneMapping,
  servedAssets: [],
  captures: [],
  backgrounds: [],
  attention: [],
  errors: [],
  apiCalls: [],
  pass: false,
};
async function assembleBoard(evidence) {
  const rowHeights = [105, 157, 221, 380];
  const board = createCanvas(1170, 75 + rowHeights.reduce((sum, height) => sum + height, 0));
  const ctx = board.getContext('2d');
  ctx.fillStyle = '#f0f8fc';
  ctx.fillRect(0, 0, board.width, board.height);
  ctx.fillStyle = '#123244';
  ctx.font = 'bold 20px sans-serif';
  for (let column = 0; column < candidates.length; column++)
    ctx.fillText(`${candidates[column].key} · ${candidates[column].name}`, column * 390 + 25, 35);
  ctx.font = '14px sans-serif';
  ctx.fillText(
    'Actual pixels · fixed camera / light / exposure · matched Idle opening pose',
    25,
    62,
  );
  let y = 75;
  for (let row = 0; row < sizes.length; row++) {
    const size = sizes[row];
    for (let column = 0; column < candidates.length; column++) {
      const capture = evidence.captures.find(
        (item) => item.candidate === candidates[column].key && item.size === size,
      );
      assert.ok(capture);
      assert.equal(capture.assetSha256, candidates[column].sha256);
      const filename = path.join(output, capture.filename);
      assert.equal(digest(await readFile(filename)), capture.pngSha256);
      const image = await loadImage(filename);
      ctx.fillStyle = '#456475';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${size}px`, column * 390 + 25, y + 23);
      ctx.drawImage(image, column * 390 + (390 - size) / 2, y + 35, size, size);
    }
    y += rowHeights[row];
  }
  await writeFile(path.join(output, 'matched-A-B-C.png'), board.toBuffer('image/png'));
  evidence.board = 'matched-A-B-C.png';
}
if (process.argv.includes('--assemble-only')) {
  const previous = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  await assembleBoard(previous);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(previous, null, 2) + '\n');
  process.exit(0);
}
const motionOnly = process.argv.includes('--motion-only');
assert.ok(!(motionOnly && stillsOnly), 'Choose either motion-only or stills-only');
if (motionOnly) {
  const previous = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  report.captures = previous.captures;
  report.stillSourceHashes = previous.stillSourceHashes ?? previous.sourceHashes;
  await assembleBoard(report);
}
const html = `<!doctype html><html><head><title>Glossy Sprout owned proof fixture</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:#f0f8fc;color:#123244;font:15px system-ui}
body{display:grid;place-items:center;min-height:100vh}#stage{display:grid;place-items:center;position:relative}
.studio-preview{display:grid;place-items:center;background:#f0f8fc}
#avatar{position:relative}canvas{display:block;width:100%;height:100%}#caption{position:absolute;left:18px;bottom:18px;right:18px;text-align:center;line-height:1.5;pointer-events:none}
</style></head><body><main id="stage"><section class="studio-preview"><div id="avatar"></div></section><div id="caption"></div></main>
<script type="module">
import {createBuddyRenderer} from '/src/buddyRenderer.ts';
window.__proofReady=false;
window.__proofCreate=async({url,size,motion=false,wide=false,offset=false,reflectionProfile='rectangular',toneMapping='agx'})=>{
  window.__proofRenderer?.dispose();window.__proofRenderer=null;window.__proofReady=false;
  const region=document.querySelector('.studio-preview');
  region.style.width=(wide?560:size)+'px';region.style.height=(wide?420:size)+'px';
  region.style.alignItems=offset?'start':'center';region.style.justifyItems=offset?'start':'center';
  region.style.paddingTop=offset?'36px':'0';region.style.paddingLeft=offset?'26px':'0';
  const owner=document.querySelector('#avatar');owner.style.width=size+'px';owner.style.height=size+'px';
  owner.innerHTML='<canvas aria-label="Owned Sprout study"></canvas>';
  window.__proofSettings={phase:'idle',motion,assetUrl:url,reflectionProfile,toneMapping};
  window.__proofRenderer=await createBuddyRenderer(owner.firstElementChild,window.__proofSettings,ready=>window.__proofReady=ready);
  if(!window.__proofRenderer)throw new Error('Renderer creation failed');
  return window.__proofRenderer.diagnostics();
};
window.__proofUpdate=(change)=>{window.__proofSettings={...window.__proofSettings,...change};window.__proofRenderer.update(window.__proofSettings);};
window.__proofDiagnostics=()=>window.__proofRenderer.diagnostics();
window.__proofCaption=(text)=>document.querySelector('#caption').textContent=text;
window.__proofBackground=(background)=>{
  document.body.style.background=background;
  document.querySelector('.studio-preview').style.background=background;
};
window.__proofDispose=()=>{window.__proofRenderer?.dispose();window.__proofRenderer=null;};
</script></body></html>`;
const browser = await chromium.launch();
const deadline = setTimeout(() => void browser.close(), 120000);
const contexts = [];
const setup = async (context) => {
  contexts.push(context);
  await context.route('**/api/**', async (route) => {
    report.apiCalls.push(route.request().url());
    await route.abort();
  });
  await context.route('**/buddy/*.glb', async (route) => {
    const url = new URL(route.request().url()).pathname;
    const bytes = bytesByURL.get(url);
    assert.ok(bytes, `Unexpected fallback/model request ${url}`);
    report.servedAssets.push({ url, version: 2, bytes: bytes.length, sha256: digest(bytes) });
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: bytes });
  });
  await context.route(`${baseURL}/__sprout-glossy-proof`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(`${baseURL}/__sprout-glossy-proof`);
  await page.waitForFunction(() => Boolean(window.__proofCreate));
  return page;
};
try {
  if (!motionOnly) {
    const page = await setup(
      await browser.newContext({ viewport: { width: 440, height: 440 }, deviceScaleFactor: 1 }),
    );
    for (const candidate of stillsOnly ? [candidates[2]] : candidates) {
      for (const size of captureSizes) {
        const diagnostics = await page.evaluate((options) => window.__proofCreate(options), {
          url: candidate.url,
          size,
          reflectionProfile,
          toneMapping,
        });
        await expect
          .poll(() => page.evaluate(() => window.__proofReady), { timeout: 15000 })
          .toBe(true);
        assert.equal(diagnostics.assetUrl, candidate.url);
        assert.equal(diagnostics.reflectionProfile, reflectionProfile);
        assert.equal(diagnostics.toneMapping, toneMapping);
        assert.deepEqual(diagnostics.assetIssues, []);
        assert.equal(diagnostics.resolution, `${size} × ${size}`);
        assert.equal(diagnostics.clips.length, 6);
        assert.equal(diagnostics.attention.yaw, 0);
        assert.equal(diagnostics.attention.pitch, 0);
        if (candidate.images.length) {
          const coreMaterial = diagnostics.materials.find((material) =>
            material.name.startsWith('MAT_Sprout_Core'),
          );
          const image = candidate.images[0];
          assert.ok(coreMaterial, 'Embedded colour image must reach the actual core material');
          for (const map of [coreMaterial.baseColorMap, coreMaterial.emissiveMap])
            assert.deepEqual(map, { colorSpace: 'srgb', width: image.width, height: image.height });
        }
        const filename = `${candidate.key}-${size}.png`;
        await page.locator('#avatar').screenshot({ path: path.join(output, filename) });
        const png = await readFile(path.join(output, filename));
        report.captures.push({
          candidate: candidate.key,
          size,
          filename,
          pngSha256: digest(png),
          assetSha256: candidate.sha256,
          diagnostics,
        });
      }
      console.log(`Captured ${candidate.key}: ${captureSizes.join('/')}px`);
    }
    await page.evaluate(() => window.__proofDispose());
    await page.close();
    if (stillsOnly) {
      const board = createCanvas(620, 405);
      const ctx = board.getContext('2d');
      ctx.fillStyle = '#f0f8fc';
      ctx.fillRect(0, 0, board.width, board.height);
      ctx.fillStyle = '#123244';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`C · ${coreFilename} · ${toneMapping}`, 16, 25);
      ctx.font = '14px sans-serif';
      ctx.fillText('Actual320px', 16, 55);
      ctx.fillText('Actual96px', 410, 55);
      ctx.drawImage(await loadImage(path.join(output, 'C-320.png')), 16, 70);
      ctx.drawImage(await loadImage(path.join(output, 'C-96.png')), 410, 165);
      report.board = 'selected-320-96.png';
      report.scope += ' Bounded look study only: selected C at320/96; no motion acceptance.';
      await writeFile(path.join(output, report.board), board.toBuffer('image/png'));
    } else {
      await assembleBoard(report);
      const backgrounds = [
        { name: 'light', css: '#f0f8fc' },
        { name: 'dark', css: '#10212e' },
        {
          name: 'busy',
          css: 'repeating-linear-gradient(135deg,#ecd4a3 0px,#ecd4a3 25px,#598a88 25px,#598a88 50px,#607dba 50px,#607dba 75px)',
        },
      ];
      const backgroundPage = await setup(
        await browser.newContext({ viewport: { width: 440, height: 440 }, deviceScaleFactor: 1 }),
      );
      for (const size of [320, 96]) {
        await backgroundPage.evaluate((options) => window.__proofCreate(options), {
          url: candidates[2].url,
          size,
          reflectionProfile,
          toneMapping,
        });
        await expect
          .poll(() => backgroundPage.evaluate(() => window.__proofReady), { timeout: 15000 })
          .toBe(true);
        for (const background of backgrounds) {
          await backgroundPage.evaluate((css) => window.__proofBackground(css), background.css);
          const filename = `C-${size}-${background.name}.png`;
          await backgroundPage.locator('#avatar').screenshot({ path: path.join(output, filename) });
          report.backgrounds.push({
            size,
            background: background.name,
            css: background.css,
            filename,
            pngSha256: digest(await readFile(path.join(output, filename))),
          });
        }
      }
      await backgroundPage.evaluate(() => window.__proofDispose());
      await backgroundPage.close();
      const board = createCanvas(1050, 480),
        ctx = board.getContext('2d');
      ctx.fillStyle = '#f0f8fc';
      ctx.fillRect(0, 0, board.width, board.height);
      for (let column = 0; column < backgrounds.length; column++) {
        const background = backgrounds[column];
        ctx.fillStyle = '#123244';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`${background.name} · actual320/96`, column * 350 + 16, 26);
        ctx.drawImage(
          await loadImage(path.join(output, `C-320-${background.name}.png`)),
          column * 350 + 15,
          40,
        );
        ctx.drawImage(
          await loadImage(path.join(output, `C-96-${background.name}.png`)),
          column * 350 + 127,
          375,
        );
      }
      report.backgroundBoard = 'selected-controlled-backgrounds.png';
      report.backgroundScope =
        'Synthetic CSS light/dark/pattern backgrounds under the actual alpha canvas. No OS desktop pixels or framebuffer colour sampling; transmission lighting stays fixed in the Three scene.';
      await writeFile(path.join(output, report.backgroundBoard), board.toBuffer('image/png'));
    }
  }

  if (!stillsOnly) {
    // Keep the recording short: only the attention/settle interaction, rather
    // than the sequential material imports above, is filmed.
    const videoContext = await browser.newContext({
      viewport: { width: 760, height: 480 },
      deviceScaleFactor: 1,
      recordVideo: { dir: path.join(output, '.recording'), size: { width: 760, height: 480 } },
    });
    const motion = await setup(videoContext);
    const chosen = candidates[2];
    await motion.evaluate((options) => window.__proofCreate(options), {
      url: chosen.url,
      size: 320,
      motion: true,
      wide: true,
      reflectionProfile,
      toneMapping,
    });
    await expect
      .poll(() => motion.evaluate(() => window.__proofReady), { timeout: 15000 })
      .toBe(true);
    const region = await motion.locator('.studio-preview').boundingBox();
    assert.ok(region);
    const cx = region.x + region.width / 2,
      cy = region.y + region.height / 2;
    const capture = async (name, check) => {
      const diagnostics = await motion.evaluate(() => window.__proofDiagnostics());
      assert.equal(diagnostics.assetUrl, chosen.url);
      const filename = `attention-${name}.png`;
      await motion.screenshot({ path: path.join(output, filename) });
      const avatarFilename = `attention-${name}-avatar.png`;
      await motion.locator('#avatar').screenshot({ path: path.join(output, avatarFilename) });
      report.attention.push({ name, filename, avatarFilename, diagnostics });
      check(diagnostics.attention);
      return diagnostics;
    };
    await motion.evaluate(() =>
      window.__proofCaption(
        'C study • whole-body attention on the actual renderer • fixed reflections',
      ),
    );
    await motion.mouse.move(cx, cy);
    await motion.waitForTimeout(350);
    await capture('neutral', (a) =>
      assert.ok(Math.abs(a.yaw) < 0.001 && Math.abs(a.pitch) < 0.001),
    );
    await motion.evaluate(() =>
      window.__proofCaption('Pointer right/up • eyes lead the damped body • no pointer roll'),
    );
    await motion.mouse.move(region.x + region.width - 1, region.y + 1, { steps: 10 });
    await motion.waitForTimeout(750);
    await capture('right-up', (a) => {
      assert.ok(a.yaw > 0.16 && a.yaw <= (10 * Math.PI) / 180);
      assert.ok(a.pitch < -0.095 && a.pitch >= (-6 * Math.PI) / 180);
    });
    await motion.evaluate(() =>
      window.__proofCaption(
        'Reverse left/down • single mixer • shell and core keep the same jelly weights',
      ),
    );
    await motion.mouse.move(region.x + 1, region.y + region.height - 1, { steps: 10 });
    await motion.waitForTimeout(120);
    await capture('reverse-softness', (a) =>
      assert.ok(a.compression > 0.025 && a.compression <= 1),
    );
    await motion.waitForTimeout(630);
    await capture('left-down', (a) => {
      assert.ok(a.yaw < -0.16 && a.yaw >= (-10 * Math.PI) / 180);
      assert.ok(a.pitch > 0.095 && a.pitch <= (6 * Math.PI) / 180);
    });
    await motion.evaluate(() =>
      window.__proofCaption(
        'Click + blink + interrupted phases • attention and authored channels remain separate',
      ),
    );
    await motion.evaluate(() =>
      window.__proofUpdate({ reaction: 1, blink: 1, phase: 'listening' }),
    );
    await motion.waitForTimeout(70);
    await motion.evaluate(() => window.__proofUpdate({ phase: 'thinking' }));
    await motion.waitForTimeout(90);
    await motion.evaluate(() => window.__proofUpdate({ phase: 'speaking' }));
    await motion.waitForTimeout(350);
    await capture('combined', (a) =>
      assert.ok(Number.isFinite(a.yaw) && Number.isFinite(a.compression)),
    );
    await motion.evaluate(() =>
      window.__proofCaption(
        'Pointer leaves the stable panel region • gentle compression settles to neutral',
      ),
    );
    await motion.mouse.move(5, 5);
    await motion.waitForTimeout(1300);
    await capture('leave', (a) =>
      assert.ok(Math.abs(a.yaw) < 0.001 && Math.abs(a.pitch) < 0.001 && a.compression < 0.001),
    );
    await motion.mouse.move(region.x + region.width - 1, cy);
    await motion.waitForTimeout(500);
    await motion.evaluate(() => {
      window.__proofCaption(
        'Simulated window blur handler • returns neutral; voice resources are absent',
      );
      window.dispatchEvent(new Event('blur'));
    });
    await motion.waitForTimeout(1000);
    await capture('blur', (a) => assert.ok(Math.abs(a.yaw) < 0.001 && Math.abs(a.pitch) < 0.001));
    await motion.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.__proofUpdate({ motion: false });
      window.__proofCaption(
        'Paused pose • attention and additive compression reset • authored silhouette retained',
      );
    });
    const paused = await capture('paused', (a) => assert.equal(a.compression, 0));
    const pausedPixels = await motion.locator('#avatar').screenshot();
    await motion.waitForTimeout(450);
    assert.equal(digest(await motion.locator('#avatar').screenshot()), digest(pausedPixels));
    assert.equal(paused.attention.yaw, 0);
    assert.equal(paused.attention.pitch, 0);
    // A second actual-size pass makes the attention readable at the deployed
    // 96px avatar size instead of inferring it from downscaled hero pixels.
    await motion.evaluate((options) => window.__proofCreate(options), {
      url: chosen.url,
      size: 96,
      motion: true,
      wide: true,
      reflectionProfile,
      toneMapping,
    });
    await expect
      .poll(() => motion.evaluate(() => window.__proofReady), { timeout: 15000 })
      .toBe(true);
    await motion.evaluate(() =>
      window.__proofCaption('Actual96px • right/up, reverse, then neutral settle'),
    );
    const smallCaptures = [];
    for (const point of [
      { name: 'neutral', x: cx, y: cy, wait: 350 },
      { name: 'right-up', x: region.x + region.width - 1, y: region.y + 1, wait: 750 },
      { name: 'left-down', x: region.x + 1, y: region.y + region.height - 1, wait: 750 },
      { name: 'settle', x: 5, y: 5, wait: 1300 },
    ]) {
      await motion.mouse.move(point.x, point.y, { steps: 10 });
      await motion.waitForTimeout(point.wait);
      const filename = `attention96-${point.name}.png`;
      await motion.locator('#avatar').screenshot({ path: path.join(output, filename) });
      smallCaptures.push({
        name: point.name,
        filename,
        diagnostics: await motion.evaluate(() => window.__proofDiagnostics()),
      });
    }
    report.actual96Attention = smallCaptures;
    // A real expanded panel places the avatar above/left of its region centre.
    // Exercise that layout so a centred fixture cannot hide an aim-basis bug.
    await motion.evaluate((options) => window.__proofCreate(options), {
      url: chosen.url,
      size: 96,
      motion: true,
      wide: true,
      offset: true,
      reflectionProfile,
      toneMapping,
    });
    await expect
      .poll(() => motion.evaluate(() => window.__proofReady), { timeout: 15000 })
      .toBe(true);
    const ownerRect = await motion.locator('#avatar').boundingBox();
    const offsetRegion = await motion.locator('.studio-preview').boundingBox();
    assert.ok(ownerRect && offsetRegion);
    await motion.mouse.move(ownerRect.x + ownerRect.width / 2, ownerRect.y + ownerRect.height / 2);
    await motion.waitForTimeout(750);
    const centre = await motion.evaluate(() => window.__proofDiagnostics());
    assert.ok(Math.abs(centre.attention.yaw) < 0.001 && Math.abs(centre.attention.pitch) < 0.001);
    await motion
      .locator('.studio-preview')
      .screenshot({ path: path.join(output, 'offset-centre-neutral.png') });
    await motion.mouse.move(ownerRect.x + ownerRect.width - 1, ownerRect.y + 1, { steps: 8 });
    await motion.waitForTimeout(750);
    const rightUp = await motion.evaluate(() => window.__proofDiagnostics());
    assert.ok(rightUp.attention.yaw > 0.16 && rightUp.attention.pitch < -0.095);
    assert.deepEqual(await motion.locator('#avatar').boundingBox(), ownerRect);
    await motion
      .locator('.studio-preview')
      .screenshot({ path: path.join(output, 'offset-right-up.png') });
    report.offsetAttention = {
      scope:
        'Real pointer events on an offset96px avatar inside a560×420 tracking region. Avatar-centre is neutral; right/up is correctly signed; WebGL turn leaves the DOM hit box unchanged.',
      ownerRect,
      regionRect: offsetRegion,
      centre,
      rightUp,
    };
    const angles = createCanvas(1050, 465);
    const angleContext = angles.getContext('2d');
    angleContext.fillStyle = '#f0f8fc';
    angleContext.fillRect(0, 0, 1050, 465);
    for (let index = 0; index < 3; index++) {
      const name = ['right-up', 'left-down', 'leave'][index];
      angleContext.fillStyle = '#123244';
      angleContext.font = 'bold 18px sans-serif';
      angleContext.fillText(name, index * 350 + 20, 24);
      angleContext.drawImage(
        await loadImage(path.join(output, `attention-${name}-avatar.png`)),
        index * 350 + 15,
        35,
      );
      const smallName = name === 'leave' ? 'settle' : name;
      angleContext.drawImage(
        await loadImage(path.join(output, `attention96-${smallName}.png`)),
        index * 350 + 127,
        365,
      );
    }
    await writeFile(
      path.join(output, 'attention-angle-and-settle.png'),
      angles.toBuffer('image/png'),
    );
    report.attentionBoard = 'attention-angle-and-settle.png';
    await motion.evaluate(() => window.__proofDispose());
    const video = motion.video();
    await videoContext.close();
    const rawVideo = await video.path();
    const videoFilename = 'attention-and-settle.webm';
    await rename(rawVideo, path.join(output, videoFilename));
    report.video = {
      filename: videoFilename,
      scope:
        'Silent browser fixture recording of C candidate pointer/settle, overlapping original clips and pause. Window blur is simulated explicitly. Not a provider or native-window recording.',
    };

    await assembleBoard(report);
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.apiCalls, []);
  report.pass = true;
  console.log(
    stillsOnly
      ? 'Bounded selected320/96 stills complete; inspect before motion acceptance.'
      : 'Matched material/attention browser proof passed. Inspect board and recording before selection.',
  );
} catch (error) {
  report.failure = error.stack || String(error);
  throw error;
} finally {
  clearTimeout(deadline);
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
