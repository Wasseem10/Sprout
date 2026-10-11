export type DesktopVisibilitySnapshot = { visible: boolean; revision: number };
type VisibilityBridge = {
  desktopVisibility: () => Promise<DesktopVisibilitySnapshot>;
  onDesktopVisibility: (callback: (snapshot: DesktopVisibilitySnapshot) => void) => () => void;
};

/** One read-only native subscription shared by presentation consumers. */
export function createDesktopVisibilityObserver(bridge?: VisibilityBridge) {
  let visible = !bridge;
  let revision = -1;
  let generation = 0;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<(visible: boolean) => void>();
  const notify = (next: boolean) => {
    if (next === visible) return;
    visible = next;
    for (const listener of listeners) listener(visible);
  };
  const connect = () => {
    if (!bridge) return;
    const connection = ++generation;
    revision = -1;
    visible = false; // A supported native window must establish its initial truth.
    const accept = (snapshot: DesktopVisibilitySnapshot) => {
      if (
        connection !== generation ||
        !listeners.size ||
        typeof snapshot?.visible !== 'boolean' ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0 ||
        snapshot.revision <= revision
      )
        return;
      revision = snapshot.revision;
      notify(snapshot.visible);
    };
    // Subscribe first: a newer hide/show can race the initial IPC response.
    unsubscribe = bridge.onDesktopVisibility(accept);
    const unavailable = () => {
      // Older/unsupported hosts retain ordinary web behavior; never override a newer event.
      if (connection === generation && listeners.size && revision < 0) notify(true);
    };
    try {
      void bridge.desktopVisibility().then(accept, unavailable);
    } catch {
      unavailable();
    }
  };
  return {
    observe(onChange: (visible: boolean) => void) {
      const listener = (next: boolean) => onChange(next);
      listeners.add(listener);
      if (listeners.size === 1) connect();
      let disposed = false;
      return {
        isVisible: () => visible,
        dispose() {
          if (disposed) return;
          disposed = true;
          listeners.delete(listener);
          if (!listeners.size) {
            generation++;
            unsubscribe?.();
            unsubscribe = undefined;
            revision = -1;
            visible = !bridge;
          }
        },
      };
    },
  };
}

let shared: ReturnType<typeof createDesktopVisibilityObserver> | undefined;
export function observeDesktopVisibility(onChange: (visible: boolean) => void) {
  if (!shared) {
    const native = typeof window === 'undefined' ? undefined : window.insightos;
    const bridge =
      native?.desktopVisibility && native.onDesktopVisibility
        ? {
            desktopVisibility: native.desktopVisibility,
            onDesktopVisibility: native.onDesktopVisibility,
          }
        : undefined;
    shared = createDesktopVisibilityObserver(bridge);
  }
  return shared.observe(onChange);
}
