import {
  AgXToneMapping,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InterleavedBufferAttribute,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { BuddyVisualState } from './AssistantSignal';
import type { AudioPresentationRef } from './audioPresentation';
import { BuddyAudioEnvelope } from './buddyAudioEnvelope';
import { auditSproutModel, SproutMotionController } from './buddyMotionController';
import { observeDesktopVisibility } from './desktopVisibility';

export type BuddyAsset = 'sprout' | 'ribbon';
export type BuddyRendererSettings = {
  phase: BuddyVisualState;
  motion: boolean;
  audio?: AudioPresentationRef;
  reaction?: number;
  blink?: number;
  gaze?: { x: number; y: number } | null;
};
export type BuddyRendererDiagnostics = {
  asset: BuddyAsset;
  clips: string[];
  assetIssues: string[];
  vertices: number;
  triangles: number;
  frames: number;
  intervalP95: number;
  intervalMax: number;
  missedBudgets: number;
  renderP95: number;
  drawCalls: number;
  resolution: string;
  startup: {
    assetBytes: number;
    fetchMs: number;
    parseMs: number;
    gpuSetupMs: number;
    firstRenderMs: number;
  };
  memory: {
    geometries: number;
    textures: number;
    geometryAttributeBytes: number;
    environmentColorBytesEstimate: number;
    note: string;
  };
};
export type BuddyRenderer = {
  update: (settings: BuddyRendererSettings) => void;
  diagnostics: () => BuddyRendererDiagnostics;
  dispose: () => void;
};

/** Broad reflection cards reproduce the authored studio structure without postprocessing. */
function createEnvironment(renderer: WebGLRenderer, asset: BuddyAsset) {
  const studio = new Scene();
  studio.background =
    asset === 'sprout'
      ? new Color().setRGB(0.022, 0.031, 0.047)
      : new Color().setRGB(0.045, 0.055, 0.065);
  const lights =
    asset === 'sprout'
      ? [
          { position: [-3.5, 3.8, 3], size: [1.45, 3.4], color: [1, 0.95, 0.9], intensity: 6 },
          { position: [3.2, 1.5, 2], size: [1.3, 2.2], color: [0.75, 0.92, 1], intensity: 0.8 },
          { position: [1.2, 3, -2], size: [2.8, 0.9], color: [0.84, 1, 0.95], intensity: 6.4 },
        ]
      : [
          { position: [-3.2, 3.2, 3.4], size: [2.4, 4], color: [1, 0.95, 0.9], intensity: 6 },
          { position: [3, 0.4, 2.5], size: [2.4, 2], color: [0.75, 0.92, 1], intensity: 2 },
          { position: [1.7, 2.5, -2.8], size: [1, 3.2], color: [0.84, 1, 0.95], intensity: 8 },
          { position: [0, -0.5, 4], size: [6, 6], color: [0.8, 0.9, 0.93], intensity: 1.3 },
        ];
  for (const light of lights) {
    const panel = new Mesh(
      new PlaneGeometry(light.size[0], light.size[1]),
      new MeshBasicMaterial({
        color: new Color()
          .setRGB(light.color[0], light.color[1], light.color[2])
          .multiplyScalar(light.intensity),
      }),
    );
    panel.position.set(light.position[0], light.position[1], light.position[2]);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }
  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0.025, 0.1, 100, { size: 128 });
  } finally {
    for (const child of studio.children)
      if (child instanceof Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    generator.dispose();
  }
}

function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  const skeletons = new Set<Skeleton>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap)
      texture.image.close();
  }
  for (const material of materials) material.dispose();
}

