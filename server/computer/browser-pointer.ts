import type { Page, Locator } from 'playwright';

// This marks the browser automation pointer; it does not impersonate the OS cursor.
export async function pointAt(page: Page, target: Locator, signal: AbortSignal) {
  signal.throwIfAborted();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('The target is no longer visible. Read the page again.');
  await page.bringToFront();
  await page.evaluate(() => {
    if (document.getElementById('insightos-action-pointer')) return;
    const pointer = document.createElement('div');
    pointer.id = 'insightos-action-pointer';
    pointer.setAttribute('aria-hidden', 'true');
    pointer.style.cssText =
      'position:fixed;left:24px;top:24px;width:22px;height:22px;border:3px solid white;border-radius:50%;background:#287eff;box-shadow:0 0 0 6px #287eff55,0 2px 12px #0008;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);';
    document.documentElement.append(pointer);
    document.addEventListener(
      'mousemove',
      (event) => {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
      },
      true,
    );
  });
  signal.throwIfAborted();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
  await page.waitForTimeout(120);
  signal.throwIfAborted();
}
