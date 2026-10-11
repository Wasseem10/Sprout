// Test-only API interception. Original browser methods still own all graphics,
// scheduling and native presentation; this file does not run in the product.
export function installBuddyRuntimeProbe({ rendererChunk }) {
  const contexts = [];
  const contextRecords = new WeakMap();
  const handles = new WeakMap();
  const callbackRecords = new WeakMap();
  const callbacks = [];
  const pending = new Map();
  let executing = null;
  let measuring = false;
  let clockId = 0;
  let clockTimes = [];
  let mutations = [];
  let lastMutation = '';
  const originalRaf = window.requestAnimationFrame.bind(window);
  const originalCancel = window.cancelAnimationFrame.bind(window);

  function recordContext(gl, canvas) {
    if (contextRecords.has(gl)) return contextRecords.get(gl);
    const record = {
      id: contexts.length + 1,
      label: canvas.__runtimeProbeLabel ?? (canvas.closest('.buddy-face') ? 'native-pet' : 'other'),
      gl,
      draws: 0,
      clears: 0,
      callbackCount: 0,
      resources: {},
      textureHandles: [],
      framebufferHandles: [],
      boundTextures: new Map(),
      frameTimes: [],
      callbackCPU: [],
    };
    contexts.push(record);
    contextRecords.set(gl, record);
    return record;
  }

  const originalContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const gl = originalContext.call(this, kind, ...args);
    if (gl && (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl'))
      recordContext(gl, this);
    return gl;
  };

  const prototypes = [
    window.WebGLRenderingContext?.prototype,
    window.WebGL2RenderingContext?.prototype,
  ];
  for (const prototype of prototypes.filter(Boolean)) {
    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
      'clear',
    ]) {
      const original = prototype[name];
      if (!original || original.__runtimeProbeWrapped) continue;
      const wrapped = function (...args) {
        const record = contextRecords.get(this);
        if (record) {
          if (name === 'clear') record.clears++;
          else {
            record.draws++;
            if (executing) {
              executing.record.contexts.add(record);
              executing.drawn.add(record);
            }
          }
        }
        return original.apply(this, args);
      };
      wrapped.__runtimeProbeWrapped = true;
      prototype[name] = wrapped;
    }
    for (const kind of [
      'Buffer',
      'Texture',
      'Framebuffer',
      'Renderbuffer',
      'Program',
      'Shader',
      'VertexArray',
    ]) {
      for (const operation of ['create', 'delete']) {
        const name = `${operation}${kind}`;
        const original = prototype[name];
        if (!original || original.__runtimeProbeWrapped) continue;
        const wrapped = function (...args) {
          const value = original.apply(this, args);
          const record = contextRecords.get(this);
          if (record) {
            record.resources[kind] ??= { created: 0, deleted: 0, live: 0 };
            if (operation === 'create' && value) {
              const handle = { record, kind, deleted: false };
              if (kind === 'Texture') record.textureHandles.push(handle);
              if (kind === 'Framebuffer') {
                handle.creationOrder = record.framebufferHandles.length;
                record.framebufferHandles.push(handle);
              }
              handles.set(value, handle);
              record.resources[kind].created++;
              record.resources[kind].live++;
            } else if (operation === 'delete' && args[0]) {
              const handle = handles.get(args[0]);
              if (handle) {
                handle.deleted = true;
                handle.record.resources[handle.kind].deleted++;
                handle.record.resources[handle.kind].live--;
                handles.delete(args[0]);
              }
            }
          }
          return value;
        };
        wrapped.__runtimeProbeWrapped = true;
        prototype[name] = wrapped;
      }
    }
    for (const name of [
      'bindTexture',
      'texStorage2D',
      'texStorage3D',
      'texImage2D',
      'texImage3D',
      'texSubImage2D',
    ]) {
      const original = prototype[name];
      if (!original || original.__runtimeProbeWrapped) continue;
      const wrapped = function (...args) {
        const record = contextRecords.get(this);
        if (record) {
          if (name === 'bindTexture') record.boundTextures.set(args[0], args[1]);
          else {
            const target =
              args[0] >= this.TEXTURE_CUBE_MAP_POSITIVE_X &&
              args[0] <= this.TEXTURE_CUBE_MAP_NEGATIVE_Z
                ? this.TEXTURE_CUBE_MAP
                : args[0];
            const handle = handles.get(record.boundTextures.get(target));
            if (handle) {
              if (name === 'texStorage2D')
                handle.storage = {
                  target: args[0],
                  levels: args[1],
                  internalFormat: args[2],
                  width: args[3],
                  height: args[4],
                };
              if (name === 'texImage2D' && args.length >= 9)
                handle.storage = {
                  target,
                  internalFormat: args[2],
                  width: args[3],
                  height: args[4],
                };
              if (name === 'texStorage3D' || name === 'texImage3D')
                handle.storage = {
                  target,
                  internalFormat: args[2],
                  width: args[3],
                  height: args[4],
                  depth: args[5],
                };
              const data = args.at(-1);
              if (data instanceof Uint16Array && data.length === 512)
                handle.upload = {
                  elementType: 'Uint16Array',
                  elements: data.length,
                  bytes: data.byteLength,
                  firstValues: Array.from(data.subarray(0, 8)),
                };
            }
          }
        }
        return original.apply(this, args);
      };
      wrapped.__runtimeProbeWrapped = true;
      prototype[name] = wrapped;
    }
  }

  window.requestAnimationFrame = function (callback) {
    let record = callbackRecords.get(callback);
    if (!record) {
      const stack = new Error().stack ?? '';
      record = {
        id: callbacks.length + 1,
        kind: callback.__runtimePanelClock
          ? 'harness-panel-clock'
          : stack.includes(rendererChunk)
            ? 'avatar'
            : 'other-application',
        executions: 0,
        contexts: new Set(),
      };
      callbacks.push(record);
      callbackRecords.set(callback, record);
    }
    const id = originalRaf((at) => {
      pending.delete(id);
      const previous = executing;
      const execution = { record, drawn: new Set() };
      const started = performance.now();
      executing = execution;
      try {
        return callback(at);
      } finally {
        const elapsed = performance.now() - started;
        record.executions++;
        for (const context of record.contexts) {
          if (record.kind === 'avatar') context.callbackCount++;
        }
        if (measuring && record.kind === 'avatar') {
          for (const context of execution.drawn) {
            context.frameTimes.push(at);
            context.callbackCPU.push(elapsed);
          }
        }
        executing = previous;
      }
    });
    pending.set(id, record);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    pending.delete(id);
    return originalCancel(id);
  };

  const observer = new MutationObserver(() => {
    if (!measuring) return;
    const buddy = document.querySelector('.buddy');
    const signal = document.querySelector('.buddy-face .insight-signal');
    const state = `${buddy?.dataset.panelStage ?? ''}/${signal?.dataset.phase ?? ''}`;
    if (state === lastMutation) return;
    lastMutation = state;
    mutations.push({
      at: performance.now(),
      panelStage: buddy?.dataset.panelStage,
      phase: signal?.dataset.phase,
    });
    console.timeStamp(`INSIGHTOS_STATE:${state}`);
  });
  observer.observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-panel-stage', 'data-phase'],
  });

  const percentile = (values, fraction) =>
    values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : 0;
  const summary = (times) => {
    const intervals = times.slice(1).map((at, index) => at - times[index]);
    return {
      samples: intervals.length,
      p95Ms: percentile(intervals, 0.95),
      maxMs: intervals.length ? Math.max(...intervals) : 0,
      above20Ms: intervals.filter((value) => value > 20).length,
      above50Ms: intervals.filter((value) => value > 50).length,
    };
  };
  const clock = (at) => {
    if (!measuring) return;
    clockTimes.push(at);
    clockId = window.requestAnimationFrame(clock);
  };
  clock.__runtimePanelClock = true;

  window.__buddyRuntimeProbe = {
    begin() {
      clockTimes = [];
      mutations = [];
      lastMutation = '';
      for (const context of contexts) {
        context.frameTimes = [];
        context.callbackCPU = [];
      }
      measuring = true;
      console.timeStamp('INSIGHTOS_RUNTIME_START');
      clockId = window.requestAnimationFrame(clock);
      return performance.now();
    },
    end() {
      measuring = false;
      window.cancelAnimationFrame(clockId);
      console.timeStamp('INSIGHTOS_RUNTIME_END');
      return {
        endedAt: performance.now(),
        documentRafClock: summary(clockTimes),
        avatar: contexts.map((context) => ({
          id: context.id,
          label: context.label,
          drawCallbackClock: summary(context.frameTimes),
          callbackCPUP95Ms: percentile(context.callbackCPU, 0.95),
          callbackCPUMaxMs: context.callbackCPU.length ? Math.max(...context.callbackCPU) : 0,
        })),
        mutations,
      };
    },
    snapshot() {
      return {
        at: performance.now(),
        hidden: document.hidden,
        globalPendingAvatarCallbacks: [...pending.values()].filter(
          (record) => record.kind === 'avatar',
        ).length,
        unassignedPendingAvatarCallbacks: [...pending.values()].filter(
          (record) => record.kind === 'avatar' && record.contexts.size === 0,
        ).length,
        contexts: contexts.map((context) => ({
          id: context.id,
          label: context.label,
          draws: context.draws,
          clears: context.clears,
          avatarCallbacks: context.callbackCount,
          pendingAvatarCallbacks: [...pending.values()].filter(
            (callback) => callback.kind === 'avatar' && callback.contexts.has(context),
          ).length,
          resources: JSON.parse(JSON.stringify(context.resources)),
          unmatchedTextureSignatures: context.textureHandles
            .filter((handle) => !handle.deleted)
            .map((handle) => ({ storage: handle.storage, upload: handle.upload })),
          unmatchedFramebufferCreationOrders: context.framebufferHandles
            .filter((handle) => !handle.deleted)
            .map((handle) => handle.creationOrder),
          contextLost: context.gl.isContextLost(),
        })),
        callbacks: callbacks.map((record) => ({
          id: record.id,
          kind: record.kind,
          executions: record.executions,
          pending: [...pending.values()].filter((value) => value === record).length,
        })),
      };
    },
  };
}
