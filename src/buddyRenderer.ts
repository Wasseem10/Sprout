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
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoBlending,
  OrthographicCamera,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  Shape,
  ShapeGeometry,
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
import {
  auditSproutModel,
  finiteSproutGaze,
  SproutAttentionController,
  SproutMotionController,
  type SproutEyeProfile,
} from './buddyMotionController';
import { observeDesktopVisibility } from './desktopVisibility';
import {
  isSproutDaylightAsset,
  SPROUT_CURRENT_ASSET,
  SPROUT_DAYLIGHT_ASSET,
  SPROUT_SOFT_ASSET,
} from './buddyAppearance';
import {
  NO_BUDDY_BEHAVIORS,
  buddyPlaybackPhase,
  SPROUT_BEHAVIOR_CLIPS,
  type BuddyBehaviorInput,
  type BuddyBehaviorSnapshot,
} from './buddyBehavior';

export type BuddyAsset = 'sprout' | 'ribbon';
export type BuddyReflectionProfile = 'rectangular' | 'tapered' | 'daylight' | 'soft';
export type BuddyToneMapping = 'agx' | 'neutral';
export type BuddyRendererSettings = {
  phase: BuddyVisualState;
  motion: boolean;
  audio?: AudioPresentationRef;
  reaction?: number;
  blink?: number;
  gaze?: { x: number; y: number } | null;
  /** Creation-only owned local GLB; shared adapters recreate the renderer on change. */
  assetUrl?: string;
  /** Creation-only controlled reflection study; defaults to the delivered cards. */
  reflectionProfile?: BuddyReflectionProfile;
  /** Creation-only built-in output study; no shader or material overrides. */
  toneMapping?: BuddyToneMapping;
  behavior?: BuddyBehaviorInput;
  /** Discrete state/capability/lifecycle changes, never a per-frame React callback. */
  onBehaviorChange?: (snapshot: BuddyBehaviorSnapshot) => void;
  /** Creation-only measured stage envelope; integration owns corresponding native layout. */
  stageFraming?: number;
  stageTargetY?: number;
};
export type BuddyRendererDiagnostics = {
  asset: BuddyAsset;
  assetUrl: string;
  reflectionProfile: BuddyReflectionProfile;
  toneMapping: BuddyToneMapping;
  clips: string[];
  eyeProfile: SproutEyeProfile | null;
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
  attention: ReturnType<SproutAttentionController['snapshot']> | null;
  behavior: BuddyBehaviorSnapshot;
  stage: { framing: number; targetY: number };
  materials: {
    name: string;
    type: string;
    opacity: number;
    roughness: number;
    metalness: number;
    transmission: number;
    thickness: number;
    ior: number;
    attenuationDistance: number | null;
    attenuationColor: string;
    clearcoat: number;
    emissiveColor: string;
    emissiveIntensity: number;
    baseColorMap: { colorSpace: string; width: number; height: number } | null;
    emissiveMap: { colorSpace: string; width: number; height: number } | null;
  }[];
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
  /** Initial attachment seeds cues issued during asynchronous asset loading. */
  update: (settings: BuddyRendererSettings, initialSync?: boolean) => void;
  diagnostics: () => BuddyRendererDiagnostics;
  dispose: () => void;
};