async function loadModel(signal?: AbortSignal): Promise<{
  gltf: GLTF;
  asset: BuddyAsset;
  issues: string[];
  assetBytes: number;
  fetchMs: number;
  parseMs: number;
} | null> {
  const issues: string[] = [];
  for (const [path, asset] of [
    ['sprout-v002.glb', 'sprout'],
    ['insight-core-v1.glb', 'ribbon'],
  ] as const) {
    if (signal?.aborted) return null;
    let gltf: GLTF;
    let assetBytes = 0;
    let fetchMs = 0;
    let parseMs = 0;
    try {
      const fetchStarted = performance.now();
      const response = await fetch(`/buddy/${path}`, { signal });
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      assetBytes = buffer.byteLength;
      fetchMs = performance.now() - fetchStarted;
      const parseStarted = performance.now();
      gltf = await new GLTFLoader().parseAsync(buffer, '/buddy/');
      parseMs = performance.now() - parseStarted;
    } catch {
      if (signal?.aborted) return null;
      continue;
    }
    if (signal?.aborted) {
      disposeModel(gltf.scene);
      return null;
    }
    if (asset === 'sprout') {
      const failures = auditSproutModel(gltf.scene, gltf.animations);
      if (failures.length) {
        issues.push(...failures);
        disposeModel(gltf.scene);
        continue;
      }
    }
    return { gltf, asset, issues, assetBytes, fetchMs, parseMs };
  }
  return null;
}

const percentile = (values: number[], fraction: number) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : 0;

