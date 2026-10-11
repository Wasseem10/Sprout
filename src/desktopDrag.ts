export type DesktopDragSnapshot = { active: boolean; revision: number };
type DragBridge = {
  desktopDrag: () => Promise<DesktopDragSnapshot>;
  onDesktopDrag: (callback: (snapshot: DesktopDragSnapshot) => void) => () => void;
};

/** Shared read-only native drag truth. No cursor polling or window control. */
export function createDesktopDragObserver(bridge?: DragBridge) {
  let active = false;
  let revision = -1;
  let generation = 0;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<(active: boolean) => void>();
  const connect = () => {
    if (!bridge) return;
    const connection = ++generation;
    const accept = (snapshot: DesktopDragSnapshot) => {
      if (
        connection !== generation ||
        !listeners.size ||
        typeof snapshot?.active !== 'boolean' ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0 ||
        snapshot.revision <= revision
      )
        return;
      revision = snapshot.revision;
      if (snapshot.active === active) return;
      active = snapshot.active;
      for (const listener of listeners) listener(active);
    };
    // A native begin/end event can arrive before the getter resolves.
    unsubscribe = bridge.onDesktopDrag(accept);
    try {
      void bridge.desktopDrag().then(accept, () => {});
    } catch {
      // An older/unsupported host retains ordinary web behavior.
    }
  };
  return {
    observe(onChange: (active: boolean) => void) {
      const listener = (next: boolean) => onChange(next);
      listeners.add(listener);
      if (listeners.size === 1) connect();
      let disposed = false;
      return {
        isActive: () => active,
        dispose() {
          if (disposed) return;
          disposed = true;
          listeners.delete(listener);
          if (!listeners.size) {
            generation++;
            unsubscribe?.();
            unsubscribe = undefined;
            active = false;
            revision = -1;
          }
        },
      };
    },
  };
}

let shared: ReturnType<typeof createDesktopDragObserver> | undefined;
export function observeDesktopDrag(onChange: (active: boolean) => void) {
  if (!shared) {
    const native = typeof window === 'undefined' ? undefined : window.insightos;
    const bridge =
      native?.desktopDrag && native.onDesktopDrag
        ? { desktopDrag: native.desktopDrag, onDesktopDrag: native.onDesktopDrag }
        : undefined;
    shared = createDesktopDragObserver(bridge);
  }
  return shared.observe(onChange);
}
