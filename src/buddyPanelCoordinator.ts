export type BuddyMode = 'pill' | 'panel' | 'workspace';
export type BuddyPanelStage = 'closed' | 'preparing-open' | 'open' | 'closing';

export type BuddyBoundsAcknowledgement = {
  mode: BuddyMode;
  requestId: number;
  bounds: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
};

type PanelPorts = {
  nativeMode: (
    mode: BuddyMode,
    requestId: number,
  ) => Promise<BuddyBoundsAcknowledgement | undefined>;
  layoutReady: (
    acknowledgement: BuddyBoundsAcknowledgement | undefined,
    signal: AbortSignal,
  ) => Promise<void>;
  decorate: (expanded: boolean, signal: AbortSignal) => Promise<void>;
  stage: (stage: BuddyPanelStage) => void;
  beforeHide: () => void;
  afterReveal: () => void;
  error: (message: string) => void;
};

/** Only layout belongs here. Voice and task actions never await this coordinator. */
export function createBuddyPanelCoordinator(ports: PanelPorts) {
  let operation = 0;
  let available = false;
  let disposed = false;
  let pending: AbortController | undefined;

  async function request(expanded: boolean, reservePanel = false) {
    if (disposed) return;
    const current = ++operation;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const valid = () => !disposed && current === operation && !controller.signal.aborted;

    try {
      if (expanded) {
        if (!available) ports.stage('preparing-open');
        const applied = await ports.nativeMode('panel', current);
        if (!valid()) return;
        if (applied && (applied.mode !== 'panel' || applied.requestId !== current))
          throw new Error('The desktop returned a different layout request.');
        await ports.layoutReady(applied, controller.signal);
        if (!valid()) return;
        const newlyAvailable = !available;
        available = true;
        ports.stage('open');
        if (newlyAvailable) ports.afterReveal();
        await ports.decorate(true, controller.signal);
      } else {
        if (available) ports.beforeHide();
        available = false;
        ports.stage('closing');
        await ports.decorate(false, controller.signal);
        if (!valid()) return;
        await ports.nativeMode(reservePanel ? 'panel' : 'pill', current);
        if (!valid()) return;
        ports.stage('closed');
      }
    } catch (error) {
      if (!valid()) return;
      if (available) ports.beforeHide();
      available = false;
      ports.stage('closed');
      ports.error(
        error instanceof Error
          ? `The conversation could not open safely. ${error.message}`
          : 'The conversation could not open safely. Try opening it again.',
      );
      if (expanded && !reservePanel) {
        // A failed reveal must not leave a large invisible window over the desktop.
        await ports.nativeMode('pill', current).catch(() => {});
      }
    }
  }

  return {
    request,
    dispose() {
      disposed = true;
      operation++;
      pending?.abort();
    },
  };
}

/** IPC completion alone is insufficient: observe the applied renderer viewport too. */
export function waitForBuddyViewport(
  acknowledgement: BuddyBoundsAcknowledgement | undefined,
  signal: AbortSignal,
) {
  if (!acknowledgement) return Promise.resolve(); // Ordinary web preview has no native host.
  return new Promise<void>((resolve, reject) => {
    const { width, height } = acknowledgement.viewport;
    const ready = () => window.innerWidth >= width - 1 && window.innerHeight >= height - 1;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      window.removeEventListener('resize', inspect);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (ready()) finish();
    };
    const abort = () => finish(new DOMException('Panel intent changed.', 'AbortError'));
    const timeout = window.setTimeout(
      () => finish(new Error('The desktop window has not applied its new size.')),
      1800,
    );
    if (signal.aborted) abort();
    else if (ready()) finish();
    else {
      window.addEventListener('resize', inspect);
      signal.addEventListener('abort', abort, { once: true });
    }
  });
}
