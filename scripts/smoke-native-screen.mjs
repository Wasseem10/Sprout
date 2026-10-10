// Verifies the voice-friendly one-shot display capture in real Electron.
// The image stays in memory; this check does not upload or save desktop pixels.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';

const desktop = await electron.launch({ args: [path.resolve('.'), '--dev'], timeout: 30000 });
try {
  const page = await desktop.firstWindow();
  await expect(page.getByRole('region', { name: 'InsightOS desktop buddy' })).toBeVisible();
  const result = await page.evaluate(async () => {
    const capture = await window.insightos.captureCurrentScreen();
    return { name: capture.name, prefix: capture.image.slice(0, 30), length: capture.image.length };
  });
  assert.match(result.name, /^Main display/);
  assert.match(result.prefix, /^data:image\/png;base64,/);
  assert.ok(result.length > 1000);
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  console.log(JSON.stringify({ capture: 'passed', buddyRestored: true, imageBytes: 'not saved or uploaded' }));
} finally {
  await desktop.close();
}
