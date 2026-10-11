import {
  AgXToneMapping,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { BuddyVisualState } from './AssistantSignal';

export type BuddyRenderer = {
  update: (phase: BuddyVisualState, motion: boolean) => void;
  dispose: () => void;
};

/** Blender study's three softboxes, plus a broad front card for tiny-size readability. */
function createEnvironment(renderer: WebGLRenderer) {
  const studio = new Scene();
  studio.background = new Color().setRGB(0.045, 0.055, 0.065);
  const lights = [
    { position: [-3.2, 3.2, 3.4], size: [2.4, 4], color: [1, 0.93, 0.81], intensity: 6 },
    { position: [3, 0.4, 2.5], size: [2.4, 2], color: [0.75, 0.92, 1], intensity: 2 },
    { position: [1.7, 2.5, -2.8], size: [1, 3.2], color: [0.84, 1, 0.95], intensity: 8 },
    { position: [0, -0.5, 4], size: [6, 6], color: [0.8, 0.9, 0.93], intensity: 1.3 },
  ];
  for (const light of lights) {
    const material = new MeshBasicMaterial({
      color: new Color()
        .setRGB(light.color[0], light.color[1], light.color[2])
        .multiplyScalar(light.intensity),
    });
    const panel = new Mesh(new PlaneGeometry(light.size[0], light.size[1]), material);
    panel.position.set(light.position[0], light.position[1], light.position[2]);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }
  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0.025, 0.1, 100, { size: 128 });
  } finally {
    for (const child of studio.children) {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }
    generator.dispose();
  }
}

function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  const materials = new Set<MeshStandardMaterial>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap)
      texture.image.close();
  }
  for (const material of materials) material.dispose();
}

/** The Blender mesh is the browser silhouette, with local PBR studio lighting. */
export async function createBuddyRenderer(
  canvas: HTMLCanvasElement,
  settings: { phase: BuddyVisualState; motion: boolean },
  onReady: (ready: boolean) => void,
  signal?: AbortSignal,
): Promise<BuddyRenderer | null> {
  const owner = canvas.parentElement;
  // Complete loading before allocating a GPU context, including Strict Mode / HMR cancellation.
  let gltf;
  try {
    const response = await fetch('/buddy/insight-core-v1.glb', { signal });
    if (!response.ok) return null;
    gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/buddy/');
  } catch {
    return null;
  }
  const model = gltf.scene;
  if (!owner || !canvas.isConnected || signal?.aborted) {
    disposeModel(model);
    return null;
  }
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
    environmentMap = createEnvironment(renderer);
  } catch {
    disposeModel(model);
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 1;
  const camera = new OrthographicCamera(-1.38, 1.38, 1.38, -1.38, 0.1, 30);
  camera.position.set(0.35, 0.75, 5.8);
  camera.lookAt(0, 0, 0);
  const key = new DirectionalLight(0xf1fff6, 2.3);
  key.position.set(-3, 4, 5);
  const rim = new DirectionalLight(0xa7ddd7, 1.7);
  rim.position.set(3, -1, -3);
  scene.add(key, rim, new HemisphereLight(0xe4f6f3, 0x131b24, 0.8));
  const mixer = new AnimationMixer(model);
  for (const clip of gltf.animations) mixer.clipAction(clip).play();
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  model.position.sub(bounds.getCenter(new Vector3()));
  const mount = new Group();
  mount.add(model);
  mount.scale.setScalar(2 / Math.max(size.x, size.y, size.z));
  scene.add(mount);
  const lights: { material: MeshStandardMaterial; intensity: number; color: Color }[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (
        material instanceof MeshStandardMaterial &&
        material.emissiveIntensity > 0 &&
        material.emissive.getHex() !== 0
      ) {
        lights.push({
          material,
          intensity: material.emissiveIntensity,
          color: material.emissive.clone(),
        });
      }
    }
  });
  let phase = settings.phase;
  let motion = settings.motion;
  let disposed = false;
  let visible = true;
  let contextLost = false;
  let frame = 0;
  let lastFrame = 0;
  let lastRenderedAt = 0;
  let elapsed = 0;
  let pointerX = 0;
  let pointerY = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const glowColor = new Color();
  let reportedReady = false;
  const shouldAnimate = () =>
    motion && !reducedMotion.matches && visible && !document.hidden && !contextLost && !disposed;
  const draw = () => {
    if (disposed || contextLost || renderer.getContext().isContextLost()) return;
    const moving = motion && !reducedMotion.matches;
    const t = moving ? elapsed : 0;
    const pace = phase === 'thinking' ? 0.6 : phase === 'speaking' ? 0.8 : 0.25;
    mount.rotation.set(
      moving ? Math.sin(t * 0.35) * 0.025 + pointerY * 0.1 : 0,
      moving ? Math.sin(t * pace) * (phase === 'thinking' ? 0.18 : 0.065) + pointerX * 0.14 : 0,
      moving ? Math.sin(t * 0.28) * 0.025 : 0,
    );
    mount.position.y = moving ? Math.sin(t * 0.7) * 0.025 : 0;
    const pulse =
      phase === 'speaking'
        ? 1 + Math.sin(t * 5.4) * 0.22 + Math.sin(t * 8.1) * 0.08
        : phase === 'listening'
          ? 1.2 + Math.sin(t * 2) * 0.14
          : phase === 'thinking'
            ? 1.12
            : 1;
    glowColor.set(phase === 'success' ? 0xa9e4b6 : phase === 'listening' ? 0x9fdfea : 0xbce7df);
    for (const light of lights) {
      light.material.emissiveIntensity = light.intensity * pulse;
      light.material.emissive.copy(light.color).lerp(glowColor, 0.2);
    }
    renderer.render(scene, camera);
    if (!reportedReady) {
      reportedReady = true;
      onReady(true);
    }
  };
  const tick = (now: number) => {
    frame = 0;
    if (!shouldAnimate()) return;
    const interval = phase === 'idle' || owner.clientWidth < 70 ? 1000 / 15 : 1000 / 30;
    const intervalElapsed = now - lastFrame;
    if (intervalElapsed >= interval) {
      const delta = lastRenderedAt ? Math.min((now - lastRenderedAt) / 1000, 0.1) : 0;
      elapsed += delta;
      mixer.update(delta * (phase === 'thinking' ? 1.2 : phase === 'speaking' ? 0.75 : 0.4));
      lastFrame = now - (intervalElapsed % interval);
      lastRenderedAt = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  };
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    lastRenderedAt = 0;
    if (visible && !document.hidden) draw();
    if (shouldAnimate()) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    const width = Math.max(1, owner.clientWidth);
    const height = Math.max(1, owner.clientHeight);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75, 420 / Math.max(width, height)),
    );
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = -1.38 * aspect;
    camera.right = 1.38 * aspect;
    camera.updateProjectionMatrix();
    refresh();
  };
  const move = (event: PointerEvent) => {
    const rect = owner.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width - 0.5;
    pointerY = (event.clientY - rect.top) / rect.height - 0.5;
  };
  const leave = () => {
    pointerX = 0;
    pointerY = 0;
  };
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    onReady(false);
    reportedReady = false;
  };
  const restored = () => {
    environmentMap.dispose();
    try {
      environmentMap = createEnvironment(renderer);
    } catch {
      // Keep the authored fallback if the recovered device cannot rebuild the environment.
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
    update(nextPhase, nextMotion) {
      phase = nextPhase;
      motion = nextMotion;
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      owner.removeEventListener('pointermove', move);
      owner.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', refresh);
      reducedMotion.removeEventListener('change', refresh);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      disposeModel(model);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      environmentMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
