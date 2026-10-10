// Native overlay rehearsal against the running local development backend.
// Uses real configured HF inference for the small Python request below.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const desktop = await electron.launch({ args: [path.resolve('.'), '--dev'], timeout: 30000 });
const report = { checkedAt: new Date().toISOString(), checks: [] };
let originalSpeech, buddyPage;
try {
  const page = await desktop.firstWindow();
  buddyPage = page;
  await expect(page.getByRole('region', { name: 'InsightOS desktop buddy' })).toBeVisible();
  originalSpeech = await page.evaluate(() => localStorage.getItem('insightos.buddySpeech'));
  const windowInfo = () =>
    desktop.evaluate(({ BrowserWindow, globalShortcut }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        bounds: win.getBounds(),
        alwaysOnTop: win.isAlwaysOnTop(),
        visible: win.isVisible(),
        preferences: {
          sandbox: win.webContents.getLastWebPreferences().sandbox,
          contextIsolation: win.webContents.getLastWebPreferences().contextIsolation,
          nodeIntegration: win.webContents.getLastWebPreferences().nodeIntegration,
        },
        voiceShortcut: globalShortcut.isRegistered('Control+Shift+Space'),
        stopShortcut: globalShortcut.isRegistered('Control+Shift+Backspace'),
      };
    });
  const initial = await windowInfo();
  assert.equal(initial.bounds.width, 360);
  assert.equal(initial.bounds.height, 86);
  assert.equal(initial.alwaysOnTop, true);
  assert.deepEqual(initial.preferences, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
  assert.equal(initial.voiceShortcut, true);
  assert.equal(initial.stopShortcut, true);
  report.checks.push({ name: 'Native collapsed window and registered OS shortcuts', ...initial });
  await page.screenshot({ path: 'artifacts/buddy-collapsed.png', omitBackground: true });
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  await expect.poll(async () => (await windowInfo()).bounds.height).toBe(580);
  await expect(page.getByRole('textbox', { name: 'Tell your buddy what to do' })).toBeEnabled();
  const mute = page.getByRole('button', { name: 'Mute spoken replies' });
  if (await mute.isVisible()) await mute.click();
  await page
    .getByRole('textbox', { name: 'Tell your buddy what to do' })
    .fill('Write a Python program that prints the sum of integers from 1 through 10.');
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run program', exact: true })).toBeEnabled({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Run program', exact: true }).click();
  await expect(page.locator('.buddy-message.assistant').last()).toContainText('55', {
    timeout: 20000,
  });
  report.checks.push({
    name: 'Real AI generation and Python execution from buddy',
    output: '55, exit 0',
  });
  await page.screenshot({ path: 'artifacts/buddy-expanded.png', omitBackground: true });
  await page.getByRole('button', { name: 'Open full workspace' }).click();
  await expect.poll(async () => (await windowInfo()).alwaysOnTop).toBe(false);
  await expect(page.getByLabel('Program output')).toContainText('55');
  await page.getByRole('button', { name: 'Return to desktop buddy ↗' }).click();
  await expect.poll(async () => (await windowInfo()).bounds.height).toBe(86);
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  await expect(page.locator('.buddy-message.assistant').last()).toContainText('55');
  report.checks.push({
    name: 'Workspace and buddy preserve task state and conversation',
    passed: true,
  });
  // Exercise native event delivery without opening the user's physical microphone.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('insightos:desktop-command', 'voice'),
  );
  await expect(page.getByText('Opening microphone…', { exact: true })).toBeVisible();
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('insightos:desktop-command', 'stop'),
  );
  await expect(page.getByRole('button', { name: 'Record a voice request' })).toBeEnabled();
  report.checks.push({
    name: 'Native voice/stop event bridge',
    passed: true,
    limitation: 'Events dispatched in test; physical OS keypress and microphone not tested.',
  });
  await page.getByRole('button', { name: 'Hide to system tray' }).click();
  await expect.poll(async () => (await windowInfo()).visible).toBe(false);
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.show();
    win.webContents.send('insightos:desktop-command', 'show');
  });
  await expect(page.getByRole('textbox', { name: 'Tell your buddy what to do' })).toBeVisible();
  report.checks.push({ name: 'Hide and restore preserve the live renderer', passed: true });
  await writeFile('artifacts/buddy-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (buddyPage)
    await buddyPage
      .evaluate((value) => {
        if (value === null || value === undefined) localStorage.removeItem('insightos.buddySpeech');
        else localStorage.setItem('insightos.buddySpeech', value);
      }, originalSpeech)
      .catch(() => {});
  await desktop.close();
}
