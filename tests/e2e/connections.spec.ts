import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ConnectionState } from '../../shared/connections';

test('saves keys through masked fields, refreshes capabilities, and shows real-test results without retaining secrets', async ({
  page,
}) => {
  const state: ConnectionState = {
    editable: true,
    defaults: {
      HF_MODEL_ID: 'Qwen/Qwen2.5-7B-Instruct',
      HF_VISION_MODEL_ID: 'Qwen/Qwen2.5-VL-7B-Instruct',
      ELEVENLABS_VOICE_ID: '',
      DATABRICKS_HOST: '',
      DATABRICKS_WAREHOUSE_ID: '',
      DATABRICKS_CATALOG: 'main',
      DATABRICKS_SCHEMA: 'insightos',
      APP_MODE: 'sample',
    },
    configured: {
      huggingFace: false,
      elevenLabs: false,
      databricks: false,
      neon: false,
      vultr: false,
    },
    reports: {},
  };
  let submitted: unknown;
  await page.route('**/api/connections', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      state.configured.huggingFace = true;
    }
    await route.fulfill({ json: state });
  });
  await page.route('**/api/connections/verify', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ provider: 'huggingFace' });
    state.reports.huggingFace = {
      checkedAt: new Date().toISOString(),
      checks: [
        {
          status: 'passed',
          detail: 'Commands and code: Validated real AI plan and generated Python.',
        },
        {
          status: 'failed',
          detail: 'Screen vision: HTTP 401. Check key permissions, model access and credits.',
        },
      ],
    };
    await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and connections' }).click();
  const card = page
    .locator('.sponsor-card')
    .filter({ has: page.getByRole('heading', { name: 'Hugging Face', exact: true }) });
  const token = card.getByLabel('Access token', { exact: true });
  await expect(token).toHaveAttribute('type', 'password');
  await token.fill('fake-local-test-token');
  await card.getByRole('button', { name: 'Save Hugging Face', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved. Settings' })).toBeVisible();
  expect(submitted).toMatchObject({ HF_TOKEN: 'fake-local-test-token' });
  await expect(token).toHaveValue('');
  await card.getByRole('button', { name: 'Test Hugging Face', exact: true }).click();
  await expect(card.getByText('Needs attention', { exact: true })).toBeVisible();
  await expect(card.getByText(/HTTP 401/)).toBeVisible();
  await token.fill('unsaved-secret');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Settings and connections' }).click();
  await expect(card.getByLabel('Access token', { exact: true })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByLabel('Access token', { exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/sponsor-connections.png', fullPage: true });
});

test('canceling an in-flight connection test releases the interface', async ({ page }) => {
  const state = {
    editable: true,
    defaults: {
      HF_MODEL_ID: 'model',
      HF_VISION_MODEL_ID: 'vision',
      ELEVENLABS_VOICE_ID: '',
      DATABRICKS_HOST: '',
      DATABRICKS_WAREHOUSE_ID: '',
      DATABRICKS_CATALOG: 'main',
      DATABRICKS_SCHEMA: 'insightos',
      APP_MODE: 'sample',
    },
    configured: { huggingFace: true, elevenLabs: false, databricks: false, neon: false },
    reports: {},
  };
  await page.route('**/api/connections', (route) => route.fulfill({ json: state }));
  await page.route('**/api/connections/verify', () => {});
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and connections' }).click();
  const button = page.getByRole('button', { name: 'Test Hugging Face', exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel connection request' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'canceled' })).toBeVisible();
  await expect(button).toBeEnabled();
});
