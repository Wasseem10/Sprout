import 'dotenv/config';
import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const dataDir = await mkdtemp(path.join(tmpdir(), 'insightos-companion-'));
const folder = path.join(dataDir, 'My programs');
await mkdir(folder);
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
    ELEVENLABS_API_KEY: '',
    DATABASE_URL: '',
    LOCAL_DATA_DIR: dataDir,
  },
  timeout: 30000,
});
const report = {
  checkedAt: new Date().toISOString(),
  nativeFolderPicker: 'dialog selection stubbed; actual trusted IPC grant exercised',
  realFile: 'pending',
  python: 'pending',
  editor: 'pending',
  publicBrowser: 'pending',
  selectedWindowCapture: 'pending',
  providerVoiceAndVision: 'not tested: credentials absent',
};
try {
  const page = await desktop.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Just say the next step.' })).toBeVisible();
  expect(await page.evaluate(() => typeof window.insightos.openAccount)).toBe('function');
  await page.getByRole('button', { name: 'Settings and connections' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your accounts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Hugging Face', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Test Hugging Face', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/sponsor-desktop.png' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await desktop.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, folder);
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
  await expect(page.getByText('Folder: My programs')).toBeVisible();
  const input = page.getByLabel('Tell your computer what to do');
  await input.fill('Write a Python Fibonacci program with 10 numbers');
  await input.press('Enter');
  await expect(page.getByLabel('Python source')).toContainText('count = 10');
  const filename = await page.locator('.computer-artifact-heading h2').textContent();
  const content = await readFile(path.join(folder, filename), 'utf8');
  expect(content).toContain('count = 10');
  report.realFile = 'passed: read actual .py file from selected folder';
  await page.getByRole('button', { name: 'Run with Python' }).click();
  await expect(page.getByLabel('Program output')).toContainText(
    '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]',
  );
  report.python = 'passed: actual interpreter output, exit 0';
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/companion-code.png' });
  if (await page.getByRole('button', { name: 'Open in VS Code' }).isEnabled()) {
    await page.getByRole('button', { name: 'Open in VS Code' }).click();
    await expect(page.locator('.computer-message.assistant').last()).toContainText(
      'Launched VS Code',
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.insightos.screenSources())).some((s) =>
            s.name.includes(filename),
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    report.editor = 'passed: VS Code window title includes actual generated filename';
    await page.getByRole('button', { name: 'See my screen', exact: true }).click();
    await page.getByRole('button', { name: 'Choose a window or screen' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: new RegExp(filename.replace('.', '\\.')) })
      .click();
    await expect(page.locator('.screen-preview')).toBeVisible();
    const image = await page.locator('.screen-preview').getAttribute('src');
    expect(image.length).toBeGreaterThan(1000);
    report.selectedWindowCapture =
      'passed: captured only the selected generated-code VS Code window';
    await page.screenshot({ path: 'artifacts/companion-screen.png' });
  }
  await page.getByRole('button', { name: 'Browse the web', exact: true }).click();
  await page.getByRole('button', { name: 'Open practice book catalog' }).click();
  await expect(page.locator('.browser-address')).toContainText('https://books.toscrape.com/', {
    timeout: 35000,
  });
  await expect(page.locator('.browser-preview')).toBeVisible();
  const book = page
    .locator('.browser-controls')
    .getByRole('button', { name: 'link A Light in the Attic', exact: true });
  await book.click();
  await expect(page.locator('.computer-artifact-heading h2')).toHaveText(
    'A Light in the Attic | Books to Scrape - Sandbox',
    { timeout: 20000 },
  );
  await expect(page.locator('.computer-details pre')).toContainText('In stock');
  report.publicBrowser =
    'passed: visible Chromium opened a real public catalog, clicked actual book link and read stock text';
  await page.screenshot({ path: 'artifacts/companion-browser.png' });
  const prefs = await desktop.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
    };
  });
  expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
  report.securityPreferences = prefs;
  await writeFile('artifacts/computer-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await writeFile(
    'artifacts/computer-verification.json',
    JSON.stringify({ ...report, error: String(error) }, null, 2) + '\n',
  );
  throw error;
} finally {
  await desktop.close();
}
