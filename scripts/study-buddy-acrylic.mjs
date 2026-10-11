// Isolated Windows material study. The capture is cropped to an owned opaque backdrop.
// This changes no production window setting and never uses capture as a runtime texture.
import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import path from 'node:path';

const output = path.resolve('artifacts/glass-sprout-v004/acrylic-study');
const local = path.resolve('.local/glass-sprout-v004');
await mkdir(output, { recursive: true });
await mkdir(local, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), 'sprout-acrylic-'));
const entry = path.join(local, `acrylic-${process.pid}.cjs`);
await writeFile(
  entry,
  `const {app,BrowserWindow,screen}=require('electron');
app.setPath('userData',${JSON.stringify(userData)});
app.whenReady().then(async()=>{
 const area=screen.getPrimaryDisplay().workArea;
 const x=Math.round(area.x+(area.width-408)/2),y=area.y+Math.max(24,Math.round((area.height-672)/2));
 global.studyBackdrop=new BrowserWindow({x:x-24,y:y-24,width:456,height:720,frame:false,resizable:false,show:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:{sandbox:true}});
 await global.studyBackdrop.loadURL('data:text/html,'+encodeURIComponent('<style>html,body{margin:0;width:100%;height:100%;background:repeating-linear-gradient(135deg,%23d4e5f3 0 42px,%23334c67 42px 84px,%2385aac0 84px 126px,%23f0d0c9 126px 168px)}</style>'.replaceAll('%23','#')));
 global.studyWindow=new BrowserWindow({x,y,width:408,height:672,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,show:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await global.studyWindow.loadURL('about:blank');
});`,
);
let desktop;
try {
  desktop = await electron.launch({ args: [entry], timeout: 30000 });
  await expect.poll(() => desktop.evaluate(() => Boolean(globalThis.studyWindow))).toBe(true);
  // firstWindow can be the opaque fixture; select the explicitly named study window.
  await expect
    .poll(() => desktop.windows().some((window) => window.url() === 'about:blank'))
    .toBe(true);
  const target = desktop.windows().find((window) => window.url() === 'about:blank');
  if (!target) throw new Error('Material study window unavailable');
  await target.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await target.goto('http://127.0.0.1:5173/?studio=panel');
  await target.addStyleTag({
    content: `html,body,#root,.buddy-panel-preview,.panel-preview-scene{background:transparent!important;padding:0!important;margin:0!important;min-height:0!important;overflow:hidden}.panel-preview-heading,.panel-preview-notice{display:none}.panel-preview-scene{height:100vh;max-width:none;border-radius:0}.panel-preview-scene .buddy-shell{height:100vh}`,
  });
  await expect(target.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  const captures = [];
  for (const material of ['none', 'acrylic']) {
    const result = await desktop.evaluate(async ({ screen, desktopCapturer }, material) => {
      const window = globalThis.studyWindow,
        backdrop = globalThis.studyBackdrop;
      let error = null;
      try {
        window.setBackgroundMaterial(material);
      } catch (failure) {
        error = String(failure);
      }
      backdrop.showInactive();
      backdrop.moveTop();
      window.showInactive();
      window.moveTop();
      window.focus();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const bounds = window.getBounds(),
        fixture = backdrop.getBounds();
      if (
        fixture.x >= bounds.x ||
        fixture.y >= bounds.y ||
        fixture.x + fixture.width <= bounds.x + bounds.width ||
        fixture.y + fixture.height <= bounds.y + bounds.height
      )
        throw new Error('Owned backdrop does not cover capture');
      const display = screen.getDisplayMatching(bounds);
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: display.bounds.width, height: display.bounds.height },
      });
      const source =
        sources.find((value) => value.display_id === String(display.id)) ??
        (sources.length === 1 ? sources[0] : null);
      if (!source || source.thumbnail.isEmpty())
        return {
          material,
          error,
          bounds,
          fixture,
          image: null,
          unavailable: 'Compositor capture unavailable',
          sources: sources.map((item) => ({
            id: item.display_id,
            size: item.thumbnail.getSize(),
            empty: item.thumbnail.isEmpty(),
          })),
        };
      const size = source.thumbnail.getSize();
      const rect = {
        x: Math.round(((bounds.x - display.bounds.x) * size.width) / display.bounds.width),
        y: Math.round(((bounds.y - display.bounds.y) * size.height) / display.bounds.height),
        width: Math.round((bounds.width * size.width) / display.bounds.width),
        height: Math.round((bounds.height * size.height) / display.bounds.height),
      };
      return {
        material,
        error,
        bounds,
        fixture,
        image: source.thumbnail.crop(rect).toPNG().toString('base64'),
      };
    }, material);
    if (result.image)
      await writeFile(path.join(output, `${material}.png`), Buffer.from(result.image, 'base64'));
    await target.screenshot({
      path: path.join(output, `${material}-webcontents.png`),
      omitBackground: true,
    });
    if (process.argv.includes('--interactive-capture')) {
      await target.evaluate((name) => {
        document.title = `Sprout material study: ${name}`;
      }, material);
      console.log(`Capture ready: ${material}. Send a newline to continue.`);
      await new Promise((resolve) => {
        const next = () => {
          clearTimeout(timer);
          process.stdin.pause();
          resolve();
        };
        const timer = setTimeout(() => {
          process.stdin.removeListener('data', next);
          process.stdin.pause();
          resolve();
        }, 60000);
        process.stdin.resume();
        process.stdin.once('data', next);
      });
    }
    delete result.image;
    captures.push(result);
  }
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        windowsRelease: release(),
        captures,
        scope:
          'Actual Windows compositor; isolated transparent window, production panel with static Sprout, owned opaque background. Inspect outside-rim pixels before considering integration.',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ output, captures }));
} finally {
  await desktop?.close();
  await unlink(entry).catch(() => {});
}
