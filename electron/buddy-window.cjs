const buddySizes = Object.freeze({
  pill: { width: 296, height: 128 },
  panel: { width: 408, height: 672 },
  workspace: { width: 1350, height: 900 },
});

function buddyBounds(mode, area, dockPosition, zoomFactor = 1) {
  const size = buddySizes[mode];
  if (!size) throw new Error('Unknown companion mode.');
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0)
    throw new Error('Invalid companion zoom factor.');
  // Dock dimensions describe CSS pixels; native geometry is in desktop DIPs.
  const scale = mode === 'workspace' ? 1 : zoomFactor;
  const width = Math.min(Math.ceil(size.width * scale), area.width);
  const height = Math.min(Math.ceil(size.height * scale), area.height);
  const anchor = mode === 'workspace' ? undefined : dockPosition;
  // Keep the pet's top-left screen anchor stable, except where work-area clamping requires movement.
  const x = anchor?.x ?? area.x + (area.width - width) / 2;
  const y = anchor?.y ?? area.y + 20;
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
    width,
    height,
  };
}

module.exports = { buddyBounds, buddySizes };
