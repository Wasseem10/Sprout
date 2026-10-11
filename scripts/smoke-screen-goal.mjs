// Real Hugging Face vision and Win32 clicks, confined to our isolated local fixture.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

if (process.platform !== 'win32') throw new Error('This smoke requires Windows.');
const { config } = await import('../dist-server/server/config.js');
const { ComputerController } = await import('../dist-server/server/computer/controller.js');
const cfg = config();
if (!cfg.hfToken && !cfg.cloudUrl)
  throw new Error('Connect Hugging Face before running the screen-goal smoke.');
const source = await readFile(new URL('../src/screenNavigation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { runScreenNavigation } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
await mkdir('.local', { recursive: true });
const data = await mkdtemp(path.join(tmpdir(), 'insight-screen-goal-'));
const entry = path.resolve('.local/screen-goal-smoke-main.cjs');
await writeFile(
  entry,
  `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(data)});\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
);
const desktop = await electron.launch({ args: [entry, '--dev'], timeout: 30000 });
const computer = new ComputerController(cfg);
try {
  await computer.init();
  const buddy = await desktop.firstWindow();
  await expect(buddy.getByRole('main', { name: 'InsightOS desktop buddy' })).toBeVisible();
  await desktop.evaluate(async ({ BrowserWindow, screen }) => {
    const bounds = screen.getPrimaryDisplay().bounds;
    const fixture = new BrowserWindow({
      width: 560,
      height: 360,
      x: Math.round(bounds.width * 0.25),
      y: Math.round(bounds.height * 0.22),
      frame: false,
      alwaysOnTop: true,
      title: 'Screen goal fixture',
    });
    await fixture.loadURL(
      'data:text/html,' +
        encodeURIComponent(`<html><body style="background:#dce9ff;margin:28px;font:26px sans-serif"><main id="content"><h1>Navigation rehearsal</h1><button onclick="openReport()" style="font-size:25px;padding:18px">Demo report</button></main><script>
      window.__stage=0;
      function openReport(){window.__stage=1;document.getElementById('content').innerHTML='<h1>Demo report is open</h1><button style="font-size:25px;padding:18px" onclick="openSources()">Demo sources</button>'}
      function openSources(){window.__stage=2;document.getElementById('content').innerHTML='<h1>Demo sources are visible</h1><p>Navigation complete.</p>'}
    </script></body></html>`),
    );
    fixture.show();
    fixture.focus();
  });
  let clicks = 0,
    captures = 0;
  const started = Date.now(),
    abort = new AbortController();
  const result = await runScreenNavigation(
    'Click Demo report, then click Demo sources. Stop when Demo sources are visible.',
    {
      capture: async () => {
        captures++;
        return buddy.evaluate(() => window.insightos.captureCurrentScreen());
      },
      observe: (capture) => computer.selectScreen(capture.name, capture.image),
      decide: (goal, history, signal) =>
        computer.action({ tool: 'nextScreenStep', goal, history }, signal),
      click: async (capture, pointer) => {
        clicks++;
        return buddy.evaluate(
          ({ capture, p }) =>
            window.insightos.clickCapturedTarget(
              capture.captureId,
              p.x,
              p.y,
              p.target,
              p.observedText,
              p.context,
              p.authorization,
            ),
          { capture, p: pointer },
        );
      },
      scroll: async () => {
        throw new Error('This fixture goal does not require scrolling.');
      },
      phase: (phase) => console.log(phase),
      settle: () => new Promise((resolve) => setTimeout(resolve, 600)),
    },
    abort.signal,
  );
  const stage = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === 'Screen goal fixture')
      ?.webContents.executeJavaScript('window.__stage'),
  );
  assert.equal(stage, 2);
  assert.equal(clicks, 2);
  assert.equal(captures, 3);
  assert.equal(result.screenStep?.decision, 'done');
  const cancelTarget = await desktop.evaluate(async ({ BrowserWindow, screen }) => {
    const fixture = BrowserWindow.getAllWindows().find(
      (w) => w.getTitle() === 'Screen goal fixture',
    );
    await fixture.webContents.executeJavaScript('openReport()');
    const rect = await fixture.webContents.executeJavaScript(
      'JSON.stringify(document.querySelector("button").getBoundingClientRect())',
    );
    const button = JSON.parse(rect),
      bounds = fixture.getBounds(),
      display = screen.getPrimaryDisplay().bounds;
    return {
      x: (bounds.x + button.x + button.width / 2 - display.x) / display.width,
      y: (bounds.y + button.y + button.height / 2 - display.y) / display.height,
    };
  });
  const cancelCapture = await buddy.evaluate(() => window.insightos.captureCurrentScreen());
  await computer.selectScreen(cancelCapture.name, cancelCapture.image);
  const originalFetch = globalThis.fetch;
  let pendingPointer;
  try {
    // Only this cancellation setup uses a deterministic locator; the full goal above used live HF.
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  found: true,
                  x: cancelTarget.x * 1000,
                  y: cancelTarget.y * 1000,
                  observedText: 'Demo sources',
                  context: 'desktop',
                  actionType: 'navigation',
                  confidence: 0.99,
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    pendingPointer = (
      await computer.action({ tool: 'locateScreenTarget', target: 'Demo sources' }, abort.signal)
    ).pointer;
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(pendingPointer);
  const cancelledClick = await buddy.evaluate(
    async ({ capture, p }) => {
      const pending = window.insightos
        .clickCapturedTarget(
          capture.captureId,
          p.x,
          p.y,
          p.target,
          p.observedText,
          p.context,
          p.authorization,
        )
        .then(
          () => false,
          (error) => /stopped/.test(error.message),
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await window.insightos.cancelPointerActions();
      return pending;
    },
    { capture: cancelCapture, p: pendingPointer },
  );
  assert.equal(
    cancelledClick,
    true,
    'Stop must prevent a pending click from reaching the fixture.',
  );
  const cancellationStage = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === 'Screen goal fixture')
      ?.webContents.executeJavaScript('window.__stage'),
  );
  assert.equal(cancellationStage, 1);
  const cancelledCapture = await buddy.evaluate(async () => {
    const capture = window.insightos.captureCurrentScreen();
    await window.insightos.cancelPointerActions();
    return capture.then(
      () => false,
      (error) => /stopped/.test(error.message),
    );
  });
  assert.equal(cancelledCapture, true, 'Stop must invalidate an in-flight screen capture.');
  const receipt = {
    completedInMs: Date.now() - started,
    nativeClicks: clicks,
    freshCaptures: captures,
    finalFixtureStage: stage,
    cancelledClick,
    cancellationStage,
    cancelledCapture,
    vision: 'configured Hugging Face',
    userApplicationTouched: false,
  };
  await writeFile('.local/screen-goal-receipt.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally {
  await computer.close();
  await desktop.close();
  await unlink(entry).catch(() => {});
}
