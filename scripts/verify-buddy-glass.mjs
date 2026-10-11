// Matched actual-DesktopBuddy optical proof. Local fixture props; no microphone/provider.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const argument = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const tag = argument('proof-tag', 'glass-panel-study');
const stage = argument('stage', 'before');
assert.match(tag, /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/);
assert.match(stage, /^(before|after|lens|refraction)$/);
const output = path.join('artifacts', tag, stage);
await mkdir(output, { recursive: true });
const base = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';
const viteModule = await (await fetch(`${base}/src/DesktopBuddy.tsx`)).text();
const revision = viteModule.match(/react\.js\?v=([a-zA-Z0-9]+)/)?.[1];
assert.ok(revision, 'Use the same Vite-optimized React module instance as DesktopBuddy.');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const luminance = (channels) =>
  channels
    .map((channel) => channel / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
const colourContrast = (foreground, background) => {
  const colour = (value) =>
    value
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
  const values = [luminance(colour(foreground)), luminance(colour(background))].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
};
async function actualIconContrast(button, foreground) {
  const region = await button.evaluate((element) => {
    const icon = element.querySelector('svg');
    const outer = element.getBoundingClientRect(),
      rect = icon.getBoundingClientRect();
    const style = icon.getAttribute('style');
    icon.style.visibility = 'hidden';
    return {
      x: rect.x - outer.x,
      y: rect.y - outer.y,
      width: rect.width,
      height: rect.height,
      style,
    };
  });
  let pixels;
  try {
    pixels = await button.screenshot();
  } finally {
    await button
      .locator('svg')
      .evaluate(
        (icon, style) =>
          style === null ? icon.removeAttribute('style') : icon.setAttribute('style', style),
        region.style,
      );
  }
  const image = await loadImage(pixels),
    canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const values = ctx.getImageData(
    Math.ceil(region.x),
    Math.ceil(region.y),
    Math.floor(region.width),
    Math.floor(region.height),
  ).data;
  let minimum = Infinity;
  for (let i = 0; i < values.length; i += 4)
    minimum = Math.min(
      minimum,
      colourContrast(foreground, `rgb(${values[i]},${values[i + 1]},${values[i + 2]})`),
    );
  return minimum;
}
const source = Object.fromEntries(
  await Promise.all(
    ['src/DesktopBuddy.tsx', 'src/buddy.css'].map(async (name) => [
      name,
      digest(await readFile(name)),
    ]),
  ),
);

// Vite serves the actual component and shared styles. Only fixture state/background is local.
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Actual panel glass proof · local fixture</title><style>
body{margin:0!important;background:#edf1f6!important}.proof-scene{width:min(440px,100vw);height:704px;padding:16px;display:grid;place-items:start center;overflow:hidden}
.proof-scene .buddy-shell{width:min(408px,100%);height:672px;padding:8px}
.proof-scene[data-background=light]{background:radial-gradient(ellipse at 20% 20%,#fff,transparent 60%),#dce9f7}
.proof-scene[data-background=dark]{background:radial-gradient(ellipse at 75% 80%,#243147,transparent 60%),#101828}
.proof-scene[data-background=busy]{background:repeating-linear-gradient(135deg,#d4e5f3 0 42px,#334c67 42px 84px,#85aac0 84px 126px,#f0d0c9 126px 168px)}
@media(max-width:350px){.proof-scene{padding:8px 0;height:688px}}
</style></head><body><div id="fixture"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js?v=${revision}';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js?v=${revision}';
const {useRef,useState}=React;const {createRoot}=ReactDOM;
import '/src/styles.css';
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {default:DesktopBuddy}=await import('/src/DesktopBuddy.tsx');
const sample=[{id:'glass-user',role:'user',text:'Can we take this one step at a time?'},{id:'glass-assistant',role:'assistant',text:'Of course. You can pause, ask me to repeat a detail, or change direction whenever you need.'}];
function Fixture(){
 const [config,setConfig]=useState({background:'light',populated:true,large:false,phase:'idle',expanded:true,disabled:false});
 const [request,setRequest]=useState('');const input=useRef(null),feed=useRef(null),memory=useRef({scrollTop:0,followLatest:true});
 window.__glassFixture={update:(next)=>setConfig(current=>({...current,...next})),setRequest};
 const talking=config.sessionActive??(config.phase==='listening'||config.phase==='speaking');const noop=()=>{};
 return React.createElement('div',{className:'proof-scene','data-background':config.background},
 React.createElement('div',{className:'buddy-shell'+(config.large?' large-text':'')},React.createElement(DesktopBuddy,{
 expanded:config.expanded,modalOpen:false,active:config.phase!=='idle',conversationActive:talking,busy:config.phase==='processing',enabled:!config.disabled,
 voicePhase:config.phase,voiceReady:true,speech:true,speechReady:true,shortcut:false,state:{folder:null,code:null,browser:null,screen:null},resultView:'home',
 request,messages:config.error?[{id:'glass-error',role:'error',text:'I could not complete that request. Your draft is still here.'}]:config.populated?sample:[],inputRef:input,transcriptRef:feed,readingMemory:memory,
 expand:()=>setConfig(current=>({...current,expanded:!current.expanded})),expansionFailed:noop,hide:noop,
 talk:()=>setConfig(current=>({...current,phase:talking?'idle':'listening'})),stop:()=>setConfig(current=>({...current,phase:'idle'})),
 settings:noop,workspace:noop,folder:noop,screen:noop,toggleSpeech:noop,setRequest,suggest:setRequest,send:noop,run:noop,editor:noop,openPresentation:noop,openSpreadsheet:noop,
 visual:{motion:false,assetUrl:'/buddy/sprout-v005.glb'}
 })));
}
createRoot(document.getElementById('fixture')).render(React.createElement(Fixture));
</script></body></html>`;

const browser = await chromium.launch({ args: ['--disable-gpu'] });
const requests = [];
const results = [];
const browserErrors = [];
let temporaryStyle;
try {
  const context = await browser.newContext({
    viewport: { width: 440, height: 704 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    window.__glassMicCalls = 0;
    if (navigator.mediaDevices)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.__glassMicCalls++;
          throw new Error('The glass fixture must not request a microphone.');
        },
      });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === 'webgl' || kind === 'webgl2' ? null : getContext.call(this, kind, ...args);
    };
  });
  await context.route('**/__glass-proof', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.route('**/api/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(`${base}/__glass-proof`, { waitUntil: 'networkidle' });
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.insight-signal img')).toBeVisible();
  if (stage === 'refraction') {
    // Source-inspired feImage + RGB edge refraction, with an original rounded-rect
    // normal map. This is a bounded test-only candidate, not the old noise lens.
    await page.evaluate(() => {
      const glass = document.querySelector('.buddy-panel-glass');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      svg.innerHTML =
        '<defs><filter id="proof-prism-edge" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feImage result="normal" width="100%" height="100%" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="normal" scale="8.6" xChannelSelector="R" yChannelSelector="B" result="r"/><feColorMatrix in="r" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"/><feDisplacementMap in="SourceGraphic" in2="normal" scale="9" xChannelSelector="R" yChannelSelector="B" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"/><feDisplacementMap in="SourceGraphic" in2="normal" scale="9.4" xChannelSelector="R" yChannelSelector="B" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"/><feBlend in="red" in2="green" mode="screen" result="rg"/><feBlend in="rg" in2="blue" mode="screen"/></filter></defs>';
      document.body.append(svg);
      const map = () => {
        const width = Math.round(glass.clientWidth),
          height = Math.round(glass.clientHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(width, height);
        const radius = 31;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const cx = Math.max(radius, Math.min(width - radius, x));
            const cy = Math.max(radius, Math.min(height - radius, y));
            let nx = 0,
              ny = 0,
              distance;
            if (cx !== x && cy !== y) {
              const length = Math.hypot(x - cx, y - cy);
              nx = (x - cx) / length;
              ny = (y - cy) / length;
              distance = radius - length;
            } else {
              const distances = [x, width - 1 - x, y, height - 1 - y];
              distance = Math.min(...distances);
              const side = distances.indexOf(distance);
              nx = side === 0 ? -1 : side === 1 ? 1 : 0;
              ny = side === 2 ? -1 : side === 3 ? 1 : 0;
            }
            const strength = Math.max(0, 1 - Math.max(0, distance) / 12);
            const i = (y * width + x) * 4;
            image.data[i] = 128 + Math.round(nx * 100 * strength);
            image.data[i + 1] = 128;
            image.data[i + 2] = 128 + Math.round(ny * 100 * strength);
            image.data[i + 3] = 255;
          }
        ctx.putImageData(image, 0, 0);
        svg.querySelector('feImage').setAttribute('href', canvas.toDataURL());
      };
      const observer = new ResizeObserver(map);
      observer.observe(glass);
      map();
    });
    temporaryStyle = await page.addStyleTag({
      content:
        '.buddy-panel-glass{backdrop-filter:blur(14px) saturate(112%) url(#proof-prism-edge)}',
    });
  }
  if (stage === 'lens') {
    // Experimental edge-only lens. Original small SVG graph; no copied source or live-DOM texture.
    await page.evaluate(() => {
      const definitions = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      definitions.setAttribute('aria-hidden', 'true');
      definitions.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      definitions.innerHTML =
        '<defs><filter id="proof-glass-lens" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".018 .012" numOctaves="1" seed="3" result="map"/><feGaussianBlur in="map" stdDeviation="3" result="smoothMap"/><feDisplacementMap in="SourceGraphic" in2="smoothMap" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
      document.body.append(definitions);
      const lens = document.createElement('i');
      lens.className = 'proof-glass-lens';
      lens.setAttribute('aria-hidden', 'true');
      document.querySelector('.buddy-panel-glass').append(lens);
    });
    temporaryStyle = await page.addStyleTag({
      content:
        '.proof-glass-lens{position:absolute;inset:7px;border-radius:23px;padding:12px;backdrop-filter:url(#proof-glass-lens);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;pointer-events:none}',
    });
  }
  for (const viewport of [440, 320]) {
    await page.setViewportSize({ width: viewport, height: 704 });
    for (const populated of [true, false]) {
      for (const background of ['light', 'dark', 'busy']) {
        await page.evaluate((next) => window.__glassFixture.update(next), {
          populated,
          background,
          large: false,
          phase: 'idle',
        });
        await expect(page.locator('.proof-scene')).toHaveAttribute('data-background', background);
        await expect(page.locator('.buddy-message')).toHaveCount(populated ? 2 : 0);
        const name = `panel-${viewport === 440 ? '392' : '320css'}-${populated ? 'populated' : 'empty'}-${background}`;
        await page.locator('.proof-scene').screenshot({ path: path.join(output, `${name}.png`) });
        const metrics = await page.locator('.buddy').evaluate((root) => {
          const box = (element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          const glass = root.querySelector('.buddy-panel-glass');
          const css = getComputedStyle(glass),
            inner = getComputedStyle(glass, '::after');
          const voice = root.querySelector('.buddy-play'),
            icon = voice.querySelector('svg');
          const b = box(voice),
            i = box(icon),
            v = getComputedStyle(voice);
          return {
            panel: box(root),
            rootWidth: document.documentElement.scrollWidth,
            innerWidth,
            opticalLayers: {
              frameBackground: css.backgroundImage,
              innerBackground: inner.backgroundImage,
              backdropFilter: css.backdropFilter,
              innerBackdropFilter: inner.backdropFilter,
              opacity: css.opacity,
            },
            voice: {
              button: b,
              svg: i,
              centreError: {
                x: i.x + i.width / 2 - (b.x + b.width / 2),
                y: i.y + i.height / 2 - (b.y + b.height / 2),
              },
              padding: [v.paddingTop, v.paddingRight, v.paddingBottom, v.paddingLeft],
              color: v.color,
              background: v.backgroundColor,
              disabled: voice.disabled,
            },
            bodyFont: getComputedStyle(
              root.querySelector('.buddy-message p') ?? root.querySelector('textarea'),
            ).fontSize,
          };
        });
        assert.ok(metrics.rootWidth <= viewport);
        const buffer = await page.locator('.buddy').screenshot();
        const image = await loadImage(buffer),
          canvas = createCanvas(image.width, image.height),
          ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        // No text in the empty reading-well centre; these points establish visible background influence.
        const samples = [
          [0.5, 0.45],
          [0.3, 0.56],
          [0.7, 0.62],
        ].map(([x, y]) => {
          const px = Math.round(image.width * x),
            py = Math.round(image.height * y);
          const values = ctx.getImageData(px, py, 1, 1).data;
          return { x: px, y: py, rgba: Array.from(values) };
        });
        results.push({ name, viewport, populated, background, metrics, samples });
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 704 });
  await page.evaluate(() =>
    window.__glassFixture.update({
      background: 'busy',
      populated: true,
      large: true,
      phase: 'speaking',
    }),
  );
  await expect(page.getByRole('button', { name: 'Pause voice conversation' })).toBeEnabled();
  await page
    .locator('.proof-scene')
    .screenshot({ path: path.join(output, 'panel-320css-large-speaking.png') });
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page
    .locator('.proof-scene')
    .screenshot({ path: path.join(output, 'panel-320css-large-tools-stop.png') });
  const popup = await page.getByRole('region', { name: 'Tools', exact: true }).boundingBox();
  const stop = await page.getByRole('button', { name: 'Stop task and audio' }).boundingBox();
  assert.ok(popup.y > stop.y + stop.height);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  const voiceStates = [];
  for (const state of [
    { phase: 'idle', sessionActive: null },
    { phase: 'listening', sessionActive: null },
    { phase: 'speaking', sessionActive: null },
    { phase: 'processing', sessionActive: null },
    { phase: 'processing', sessionActive: true },
  ]) {
    await page.evaluate((state) => window.__glassFixture.update(state), state);
    const button = page.locator('.buddy-play');
    const metrics = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect(),
        svg = element.querySelector('svg').getBoundingClientRect(),
        style = getComputedStyle(element);
      return {
        phase: element.dataset.phase,
        name: element.getAttribute('aria-label'),
        pressed: element.getAttribute('aria-pressed'),
        disabled: element.disabled,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        colour: style.color,
        background: style.backgroundColor,
        centreError: [
          svg.x + svg.width / 2 - rect.x - rect.width / 2,
          svg.y + svg.height / 2 - rect.y - rect.height / 2,
        ],
      };
    });
    metrics.iconContrast = await actualIconContrast(button, metrics.colour);
    metrics.fixtureState = state;
    voiceStates.push(metrics);
  }
  if (stage !== 'before')
    for (const state of voiceStates) {
      assert.deepEqual(state.centreError, [0, 0]);
      assert.deepEqual(state.padding, ['0px', '0px', '0px', '0px']);
      if (!state.disabled) assert.ok(state.iconContrast >= 3);
    }
  assert.equal(voiceStates.at(-1).disabled, false, 'Active Pause remains available while busy.');
  await page.setViewportSize({ width: 440, height: 704 });
  await page.evaluate(() => {
    window.__glassFixture.update({
      background: 'busy',
      phase: 'idle',
      sessionActive: null,
      large: false,
      error: false,
      populated: true,
    });
    window.__glassFixture.setRequest('A readable glass control.');
  });
  const primary = page.locator('.buddy-play');
  const controlStates = [];
  for (const interaction of ['normal', 'hover', 'focus', 'pressed', 'disabled']) {
    await page.mouse.move(435, 700);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    if (interaction === 'hover') await primary.hover();
    if (interaction === 'focus') await primary.focus();
    if (interaction === 'pressed') {
      await primary.hover();
      await page.mouse.down();
    }
    if (interaction === 'disabled')
      await page.evaluate(() => window.__glassFixture.update({ disabled: true }));
    await page
      .locator('.proof-scene')
      .screenshot({ path: path.join(output, `buttons-${interaction}.png`) });
    controlStates.push({
      interaction,
      contrast:
        interaction === 'disabled' ? null : await actualIconContrast(primary, 'rgb(255,255,255)'),
    });
    if (interaction === 'pressed') await page.mouse.up();
  }
  await page.evaluate(() => window.__glassFixture.update({ disabled: false }));
  if (stage !== 'before')
    for (const sample of controlStates)
      if (sample.contrast !== null) assert.ok(sample.contrast >= 3);
  assert.equal(await page.evaluate(() => window.__glassMicCalls), 0);
  await page.evaluate(() =>
    window.__glassFixture.update({
      background: 'dark',
      phase: 'idle',
      sessionActive: null,
      error: true,
    }),
  );
  await expect(page.locator('.buddy-message.error')).toBeVisible();
  const errorText = page.locator('.buddy-message.error p');
  const errorStyle = await errorText.evaluate((element) => ({
    colour: getComputedStyle(element).color,
    inline: element.getAttribute('style'),
  }));
  await errorText.evaluate((element) =>
    element.style.setProperty('color', 'transparent', 'important'),
  );
  let errorPixels;
  try {
    errorPixels = await errorText.screenshot();
  } finally {
    await errorText.evaluate(
      (element, previous) =>
        previous === null
          ? element.removeAttribute('style')
          : element.setAttribute('style', previous),
      errorStyle.inline,
    );
  }
  const errorImage = await loadImage(errorPixels),
    errorCanvas = createCanvas(errorImage.width, errorImage.height),
    errorContext = errorCanvas.getContext('2d');
  errorContext.drawImage(errorImage, 0, 0);
  const errorData = errorContext.getImageData(0, 0, errorImage.width, errorImage.height).data;
  let errorContrast = Infinity;
  for (let index = 0; index < errorData.length; index += 4)
    errorContrast = Math.min(
      errorContrast,
      colourContrast(
        errorStyle.colour,
        `rgb(${errorData[index]},${errorData[index + 1]},${errorData[index + 2]})`,
      ),
    );
  if (stage !== 'before')
    assert.ok(errorContrast >= 7, 'Recorded error prose retains enhanced reading contrast.');
  await page
    .locator('.proof-scene')
    .screenshot({ path: path.join(output, 'panel-320css-large-error-dark.png') });
  const materialPreferences = [];
  if (stage !== 'before') {
    const cdp = await context.newCDPSession(page);
    for (const feature of [
      { name: 'prefers-reduced-transparency', value: 'reduce' },
      { name: 'prefers-contrast', value: 'more' },
    ]) {
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [feature, { name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      assert.equal(
        await page.evaluate(
          ({ name, value }) => matchMedia(`(${name}: ${value})`).matches,
          feature,
        ),
        true,
      );
      await page.evaluate(() =>
        window.__glassFixture.update({ phase: 'speaking', sessionActive: true, error: false }),
      );
      await expect(primary).toHaveAttribute('data-phase', 'speaking');
      await primary.hover();
      await page.mouse.down();
      const controls = await page
        .locator('.buddy-icon, .buddy-play, .buddy-send, .buddy-disclosure-trigger')
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getClientRects().length)
            .map((element) => {
              const style = getComputedStyle(element);
              return {
                name: element.getAttribute('aria-label') || element.textContent,
                background: style.backgroundColor,
                image: style.backgroundImage,
                filter: style.backdropFilter,
                rim: getComputedStyle(element, '::before').display,
              };
            }),
        );
      await page.mouse.up();
      assert.ok(controls.length >= 6);
      for (const control of controls) {
        assert.match(
          control.background,
          /^rgb\(/,
          'Preference keeps every control opaque, including held Pause and open Collapse.',
        );
        assert.equal(control.image, 'none');
        assert.equal(control.filter, 'none');
        assert.equal(control.rim, 'none');
      }
      await page.evaluate(() => window.__glassFixture.update({ expanded: false }));
      await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
      const dock = await page.locator('.buddy-dock-controls').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          image: style.backgroundImage,
          filter: style.backdropFilter,
        };
      });
      assert.match(dock.background, /^rgb\(/);
      assert.equal(dock.image, 'none');
      assert.equal(dock.filter, 'none');
      materialPreferences.push({ feature, controls, collapsedDock: dock });
      await page.evaluate(() => window.__glassFixture.update({ expanded: true }));
      await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await cdp.detach();
  }
  assert.deepEqual(requests, []);
  assert.deepEqual(browserErrors, []);
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        stage,
        source,
        results,
        voiceStates,
        controlStates,
        materialPreferences,
        errorContrast,
        popup,
        stop,
        requests,
        browserErrors,
        limits: [
          'Developer-owned fixture renders the actual DesktopBuddy. All data/voice state is local simulation. No backend or provider request.',
          'CSS backdrop proof over owned webpage pixels, not blur/refraction of the OS desktop.',
          'No-WebGL authored PNG keeps avatar pixels fixed for matched panel comparisons.',
          '320CSSpx and Large tested here; real Electron zoom/native compositor requires separate evidence.',
          'Pixel points establish background influence in recorded empty states; they are not opacity/contrast estimates.',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify(
      { output, stage, captures: results.length + 3 + controlStates.length, voiceStates, requests },
      null,
      2,
    ),
  );
  if (temporaryStyle) await temporaryStyle.evaluate((element) => element.remove());
} finally {
  if (browserErrors.length) console.error(browserErrors);
  await browser.close();
}
