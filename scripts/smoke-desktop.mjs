import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Launch the actual production Electron app. Only the OS dialog selection is stubbed.
const dataDir = await mkdtemp(path.join(tmpdir(), 'insightos-desktop-'));
const desktop = await electron.launch({
  args: [path.resolve('.'), '--workspace'],
  env: {
    ...process.env,
    INSIGHTOS_APP_URL: '',
    APP_MODE: 'sample',
    HOST: '127.0.0.1',
    PORT: '4311',
    SESSION_PASSPHRASE: '',
    HF_TOKEN: '',
    DATABRICKS_TOKEN: '',
    ELEVENLABS_API_KEY: '',
    DATABASE_URL: '',
    LOCAL_DATA_DIR: dataDir,
  },
  timeout: 30000,
});
try {
  const page = await desktop.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('link', { name: 'Data workspace', exact: true }).click();
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setZoomFactor(1);
    win.show();
    win.focus();
  });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThan(1400);
  await expect(page.getByRole('button', { name: 'Open CSV', exact: true })).toBeEnabled();
  const prefs = await desktop.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      webSecurity: p.webSecurity,
    };
  });
  expect(prefs).toEqual({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  });
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.insightos?.openCsv)).toBe('function');
  await desktop.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, path.resolve('data/operations-synthetic.csv'));
  await page.getByRole('button', { name: 'Open CSV', exact: true }).click();
  await expect(page.getByText('YOUR DATA IS READY')).toBeVisible();
  const input = page.getByLabel('Ask InsightOS about your workspace');
  for (const request of [
    'Compare revenue this quarter with last quarter',
    'Only include locations that were operating in both quarters',
    'Show that as a chart',
    'Only show the top three regions',
  ]) {
    const count = await page.locator('.message').count();
    await input.fill(request);
    await input.press('Enter');
    await expect(page.locator('.message')).toHaveCount(count + 2);
  }
  await expect(page.getByText('$141,000', { exact: true })).toBeVisible();
  await expect(page.locator('.result-table tbody tr')).toHaveCount(3);
  await mkdir('artifacts', { recursive: true });
  const normalCapture = await desktop.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  await writeFile('artifacts/desktop.png', Buffer.from(normalCapture, 'base64'));
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2),
  );
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // Electron's native capture avoids Playwright clipping at a non-default zoom factor.
  const zoomCapture = await desktop.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  await writeFile('artifacts/desktop-200-percent.png', Buffer.from(zoomCapture, 'base64'));
  const report = {
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    productionLaunch: 'passed',
    securityPreferences: prefs,
    nativeIpcImport: 'passed with dialog selection stubbed',
    actualOperatingSystemPicker: 'manual check pending',
    commonRevenue: 141000,
    chartRegions: 3,
    zoom200PercentReflow: 'passed, input reachable and no horizontal document overflow',
  };
  await writeFile('artifacts/desktop-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await desktop
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1))
    .catch(() => {});
  await desktop.close();
}