/** Owns one canvas, scene and animation clock. No voice resources or per-frame React state. */
export async function createBuddyRenderer(
  canvas: HTMLCanvasElement,
  initial: BuddyRendererSettings,
  onReady: (ready: boolean) => void,
  signal?: AbortSignal,
  onDiagnostics?: (diagnostics: BuddyRendererDiagnostics) => void,
): Promise<BuddyRenderer | null> {
  const initializationStarted = performance.now();
  const owner = canvas.parentElement;
  // Parse before GPU allocation so detached/Strict Mode instances consume no GPU context.
  const loaded = await loadModel(signal);
  if (!loaded) return null;
  const { gltf, asset, issues } = loaded;
  const model = gltf.scene;
  if (!owner || !canvas.isConnected || signal?.aborted) {
    disposeModel(model);
    return null;
  }
  const gpuStarted = performance.now();
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch {
    disposeModel(model);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new Scene();
  let environmentMap: ReturnType<typeof createEnvironment>;
  try {
    environmentMap = createEnvironment(renderer, asset);
  } catch {
    disposeModel(model);
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 1;
  const framing = asset === 'sprout' ? 1.4 : 1.38;
  const camera = new OrthographicCamera(-framing, framing, framing, -framing, 0.1, 30);
  camera.position.set(
    asset === 'sprout' ? 0.1 : 0.35,
    asset === 'sprout' ? 0.24 : 0.75,
    asset === 'sprout' ? 6 : 5.8,
  );
  camera.lookAt(0, asset === 'sprout' ? 0.08 : 0, 0);
  const keyBase = asset === 'sprout' ? 1.7 : 2.3;
  const key = new DirectionalLight(0xf1faff, keyBase);
  if (asset === 'sprout') key.position.set(-3.5, 3.8, 3);
  else key.position.set(-3, 4, 5);
  const rim = new DirectionalLight(0xa7ddd7, asset === 'sprout' ? 0.7 : 1.7);
  if (asset === 'sprout') rim.position.set(1.2, 3, -2);
  else rim.position.set(3, -1, -3);
  scene.add(key, rim, new HemisphereLight(0xe4f6f3, 0x131b24, asset === 'sprout' ? 0.4 : 0.8));
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  if (asset === 'ribbon') model.position.sub(bounds.getCenter(new Vector3()));
  const mount = new Group();
  mount.add(model);
  if (asset === 'ribbon') mount.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 0.001));
  scene.add(mount);
  const controller =
    asset === 'sprout' ? new SproutMotionController(model, gltf.animations, size.y * 0.02) : null;
  const ribbonMixer = controller ? null : new AnimationMixer(model);
  if (ribbonMixer) for (const clip of gltf.animations) ribbonMixer.clipAction(clip).play();
  const lights: { material: MeshStandardMaterial; intensity: number; color: Color }[] = [];
  let vertices = 0;
  let triangles = 0;
  const attributeArrays = new Set<{ byteLength: number }>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // The proof includes skin/morph extremes; do not cull against only static basis bounds.
    object.frustumCulled = false;
    vertices += object.geometry.attributes.position?.count ?? 0;
    for (const attribute of [
      ...Object.values(object.geometry.attributes),
      ...Object.values(object.geometry.morphAttributes).flat(),
      object.geometry.index,
    ])
      if (attribute)
        attributeArrays.add(
          attribute instanceof InterleavedBufferAttribute ? attribute.data.array : attribute.array,
        );
    triangles +=
      (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (
        material instanceof MeshStandardMaterial &&
        material.emissiveIntensity > 0 &&
        material.emissive.getHex() !== 0
      )
        lights.push({
          material,
          intensity: material.emissiveIntensity,
          color: material.emissive.clone(),
        });
    }
  });
  let settings = initial;
  let disposed = false;
  let visible = true;
  let contextLost = false;
  let frame = 0;
  let lastFrame = 0;
  let lastRenderedAt = 0;
  let elapsed = 0;
  let nextBlink = 4.8;
  let pointer = { x: 0, y: 0 };
  let lastReaction = initial.reaction ?? 0;
  let lastBlink = initial.blink ?? 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const envelope = new BuddyAudioEnvelope();
  const glowColor = new Color();
  let reportedReady = false;
  let gpuSetupMs = 0;
  let firstRenderMs = 0;
  let frames = 0;
  let lastReport = 0;
  const intervals: number[] = [];
  const renderCosts: number[] = [];
  let desktopVisibility: ReturnType<typeof observeDesktopVisibility> | undefined;
  const moving = () => settings.motion && !reducedMotion.matches;
  const canDraw = () => visible && !document.hidden && Boolean(desktopVisibility?.isVisible());
  const shouldAnimate = () => moving() && canDraw() && !contextLost && !disposed;
  controller?.setPhase(settings.phase);
  controller?.setMotion(moving());
  const diagnostics = (): BuddyRendererDiagnostics => ({
    asset,
    clips: gltf.animations.map((clip) => clip.name),
    assetIssues: issues,
    vertices,
    triangles,
    frames,
    intervalP95: percentile(intervals, 0.95),
    intervalMax: intervals.length ? Math.max(...intervals) : 0,
    missedBudgets: intervals.filter((interval) => interval > 18).length,
    renderP95: percentile(renderCosts, 0.95),
    drawCalls: renderer.info.render.calls,
    resolution: `${canvas.width} × ${canvas.height}`,
    startup: {
      assetBytes: loaded.assetBytes,
      fetchMs: loaded.fetchMs,
      parseMs: loaded.parseMs,
      gpuSetupMs,
      firstRenderMs,
    },
    memory: {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      geometryAttributeBytes: [...attributeArrays].reduce(
        (bytes, array) => bytes + array.byteLength,
        0,
      ),
      environmentColorBytesEstimate: environmentMap.width * environmentMap.height * 8,
      note: 'Geometry bytes describe CPU attribute storage. Environment estimate is one RGBA16F target; neither measures total GPU allocation or driver overhead.',
    },
  });
  const draw = (now = performance.now(), dt = 0) => {
    if (disposed || !canDraw() || contextLost || renderer.getContext().isContextLost()) return;
    const t = moving() ? elapsed : 0;
    const level = moving() ? envelope.sample(settings.audio?.current, settings.phase, now, dt) : 0;
    if (!moving()) envelope.reset();
    key.intensity = keyBase + level * 0.4;
    if (asset === 'ribbon') {
      const pace = settings.phase === 'thinking' ? 0.6 : settings.phase === 'speaking' ? 0.8 : 0.25;
      mount.rotation.set(
        moving() ? Math.sin(t * 0.35) * 0.025 + pointer.y * 0.05 : 0,
        moving()
          ? Math.sin(t * pace) * (settings.phase === 'thinking' ? 0.18 : 0.065) + pointer.x * 0.07
          : 0,
        moving() ? Math.sin(t * 0.28) * 0.025 : 0,
      );
      mount.position.y = moving() ? Math.sin(t * 0.7) * 0.025 : 0;
    }
    glowColor.set(
      settings.phase === 'success'
        ? 0xa9e4b6
        : settings.phase === 'listening'
          ? 0x9fdfea
          : 0xbce7df,
    );
    for (const light of lights) {
      light.material.emissiveIntensity = light.intensity * (1 + level * 0.35);
      light.material.emissive.copy(light.color).lerp(glowColor, 0.2);
    }
    const started = performance.now();
    renderer.render(scene, camera);
    renderCosts.push(performance.now() - started);
    if (renderCosts.length > 900) renderCosts.shift();
    frames += 1;
    if (!reportedReady) {
      reportedReady = true;
      if (!firstRenderMs) {
        firstRenderMs = performance.now() - initializationStarted;
        gpuSetupMs = performance.now() - gpuStarted;
      }
      onReady(true);
      onDiagnostics?.(diagnostics());
    } else if (now - lastReport > 1500) {
      lastReport = now;
      onDiagnostics?.(diagnostics());
    }
  };
  const tick = (now: number) => {
    frame = 0;
    if (!shouldAnimate()) return;
    const interval = 1000 / 60;
    const intervalElapsed = now - lastFrame;
    if (intervalElapsed >= interval - 0.5) {
      const delta = lastRenderedAt ? Math.min((now - lastRenderedAt) / 1000, 0.1) : 0;
      if (lastRenderedAt) {
        intervals.push(now - lastRenderedAt);
        if (intervals.length > 900) intervals.shift();
      }
      elapsed += delta;
      if (controller) {
        const gaze = settings.gaze ?? pointer;
        controller.setGaze(gaze.x, gaze.y);
        if (elapsed >= nextBlink) {
          controller.react('Sprout_Blink');
          nextBlink = elapsed + 4.8;
        }
        controller.update(delta);
      } else
        ribbonMixer?.update(
          delta *
            (settings.phase === 'thinking' ? 1.2 : settings.phase === 'speaking' ? 0.75 : 0.4),
        );
      // A frame accepted inside the timing tolerance starts a new interval.
      // Preserve only genuine overshoot; a below-interval remainder would retain
      // the old timestamp and alternate short/long render intervals.
      lastFrame = now - (intervalElapsed >= interval ? intervalElapsed % interval : 0);
      lastRenderedAt = now;
      draw(now, delta);
    }
    frame = requestAnimationFrame(tick);
  };
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = lastRenderedAt = 0;
    controller?.setMotion(moving());
    if (canDraw()) draw();
    if (shouldAnimate()) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    const width = Math.max(1, owner.clientWidth);
    const height = Math.max(1, owner.clientHeight);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2, 420 / Math.max(width, height)),
    );
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = -framing * aspect;
    camera.right = framing * aspect;
    camera.updateProjectionMatrix();
    refresh();
  };
  const move = (event: PointerEvent) => {
    const rect = owner.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: (0.5 - (event.clientY - rect.top) / rect.height) * 2,
    };
  };
  const leave = () => {
    pointer = { x: 0, y: 0 };
  };
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    envelope.reset();
    onReady(false);
    reportedReady = false;
  };
  const restored = () => {
    if (disposed) return;
    environmentMap.dispose();
    try {
      environmentMap = createEnvironment(renderer, asset);
    } catch {
      return;
    }
    contextLost = false;
    scene.environment = environmentMap.texture;
    refresh();
  };
  const resizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    refresh();
  });
  // Native windows retain unthrottled task/voice timers, so document.hidden can
  // remain false after hide/minimize. This read-only bridge suspends graphics.
  desktopVisibility = observeDesktopVisibility(refresh);
  resizeObserver.observe(owner);
  visibilityObserver.observe(owner);
  owner.addEventListener('pointermove', move, { passive: true });
  owner.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', refresh);
  reducedMotion.addEventListener('change', refresh);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  resize();
  return {
    update(next) {
      const previousPhase = settings.phase;
      settings = next;
      if (next.phase !== previousPhase) controller?.setPhase(next.phase);
      controller?.setMotion(moving());
      if ((next.reaction ?? 0) !== lastReaction) {
        lastReaction = next.reaction ?? 0;
        controller?.react('Sprout_Click');
      }
      if ((next.blink ?? 0) !== lastBlink) {
        lastBlink = next.blink ?? 0;
        controller?.react('Sprout_Blink');
      }
      refresh();
    },
    diagnostics,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      desktopVisibility?.dispose();
      owner.removeEventListener('pointermove', move);
      owner.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', refresh);
      reducedMotion.removeEventListener('change', refresh);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      controller?.dispose();
      ribbonMixer?.stopAllAction();
      ribbonMixer?.uncacheRoot(model);
      disposeModel(model);
      environmentMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