/** Broad reflection cards reproduce the authored studio structure without postprocessing. */
function createEnvironment(
  renderer: WebGLRenderer,
  asset: BuddyAsset,
  profile: BuddyReflectionProfile,
) {
  const studio = new Scene();
  const shaped = profile === 'tapered' || profile === 'daylight' || profile === 'soft';
  const daylight = profile === 'daylight';
  studio.background =
    asset === 'sprout'
      ? new Color().setRGB(0.022, 0.031, 0.047)
      : new Color().setRGB(0.045, 0.055, 0.065);
  const lights =
    asset === 'sprout'
      ? [
          {
            position: [-3.5, 3.8, 3],
            size: [shaped ? 1.55 : 1.45, 3.4],
            color: daylight ? [0.92, 0.97, 1] : [1, 0.95, 0.9],
            intensity: daylight ? 7 : shaped ? 18 : 6,
          },
          {
            position: [3.2, 1.5, 2],
            size: shaped ? [1.1, 3.2] : [1.3, 2.2],
            color: daylight ? [0.78, 0.92, 1] : shaped ? [0.95, 1, 1] : [0.75, 0.92, 1],
            intensity: daylight ? 6 : shaped ? 18 : 0.8,
          },
          {
            position: [1.2, 3, -2],
            size: [2.8, 0.9],
            color: [0.84, 1, 0.95],
            intensity: daylight ? 6 : shaped ? 16 : 6.4,
          },
          ...(shaped
            ? [
                // Fixed broad curved strips: highlights flow with the body,
                // rather than moving the environment toward the pointer.
                {
                  position: [-0.3, 2.4, 3.4],
                  size: [4.3, 0.85],
                  color: daylight ? [0.88, 0.95, 1] : [0.95, 1, 1],
                  intensity: daylight ? 8 : 20,
                },
              ]
            : []),
        ]
      : [
          { position: [-3.2, 3.2, 3.4], size: [2.4, 4], color: [1, 0.95, 0.9], intensity: 6 },
          { position: [3, 0.4, 2.5], size: [2.4, 2], color: [0.75, 0.92, 1], intensity: 2 },
          { position: [1.7, 2.5, -2.8], size: [1, 3.2], color: [0.84, 1, 0.95], intensity: 8 },
          { position: [0, -0.5, 4], size: [6, 6], color: [0.8, 0.9, 0.93], intensity: 1.3 },
        ];
  for (const light of lights) {
    const tapered = asset === 'sprout' && shaped && light.position[2] > 0;
    let geometry: PlaneGeometry | ShapeGeometry;
    if (tapered) {
      // Original rounded/tapered card profile. The fixed environment turns
      // its curved edge into a flowing highlight as the character rotates.
      const shape = new Shape();
      shape.moveTo(-0.12, -0.5);
      shape.bezierCurveTo(-0.4, -0.44, -0.5, -0.15, -0.32, 0.08);
      shape.bezierCurveTo(-0.12, 0.3, -0.1, 0.43, 0, 0.5);
      shape.bezierCurveTo(0.16, 0.56, 0.34, 0.43, 0.28, 0.29);
      shape.bezierCurveTo(0.22, 0.15, 0.36, -0.1, 0.4, -0.32);
      shape.bezierCurveTo(0.42, -0.46, 0.12, -0.55, -0.12, -0.5);
      geometry = new ShapeGeometry(shape, 16);
      geometry.scale(light.size[0], light.size[1], 1);
    } else geometry = new PlaneGeometry(light.size[0], light.size[1]);
    const panel = new Mesh(
      geometry,
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

async function loadModel(
  signal?: AbortSignal,
  candidateUrl?: string,
): Promise<{
  gltf: GLTF;
  asset: BuddyAsset;
  assetUrl: string;
  issues: string[];
  assetBytes: number;
  fetchMs: number;
  parseMs: number;
} | null> {
  const issues: string[] = [];
  const candidates: [string, BuddyAsset][] = [
    ['/buddy/sprout-v005.glb', 'sprout'],
    ['/buddy/sprout-v004.glb', 'sprout'],
    ['/buddy/sprout-v003.glb', 'sprout'],
    ['/buddy/sprout-v002.glb', 'sprout'],
    ['/buddy/insight-core-v1.glb', 'ribbon'],
  ];
  // Studies may load owned local models, never an arbitrary remote source.
  if (candidateUrl && /^\/buddy\/[a-z0-9][a-z0-9_.-]*\.glb$/i.test(candidateUrl)) {
    if (candidateUrl === SPROUT_SOFT_ASSET)
      candidates.unshift([SPROUT_CURRENT_ASSET, 'sprout'], [SPROUT_DAYLIGHT_ASSET, 'sprout']);
    if (candidateUrl === SPROUT_CURRENT_ASSET)
      candidates.unshift([SPROUT_DAYLIGHT_ASSET, 'sprout']);
    if (candidateUrl !== candidates[0][0]) candidates.unshift([candidateUrl, 'sprout']);
  }
  for (const [path, asset] of candidates) {
    if (signal?.aborted) return null;
    let gltf: GLTF;
    let assetBytes = 0;
    let fetchMs = 0;
    let parseMs = 0;
    try {
      const fetchStarted = performance.now();
      const response = await fetch(path, { signal });
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
    return { gltf, asset, assetUrl: path, issues, assetBytes, fetchMs, parseMs };
  }
  return null;
}

const percentile = (values: number[], fraction: number) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : 0;
const describeTexture = (texture: Texture | null) => {
  if (!texture) return null;
  const image = texture.image as { width?: number; height?: number } | undefined;
  return { colorSpace: texture.colorSpace, width: image?.width ?? 0, height: image?.height ?? 0 };
};

/** Layout coordinates ignore the visual-plane perspective; the fixed surface supplies viewport origin. */
export function neutralAvatarRect(owner: HTMLElement, surface: HTMLElement | null) {
  if (!surface) return owner.getBoundingClientRect();
  const layoutPoint = (element: HTMLElement) => {
    let left = 0;
    let top = 0;
    for (
      let node: HTMLElement | null = element;
      node;
      node = node.offsetParent as HTMLElement | null
    ) {
      left += node.offsetLeft;
      top += node.offsetTop;
      const parent = node.offsetParent as HTMLElement | null;
      if (parent) {
        left += parent.clientLeft;
        top += parent.clientTop;
      }
    }
    return { left, top };
  };
  const avatar = layoutPoint(owner);
  const fixed = layoutPoint(surface);
  let scrollLeft = surface.scrollLeft;
  let scrollTop = surface.scrollTop;
  for (let node = owner.parentElement; node && node !== surface; node = node.parentElement) {
    scrollLeft += node.scrollLeft;
    scrollTop += node.scrollTop;
  }
  const viewport = surface.getBoundingClientRect();
  return {
    left: viewport.left + avatar.left - fixed.left - scrollLeft,
    top: viewport.top + avatar.top - fixed.top - scrollTop,
    width: owner.offsetWidth,
    height: owner.offsetHeight,
  };
}

/** Evaluated posed geometry keeps the sleeping emitter attached to either authored eye profile. */
export function sproutSleepHeadAnchor(
  model: Group,
  camera: OrthographicCamera,
  eyeProfile: SproutEyeProfile,
): BuddyBehaviorSnapshot['headAnchor'] {
  model.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const bounds = new Box3();
  const partBounds = new Box3();
  for (const name of eyeProfile === 'happy-eyes-v005' ? ['EYE_L', 'EYE_R'] : ['LID_L', 'LID_R']) {
    const part = model.getObjectByName(name);
    if (part) bounds.union(partBounds.setFromObject(part, true));
  }
  if (bounds.isEmpty()) return null;
  const head = bounds.getCenter(new Vector3());
  head.y = bounds.max.y + 0.05;
  head.project(camera);
  return Number.isFinite(head.x) && Number.isFinite(head.y)
    ? { x: (head.x + 1) / 2, y: (1 - head.y) / 2 }
    : null;
}

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
  const loaded = await loadModel(signal, initial.assetUrl);
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
  const toneMapping = initial.toneMapping ?? (asset === 'sprout' ? 'neutral' : 'agx');
  renderer.toneMapping = toneMapping === 'neutral' ? NeutralToneMapping : AgXToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new Scene();
  const reflectionProfile =
    initial.reflectionProfile ??
    (loaded.assetUrl === SPROUT_SOFT_ASSET
      ? 'soft'
      : isSproutDaylightAsset(loaded.assetUrl)
        ? 'daylight'
        : asset === 'sprout'
          ? 'tapered'
          : 'rectangular');
  let environmentMap: ReturnType<typeof createEnvironment>;
  try {
    environmentMap = createEnvironment(renderer, asset, reflectionProfile);
  } catch {
    disposeModel(model);
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 1;
  const extendedStage =
    asset === 'sprout' &&
    SPROUT_BEHAVIOR_CLIPS.every((name) => gltf.animations.some((clip) => clip.name === name));
  const framing =
    Number.isFinite(initial.stageFraming) && initial.stageFraming! > 0
      ? initial.stageFraming!
      : asset === 'sprout'
        ? extendedStage
          ? 1.72
          : 1.4
        : 1.38;
  const camera = new OrthographicCamera(-framing, framing, framing, -framing, 0.1, 30);
  camera.position.set(
    asset === 'sprout' ? 0.1 : 0.35,
    asset === 'sprout' ? 0.24 : 0.75,
    asset === 'sprout' ? 6 : 5.8,
  );
  const targetY = Number.isFinite(initial.stageTargetY)
    ? initial.stageTargetY!
    : asset === 'sprout'
      ? extendedStage
        ? 0.24
        : 0.08
      : 0;
  camera.lookAt(0, targetY, 0);
  // The face sits on the outside of the glass. Three's transmission buffer captures
  // opaque meshes, so including the eyes creates a displaced black copy in the shell
  // whenever it turns. Render the face in the post-transmission queue at full opacity.
  // Keep normal depth testing/writing: this is a surface, not an always-visible overlay.
  if (asset === 'sprout') {
    const faceMaterials = new Map<Material, Material>();
    const faceMaterial = (source: Material) => {
      let material = faceMaterials.get(source);
      if (!material) {
        material = source.clone();
        material.transparent = true;
        material.blending = NoBlending;
        material.forceSinglePass = true;
        faceMaterials.set(source, material);
      }
      return material;
    };
    model.getObjectByName('FACE_ANCHOR')?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(faceMaterial)
        : faceMaterial(object.material);
    });
  }
  const daylight = asset === 'sprout' && reflectionProfile === 'daylight';
  const soft = asset === 'sprout' && reflectionProfile === 'soft';
  // The transparent WebGL canvas refracts differently from the authored Cycles studio.
  // Keep the soft variant's lavender/teal silhouette instead of a white compositing halo.
  // This is per-instance shading; existing models, clips, eyes, and lighting stay intact.
  if (soft)
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof MeshPhysicalMaterial && material.transmission > 0) {
          material.premultipliedAlpha = true;
          material.onBeforeCompile = (shader) => {
            // Bind-pose coordinates keep the teal buds/feet attached through morphs and poses.
            shader.vertexShader =
              'varying float sproutExtremity;\n' +
              shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
            #include <begin_vertex>
            sproutExtremity = smoothstep(0.70, 0.92, abs(position.y));
          `,
              );
            shader.fragmentShader = 'varying float sproutExtremity;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader
              .replace(
                '#include <transmission_fragment>',
                `
            #include <transmission_fragment>
            #ifdef USE_TRANSMISSION
              float sproutEdge = smoothstep(0.16, 0.62, 1.0 - saturate(dot(normal, geometryViewDir)));
              float sproutUncovered = 1.0 - transmitted.a;
              material.transmissionAlpha = mix(material.transmissionAlpha, 1.0, saturate(sproutEdge + sproutUncovered + sproutExtremity));
            #endif
          `,
              )
              .replace(
                '#include <opaque_fragment>',
                `
            #ifdef USE_TRANSMISSION
              outgoingLight = mix(outgoingLight, diffuseColor.rgb * 0.16 + outgoingLight * 0.2, sproutUncovered * 0.8);
              outgoingLight = mix(outgoingLight, outgoingLight * 0.4 + vec3(0.01, 0.13, 0.23), sproutExtremity * 0.8);
              vec3 sproutRimPigment = mix(vec3(0.15, 0.21, 0.88), vec3(0.02, 0.20, 0.32), sproutExtremity);
              outgoingLight = mix(outgoingLight, sproutRimPigment, sproutEdge * 0.8);
            #endif
            #include <opaque_fragment>
          `,
              );
          };
          material.customProgramCacheKey = () => 'sprout-soft-shell-v008';
        }
      }
    });
  const keyBase = daylight ? 1.4 : asset === 'sprout' ? 1.7 : 2.3;
  const key = new DirectionalLight(0xf1faff, keyBase);
  if (asset === 'sprout') key.position.set(-3.5, 3.8, 3);
  else key.position.set(-3, 4, 5);
  const rim = new DirectionalLight(0xa7ddd7, daylight ? 0.5 : asset === 'sprout' ? 0.7 : 1.7);
  if (asset === 'sprout') rim.position.set(1.2, 3, -2);
  else rim.position.set(3, -1, -3);
  scene.add(key, rim, new HemisphereLight(0xe4f6f3, 0x131b24, asset === 'sprout' ? 0.4 : 0.8));
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  if (asset === 'ribbon') model.position.sub(bounds.getCenter(new Vector3()));
  const mount = new Group();
  mount.name = 'RUNTIME_ATTENTION_MOUNT';
  mount.add(model);
  if (asset === 'ribbon') mount.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 0.001));
  scene.add(mount);
  const controller =
    asset === 'sprout' ? new SproutMotionController(model, gltf.animations, size.y * 0.02) : null;
  const attention = controller ? new SproutAttentionController(mount) : null;
  const ribbonMixer = controller ? null : new AnimationMixer(model);
  if (ribbonMixer) for (const clip of gltf.animations) ribbonMixer.clipAction(clip).play();
  const lights: { material: MeshStandardMaterial; intensity: number; color: Color }[] = [];
  const materials = new Set<MeshStandardMaterial>();
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
      if (material instanceof MeshStandardMaterial) materials.add(material);
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
  let attentionFocused = true;
  const attentionRegion = owner.closest<HTMLElement>('.buddy, .studio-preview') ?? owner;
  const attentionSurface = owner.closest<HTMLElement>('.buddy');
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
  const presentationPhase = () => buddyPlaybackPhase(settings.phase, settings.audio?.current);
  const syncController = (now = performance.now(), initialSync = false) => {
    const audio = settings.audio?.current;
    const intent = settings.behavior;
    const liveOutput =
      settings.phase === 'speaking' && audio?.source === 'voice' && audio.outputPlaying;
    controller?.setBehavior(
      intent?.automatic && liveOutput && !intent.automatic.interrupt
        ? { ...intent, automatic: { ...intent.automatic, interrupt: true } }
        : intent,
      now,
      initialSync,
    );
    controller?.setPhase(presentationPhase());
  };
  controller?.setMotion(moving());
  syncController();
  let lastBehaviorKey = '';
  const behaviorSnapshot = (): BuddyBehaviorSnapshot => {
    const state = controller?.behaviorSnapshot();
    let headAnchor: BuddyBehaviorSnapshot['headAnchor'] = null;
    if (state?.mode === 'sleep' && controller)
      headAnchor = sproutSleepHeadAnchor(model, camera, controller.eyeProfile);
    return {
      mode: state?.mode ?? 'normal',
      sleeping: state?.sleeping ?? false,
      moving: moving(),
      visible: canDraw() && !contextLost && !disposed,
      capabilities: state?.capabilities ?? { ...NO_BUDDY_BEHAVIORS },
      doneActive: state?.doneActive ?? false,
      headAnchor,
      revision: state?.revision ?? 0,
    };
  };
  const notifyBehavior = () => {
    const state = controller?.behaviorSnapshot();
    const key = `${state?.mode ?? 'normal'}:${state?.sleeping ?? false}:${moving()}:${canDraw() && !contextLost && !disposed}:${state?.doneActive ?? false}`;
    if (key === lastBehaviorKey) return;
    lastBehaviorKey = key;
    try {
      settings.onBehaviorChange?.(behaviorSnapshot());
    } catch {
      if (!issues.includes('Behavior observer failed')) issues.push('Behavior observer failed');
    }
  };
  const diagnostics = (): BuddyRendererDiagnostics => ({
    asset,
    assetUrl: loaded.assetUrl,
    reflectionProfile,
    toneMapping,
    clips: gltf.animations.map((clip) => clip.name),
    eyeProfile: controller?.eyeProfile ?? null,
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
    attention: attention?.snapshot() ?? null,
    behavior: behaviorSnapshot(),
    stage: { framing, targetY },
    materials: [...materials].map((material) => {
      const physical = material instanceof MeshPhysicalMaterial ? material : null;
      return {
        name: material.name,
        type: material.type,
        opacity: material.opacity,
        roughness: material.roughness,
        metalness: material.metalness,
        transmission: physical?.transmission ?? 0,
        thickness: physical?.thickness ?? 0,
        ior: physical?.ior ?? 1.5,
        attenuationDistance: Number.isFinite(physical?.attenuationDistance)
          ? physical!.attenuationDistance
          : null,
        attenuationColor: physical?.attenuationColor.getHexString() ?? 'ffffff',
        clearcoat: physical?.clearcoat ?? 0,
        emissiveColor: material.emissive.getHexString(),
        emissiveIntensity: material.emissiveIntensity,
        baseColorMap: describeTexture(material.map),
        emissiveMap: describeTexture(material.emissiveMap),
      };
    }),
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
    const phase = presentationPhase();
    const level = moving() ? envelope.sample(settings.audio?.current, phase, now, dt) : 0;
    if (!moving()) envelope.reset();
    key.intensity = keyBase + level * 0.4;
    if (asset === 'ribbon') {
      const pace = phase === 'thinking' ? 0.6 : phase === 'speaking' ? 0.8 : 0.25;
      mount.rotation.set(
        moving() ? Math.sin(t * 0.35) * 0.025 + pointer.y * 0.05 : 0,
        moving()
          ? Math.sin(t * pace) * (phase === 'thinking' ? 0.18 : 0.065) + pointer.x * 0.07
          : 0,
        moving() ? Math.sin(t * 0.28) * 0.025 : 0,
      );
      mount.position.y = moving() ? Math.sin(t * 0.7) * 0.025 : 0;
    }
    glowColor.set(phase === 'success' ? 0xa9e4b6 : phase === 'listening' ? 0x9fdfea : 0xbce7df);
    for (const light of lights) {
      light.material.emissiveIntensity = light.intensity * (1 + level * 0.35);
      // The inset core's authored blue remains blue. Phase truth stays in
      // HTML; fresh audio may gently modulate intensity without recoloring it.
      light.material.emissive.copy(light.color);
      if (asset === 'ribbon') light.material.emissive.lerp(glowColor, 0.2);
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
        syncController(now);
        const gaze =
          attentionFocused && controller.allowsAttention()
            ? (settings.gaze ?? pointer)
            : { x: 0, y: 0 };
        attention?.setTarget(gaze.x, gaze.y);
        controller.setAttentionCompression(attention?.update(delta) ?? 0);
        controller.setGaze(gaze.x, gaze.y);
        if (elapsed >= nextBlink && controller.allowsBlink()) {
          controller.react('Sprout_Blink');
          nextBlink = elapsed + 4.8;
        }
        controller.update(delta, now);
        notifyBehavior();
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
    controller?.setVisible(canDraw() && !contextLost);
    controller?.setMotion(moving());
    syncController();
    controller?.update(0);
    if (!moving() || !canDraw()) {
      pointer = { x: 0, y: 0 };
      attention?.reset();
      controller?.resetGaze();
      controller?.setAttentionCompression(0);
    }
    if (canDraw()) draw();
    notifyBehavior();
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
    // The panel's visual plane leans around a fixed layout slot. Its perspective
    // must never feed back into gaze or move the neutral avatar-centred basis.
    const rect = neutralAvatarRect(owner, attentionSurface);
    attentionFocused = true;
    pointer =
      rect.width > 0 && rect.height > 0
        ? finiteSproutGaze(
            ((event.clientX - rect.left) / rect.width - 0.5) * 2,
            (0.5 - (event.clientY - rect.top) / rect.height) * 2,
          )
        : { x: 0, y: 0 };
  };
  const leave = () => {
    pointer = { x: 0, y: 0 };
  };
  const blur = () => {
    attentionFocused = false;
    leave();
  };
  const focus = () => {
    attentionFocused = true;
  };
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    controller?.setVisible(false);
    cancelAnimationFrame(frame);
    frame = 0;
    envelope.reset();
    attention?.reset();
    controller?.resetGaze();
    controller?.setAttentionCompression(0);
    onReady(false);
    reportedReady = false;
    notifyBehavior();
  };
  const restored = () => {
    if (disposed) return;
    environmentMap.dispose();
    try {
      environmentMap = createEnvironment(renderer, asset, reflectionProfile);
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
  attentionRegion.addEventListener('pointermove', move, { passive: true });
  attentionRegion.addEventListener('pointerleave', leave);
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', refresh);
  reducedMotion.addEventListener('change', refresh);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  resize();
  return {
    update(next, initialSync = false) {
      settings = next;
      controller?.setMotion(moving());
      syncController(performance.now(), initialSync);
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
      controller?.setVisible(false);
      notifyBehavior();
      onReady(false);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      desktopVisibility?.dispose();
      attentionRegion.removeEventListener('pointermove', move);
      attentionRegion.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
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
