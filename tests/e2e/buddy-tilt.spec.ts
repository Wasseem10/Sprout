import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  // Keep the full owned backdrop in view so screenshot capture cannot scroll
  // the document and change the fixed viewport coordinate basis mid-assertion.
  await page.setViewportSize({ width: 1500, height: 1200 });
  const current: string[] = [];
  errors.set(page, current);
  page.on('pageerror', (error) => current.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      return kind.startsWith('webgl') ? null : getContext.apply(this, [kind, ...args] as never);
    } as typeof getContext;
    let revision = 0;
    const listeners = new Set<(value: { visible: boolean; revision: number }) => void>();
    let dragRevision = 0;
    const dragListeners = new Set<(value: { active: boolean; revision: number }) => void>();
    Object.assign(window, {
      __tiltNativeModes: 0,
      __tiltVisible: (visible: boolean) => {
        for (const listener of listeners) listener({ visible, revision: ++revision });
      },
      __tiltDrag: (active: boolean) => {
        for (const listener of dragListeners) listener({ active, revision: ++dragRevision });
      },
      insightos: {
        desktopDrag: async () => ({ active: false, revision: dragRevision }),
        onDesktopDrag: (listener: (value: { active: boolean; revision: number }) => void) => {
          dragListeners.add(listener);
          return () => dragListeners.delete(listener);
        },
        desktopVisibility: async () => ({ visible: true, revision }),
        onDesktopVisibility: (
          listener: (value: { visible: boolean; revision: number }) => void,
        ) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        setBuddyMode: async () => {
          (window as unknown as { __tiltNativeModes: number }).__tiltNativeModes++;
        },
      },
    });
  });
  await page.route('**/api/**', () => {
    throw new Error('The tilt preview must never call an API.');
  });
  await page.goto('/?studio=panel');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('native drag truth holds despite DOM release/cancel, then settles without stale pointer intent', async ({
  page,
}) => {
  const root = page.locator('.buddy');
  const plane = root.locator('.buddy-visual-plane');
  const box = (await root.boundingBox())!;
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await expect.poll(() => plane.evaluate((element) => element.style.willChange)).toBe('');
  const held = await plane.evaluate((element) => element.style.transform);
  const nativeDrag = (active: boolean) =>
    page.evaluate(
      (value) => (window as unknown as { __tiltDrag: (active: boolean) => void }).__tiltDrag(value),
      active,
    );
  await nativeDrag(true);
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await root.dispatchEvent('pointercancel', { pointerType: 'mouse' });
  await page.getByLabel('Tell your buddy what to do').focus();
  await page.waitForTimeout(100);
  expect(await plane.evaluate((element) => element.style.transform)).toBe(held);
  expect(await plane.evaluate((element) => element.style.willChange)).toBe('');
  await nativeDrag(false);
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  await expect.poll(() => plane.evaluate((element) => element.style.willChange)).toBe('');
  expect(await plane.evaluate((element) => element.style.transform)).toBe('none');
  await page.getByRole('button', { name: 'busy', exact: true }).click();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await nativeDrag(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  expect(await plane.evaluate((element) => element.style.willChange)).toBe('');
  await nativeDrag(false);
  expect(await plane.evaluate((element) => element.style.transform)).toBe('none');
});

test('panel tilts on a fixed surface, holds a pressed pose, then preserves editing and collapse', async ({
  page,
}) => {
  const root = page.locator('.buddy');
  const plane = root.locator('.buddy-visual-plane');
  const box = (await root.boundingBox())!;
  await expect(root.locator('.buddy-panel-glass')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  const shellTransform = await root
    .locator('.buddy-panel-glass')
    .evaluate((element) => getComputedStyle(element).transform);
  const before = await page.evaluate(
    () => (window as unknown as { __tiltNativeModes: number }).__tiltNativeModes,
  );
  await page.getByRole('button', { name: 'busy', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  const contentGeometry = () =>
    root.evaluate((surface) =>
      [
        '.buddy-bar',
        '.buddy-identity strong',
        '.buddy-message p',
        '.buddy-composer',
        'textarea',
        'button',
        '.buddy-face .insight-signal',
      ].map((selector) => ({
        selector,
        elements: [...surface.querySelectorAll<HTMLElement>(selector)]
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const transformedAncestors: string[] = [];
            for (let node: HTMLElement | null = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (
                style.transform !== 'none' ||
                style.rotate !== 'none' ||
                style.scale !== 'none' ||
                style.translate !== 'none'
              )
                transformedAncestors.push(node.className || node.tagName);
              if (node === surface) break;
            }
            return {
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              transformedAncestors,
            };
          }),
      })),
    );
  const neutralContent = await contentGeometry();
  for (const sample of neutralContent) {
    expect(sample.elements.length, `${sample.selector} must be represented`).toBeGreaterThan(0);
    for (const element of sample.elements) expect(element.transformedAncestors).toEqual([]);
  }
  const output = path.join(
    process.cwd(),
    'artifacts',
    process.env.INSIGHTOS_PROOF_TAG ?? 'glass-panel-v006',
    'tilt',
  );
  await mkdir(output, { recursive: true });
  await page.mouse.move(box.x + 8, box.y + 8);
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await expect.poll(() => plane.evaluate((element) => element.style.willChange)).toBe('');
  // The glass can lean, but readable pixels and their hit targets must never
  // enter a perspective layer or move by even a fractional CSS pixel.
  expect(await plane.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  expect(await contentGeometry()).toEqual(neutralContent);
  await page.locator('.panel-preview-scene').screenshot({
    path: path.join(output, 'tilt-left-busy.png'),
  });
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8);
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await expect.poll(() => plane.evaluate((element) => element.style.willChange)).toBe('');
  expect(await plane.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  expect(await contentGeometry()).toEqual(neutralContent);
  await page.locator('.panel-preview-scene').screenshot({
    path: path.join(output, 'tilt-right-busy.png'),
  });
  expect(await root.boundingBox()).toEqual(box);
  expect(await root.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect(
    await root
      .locator('.buddy-panel-glass')
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe(shellTransform);
  const held = await plane.evaluate((element) => element.style.transform);
  await page.mouse.down();
  const input = page.getByLabel('Tell your buddy what to do');
  await input.evaluate((element) => element.focus());
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.waitForTimeout(100);
  expect(await plane.evaluate((element) => element.style.transform)).toBe(held);
  await page.mouse.up();
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  await input.fill('Preserve my glass-panel draft.');
  await input.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(3, 12, 'backward'),
  );
  await page.mouse.move(box.x + box.width - 8, box.y + 150);
  await page.waitForTimeout(100);
  expect(await plane.evaluate((element) => element.style.transform)).toBe('none');
  expect(
    await input.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
      element.selectionDirection,
    ]),
  ).toEqual([3, 12, 'backward']);
  expect(
    await page.evaluate(
      () => (window as unknown as { __tiltNativeModes: number }).__tiltNativeModes,
    ),
  ).toBe(before);
  await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
  await expect(root).toHaveAttribute('data-panel-stage', 'closed');
  await page.getByRole('button', { name: /^Expand buddy/ }).click();
  await expect(root).toHaveAttribute('data-panel-stage', 'open');
  await expect(input).toHaveValue('Preserve my glass-panel draft.');
  expect(
    await input.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([3, 12]);
});

test('cancel, blur, native hide and dynamic reduction reset and stop the decorative loop', async ({
  page,
}) => {
  const root = page.locator('.buddy');
  const plane = root.locator('.buddy-visual-plane');
  const box = (await root.boundingBox())!;
  const move = () => page.mouse.move(box.x + box.width - 8, box.y + 180);
  await move();
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await page.mouse.down();
  await root.dispatchEvent('pointercancel', { pointerType: 'mouse' });
  await page.mouse.up();
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  await page.mouse.move(box.x + 8, box.y + 180);
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await move();
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await page.evaluate(() =>
    (window as unknown as { __tiltVisible: (visible: boolean) => void }).__tiltVisible(false),
  );
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  expect(await plane.evaluate((element) => element.style.willChange)).toBe('');
  await page.evaluate(() =>
    (window as unknown as { __tiltVisible: (visible: boolean) => void }).__tiltVisible(true),
  );
  expect(await plane.evaluate((element) => element.style.transform)).toBe('none');
  await page.mouse.move(box.x + 8, box.y + 180);
  await expect(plane).toHaveAttribute('data-tilt', 'active');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  expect(await plane.evaluate((element) => element.style.willChange)).toBe('');
  const still = await root.screenshot();
  await page.waitForTimeout(200);
  expect(await root.screenshot()).toEqual(still);
});
