import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import {
  flowchartPaths,
  validateFlowchart,
  type Flowchart,
  type FlowNode,
} from '../../shared/presentation-flowchart.js';
import type {
  PresentationScene,
  PresentationSceneConnector,
  PresentationSceneElement,
  PresentationSceneShape,
  PresentationSceneText,
  SceneBounds,
  ScenePoint,
} from '../../shared/presentation-scene.js';

/** Pure graph validation/layout; it never mutates a deck or native window. */
export class FlowchartLayoutError extends Error {
  readonly code = 'layout_capacity';
  constructor(message: string) {
    super(message);
    this.name = 'FlowchartLayoutError';
  }
}
const geometry = {
  width: 40 / 3,
  height: 7.5,
  title: { x: 0.65, y: 0.5, width: 12.033, height: 1 },
  body: { x: 0.65, y: 1.7, width: 12.033, height: 5 },
  footerTop: 7.08,
};
const epsilon = 0.00001;
const palettes = {
  blue: {
    background: 'F5F8FD',
    text: '152744',
    fill: 'E5EEFB',
    accent: '2563EB',
    decision: 'DBEAFE',
    connector: '4A6484',
  },
  light: {
    background: 'FFFFFF',
    text: '172B45',
    fill: 'F1F5F9',
    accent: '245BC4',
    decision: 'E8EFFC',
    connector: '4B607B',
  },
  dark: {
    background: '111C32',
    text: 'F4F7FF',
    fill: '213554',
    accent: '83B8FF',
    decision: '294770',
    connector: 'A2BCDF',
  },
};
const context = createCanvas(16, 16).getContext('2d');
function fail(message: string): never {
  throw new FlowchartLayoutError(
    `${message} The diagram is unchanged; use shorter labels or fewer steps without reducing the font size.`,
  );
}
const right = (bounds: SceneBounds) => bounds.x + bounds.width;
const bottom = (bounds: SceneBounds) => bounds.y + bounds.height;
const centerX = (bounds: SceneBounds) => bounds.x + bounds.width / 2;
const centerY = (bounds: SceneBounds) => bounds.y + bounds.height / 2;
const contains = (outer: SceneBounds, inner: SceneBounds) =>
  inner.x >= outer.x - epsilon &&
  inner.y >= outer.y - epsilon &&
  right(inner) <= right(outer) + epsilon &&
  bottom(inner) <= bottom(outer) + epsilon;
const overlaps = (a: SceneBounds, b: SceneBounds, pad = 0) =>
  a.x < right(b) + pad - epsilon &&
  right(a) > b.x - pad + epsilon &&
  a.y < bottom(b) + pad - epsilon &&
  bottom(a) > b.y - pad + epsilon;

function measured(text: string, width: number, fontPt: number, bold: boolean) {
  context.font = `${bold ? 'bold ' : ''}${(fontPt * 96) / 72}px Arial`;
  const lines: { text: string; width: number }[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (context.measureText(word).width / 96 > width + epsilon)
        fail('A diagram label contains a word wider than its text box.');
      const next = current ? `${current} ${word}` : word;
      if (current && context.measureText(next).width / 96 > width) {
        lines.push({ text: current, width: context.measureText(current).width / 96 });
        current = word;
      } else current = next;
    }
    lines.push({ text: current, width: context.measureText(current).width / 96 });
  }
  const lineHeight = (fontPt / 72) * 1.2;
  return { lines, lineHeight, height: lines.length * lineHeight };
}
type SizedNode = {
  node: FlowNode;
  width: number;
  height: number;
  labelWidth: number;
  label: ReturnType<typeof measured>;
};
function sizeNode(node: FlowNode, fontPt: number): SizedNode {
  const decision = node.kind === 'decision';
  const width = decision ? 4.8 : 3.8;
  const labelWidth = decision ? 2.3 : 3.44;
  const label = measured(node.label, labelWidth, fontPt, decision);
  // A diamond's inner rectangle must satisfy half-width + half-height normalized to its axes <=1.
  const height = decision
    ? Math.max(0.9, label.height / (1 - labelWidth / width) + 0.08)
    : Math.max(0.48, label.height + 0.18);
  return { node, width, height, labelWidth, label };
}
type Segment = { a: ScenePoint; b: ScenePoint };
function segments(connector: PresentationSceneConnector): Segment[] {
  return connector.points.slice(1).map((point, i) => ({ a: connector.points[i], b: point }));
}
function segmentCrossesBounds({ a, b }: Segment, bounds: SceneBounds): boolean {
  if (Math.abs(a.x - b.x) < epsilon)
    return (
      a.x > bounds.x + epsilon &&
      a.x < right(bounds) - epsilon &&
      Math.max(a.y, b.y) > bounds.y + epsilon &&
      Math.min(a.y, b.y) < bottom(bounds) - epsilon
    );
  return (
    a.y > bounds.y + epsilon &&
    a.y < bottom(bounds) - epsilon &&
    Math.max(a.x, b.x) > bounds.x + epsilon &&
    Math.min(a.x, b.x) < right(bounds) - epsilon
  );
}
function segmentsMeet(a: Segment, b: Segment): boolean {
  const verticalA = Math.abs(a.a.x - a.b.x) < epsilon,
    verticalB = Math.abs(b.a.x - b.b.x) < epsilon;
  const between = (value: number, one: number, two: number) =>
    value >= Math.min(one, two) - epsilon && value <= Math.max(one, two) + epsilon;
  if (verticalA && verticalB)
    return (
      Math.abs(a.a.x - b.a.x) < epsilon &&
      Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) <=
        Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) + epsilon
    );
  if (!verticalA && !verticalB)
    return (
      Math.abs(a.a.y - b.a.y) < epsilon &&
      Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) <=
        Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) + epsilon
    );
  const v = verticalA ? a : b,
    h = verticalA ? b : a;
  return between(v.a.x, h.a.x, h.b.x) && between(h.a.y, v.a.y, v.b.y);
}

/** A second invariant pass also lets exporters verify a persisted scene before using it. */
export function assertFlowchartScene(scene: PresentationScene): void {
  if (!GlobalFonts.has('Arial')) fail('Arial font metrics are unavailable.');
  const shapes = scene.elements.filter(
    (item): item is PresentationSceneShape => item.kind === 'shape',
  );
  const texts = scene.elements.filter(
    (item): item is PresentationSceneText => item.kind === 'text',
  );
  const connectors = scene.elements.filter(
    (item): item is PresentationSceneConnector => item.kind === 'connector',
  );
  if (new Set(scene.elements.map((item) => item.id)).size !== scene.elements.length)
    fail('Scene object IDs must be unique.');
  if (
    scene.readingOrder.length !== scene.elements.length ||
    new Set(scene.readingOrder).size !== scene.elements.length ||
    scene.readingOrder.some((id) => !scene.elements.some((item) => item.id === id))
  )
    fail('The diagram reading order must include every object exactly once.');
  for (const item of [...shapes, ...texts]) {
    if (
      ![item.bounds.x, item.bounds.y, item.bounds.width, item.bounds.height].every(
        Number.isFinite,
      ) ||
      item.bounds.width <= 0 ||
      item.bounds.height <= 0
    )
      fail('Diagram bounds must be finite and positive.');
    if (
      !contains(
        item.kind === 'text' && item.role === 'title' ? scene.titleBounds : scene.bodyBounds,
        item.bounds,
      )
    )
      fail('A diagram object is outside the reserved slide area.');
  }
  for (const [index, shape] of shapes.entries()) {
    if (shapes.slice(index + 1).some((other) => overlaps(shape.bounds, other.bounds, 0.04)))
      fail('Diagram nodes overlap.');
  }
  for (const text of texts) {
    const check = measured(text.text, text.bounds.width, text.font.sizePt, text.font.bold);
    if (
      text.font.family !== 'Arial' ||
      Math.abs(check.lineHeight - text.lineHeight) > epsilon ||
      JSON.stringify(check.lines) !== JSON.stringify(text.lines) ||
      check.height > text.bounds.height + epsilon
    )
      fail('A diagram label overflows or differs from its measured text.');
    const host = shapes.find((shape) => shape.id === text.hostShapeId);
    if (text.role === 'node-label' && (!host || !contains(host.bounds, text.bounds)))
      fail('A node label is outside its shape.');
    if (
      host?.geometry === 'diamond' &&
      text.bounds.width / host.bounds.width + text.bounds.height / host.bounds.height > 1 + epsilon
    )
      fail('A decision label crosses the diamond boundary.');
    if (shapes.some((shape) => shape !== host && overlaps(text.bounds, shape.bounds, 0.035)))
      fail('A label overlaps another node.');
  }
  for (const [index, text] of texts.entries())
    if (texts.slice(index + 1).some((other) => overlaps(text.bounds, other.bounds, 0.025)))
      fail('Diagram labels overlap.');
  for (const [index, connector] of connectors.entries()) {
    if (
      connector.points.length < 2 ||
      connector.points.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          !contains(scene.bodyBounds, { ...point, width: 0, height: 0 }),
      )
    )
      fail('A connector is outside the diagram area.');
    for (const segment of segments(connector)) {
      if (
        (Math.abs(segment.a.x - segment.b.x) > epsilon &&
          Math.abs(segment.a.y - segment.b.y) > epsilon) ||
        (Math.abs(segment.a.x - segment.b.x) < epsilon &&
          Math.abs(segment.a.y - segment.b.y) < epsilon)
      )
        fail('Connectors must use nonempty horizontal or vertical segments.');
      if (shapes.some((shape) => segmentCrossesBounds(segment, shape.bounds)))
        fail('A connector crosses a node.');
      if (
        texts.some((text) =>
          segmentCrossesBounds(segment, {
            x: text.bounds.x - 0.04,
            y: text.bounds.y - 0.04,
            width: text.bounds.width + 0.08,
            height: text.bounds.height + 0.08,
          }),
        )
      )
        fail('A connector crosses a label.');
      if (
        connectors
          .slice(index + 1)
          .some((other) => segments(other).some((candidate) => segmentsMeet(segment, candidate)))
      )
        fail('Two unrelated connectors intersect.');
    }
    const endpoint = connector.points.at(-1)!;
    const target = shapes.find((shape) => shape.sourceId === connector.toNodeId);
    const source = shapes.find((shape) => shape.sourceId === connector.fromNodeId);
    if (
      !target ||
      !source ||
      !contains(target.bounds, { ...endpoint, width: 0, height: 0 }) ||
      !contains(source.bounds, { ...connector.points[0], width: 0, height: 0 })
    )
      fail('A connector is detached from its node.');
    const previous = connector.points.at(-2)!;
    const size = connector.arrowheadSize;
    if (!Number.isFinite(size) || size <= 0 || size > 0.16)
      fail('The arrow head exceeds its reserved envelope.');
    const arrowBounds =
      Math.abs(previous.x - endpoint.x) < epsilon
        ? {
            x: endpoint.x - size / 2,
            y: endpoint.y - (previous.y < endpoint.y ? size : 0),
            width: size,
            height: size,
          }
        : {
            x: endpoint.x - (previous.x < endpoint.x ? size : 0),
            y: endpoint.y - size / 2,
            width: size,
            height: size,
          };
    if (
      !contains(scene.bodyBounds, arrowBounds) ||
      shapes.some((shape) => shape !== target && overlaps(arrowBounds, shape.bounds)) ||
      texts.some((text) => overlaps(arrowBounds, text.bounds))
    )
      fail('An arrow head overlaps another object or exceeds the slide body.');
  }
}

export function layoutFlowchart(
  input: Flowchart,
  options: {
    slideId: string;
    title: string;
    theme?: 'blue' | 'light' | 'dark';
    textScale?: number;
  },
): PresentationScene {
  const graph = validateFlowchart(input),
    paths = flowchartPaths(graph);
  if (!options.slideId.trim() || !options.title.trim())
    fail('The slide needs an identity and title.');
  const scale = options.textScale ?? 1;
  if (!Number.isFinite(scale) || scale < 0.9 || scale > 1.35)
    fail('The requested text size is outside the supported readable range.');
  if (!GlobalFonts.has('Arial'))
    fail('Arial font metrics are unavailable; a different font cannot be substituted silently.');
  const palette = palettes[options.theme ?? 'blue'];
  const nodeFont = 18 * scale,
    branchFont = 16 * scale;
  const sized = new Map(graph.nodes.map((node) => [node.id, sizeNode(node, nodeFont)]));
  const rowById = new Map<string, number>();
  paths.commonNodeIds.forEach((id, row) => rowById.set(id, row));
  const branchStart = paths.commonNodeIds.length;
  const branchRows = Math.max(...paths.branches.map((branch) => branch.exclusiveNodeIds.length));
  paths.branches.forEach((branch) =>
    branch.exclusiveNodeIds.forEach((id, row) => rowById.set(id, branchStart + row)),
  );
  paths.sharedNodeIds.forEach((id, row) => rowById.set(id, branchStart + branchRows + row));
  const rowCount = branchStart + branchRows + paths.sharedNodeIds.length;
  const heights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(
      ...[...rowById]
        .filter(([, candidate]) => candidate === row)
        .map(([id]) => sized.get(id)!.height),
    ),
  );
  const branchLabels = paths.branches.map((branch) =>
    measured(branch.label, 2.7, branchFont, true),
  );
  const gaps = heights.map((_, row) =>
    row === rowCount - 1
      ? 0
      : row === branchStart - 1
        ? Math.max(0.44, ...branchLabels.map((label) => label.height + 0.18))
        : paths.sharedNodeIds.length && row === branchStart + branchRows - 1
          ? 0.32
          : 0.2,
  );
  const total = heights.reduce((sum, height, row) => sum + height + gaps[row], 0);
  if (total > geometry.body.height + epsilon)
    fail('The measured diagram is taller than the available slide body.');
  const rowY: number[] = [];
  let y = geometry.body.y + (geometry.body.height - total) / 2;
  for (let row = 0; row < rowCount; row++) {
    rowY.push(y);
    y += heights[row] + gaps[row];
  }
  const ids = [
    ...paths.commonNodeIds,
    ...paths.branches.flatMap((branch) => branch.exclusiveNodeIds),
    ...paths.sharedNodeIds,
  ];
  const shapes = new Map<string, PresentationSceneShape>();
  const elements: PresentationSceneElement[] = [];
  const objectId = (kind: string, id: string) => `${options.slideId}:${kind}:${id}`;
  const title = measured(options.title, geometry.title.width, 30 * scale, true);
  if (title.height > geometry.title.height) fail('The diagram title is too tall.');
  elements.push({
    kind: 'text',
    id: objectId('text', 'title'),
    role: 'title',
    bounds: { ...geometry.title },
    text: options.title,
    lines: title.lines,
    lineHeight: title.lineHeight,
    font: { family: 'Arial', sizePt: 30 * scale, bold: true, color: palette.text },
    align: 'left',
    verticalAlign: 'middle',
    readingOrder: 0,
  });
  for (const id of ids) {
    const node = sized.get(id)!;
    const row = rowById.get(id)!;
    const lane = paths.branches.findIndex((branch) => branch.exclusiveNodeIds.includes(id));
    const cx = lane < 0 ? geometry.width / 2 : lane === 0 ? 2.8 : geometry.width - 2.8;
    const bounds = {
      x: cx - node.width / 2,
      y: rowY[row] + (heights[row] - node.height) / 2,
      width: node.width,
      height: node.height,
    };
    const shape: PresentationSceneShape = {
      kind: 'shape',
      id: objectId('node', id),
      sourceId: id,
      role: node.node.kind,
      geometry:
        node.node.kind === 'decision'
          ? 'diamond'
          : node.node.kind === 'process'
            ? 'rect'
            : 'roundRect',
      bounds,
      fill: node.node.kind === 'decision' ? palette.decision : palette.fill,
      stroke: palette.accent,
      strokeWidthPt: 1.5,
      labelId: objectId('label', id),
      readingOrder: elements.length,
    };
    shapes.set(id, shape);
    elements.push(shape);
    elements.push({
      kind: 'text',
      id: shape.labelId,
      sourceId: id,
      role: 'node-label',
      bounds: {
        x: cx - node.labelWidth / 2,
        y: centerY(bounds) - node.label.height / 2,
        width: node.labelWidth,
        height: node.label.height,
      },
      text: node.node.label,
      lines: node.label.lines,
      lineHeight: node.label.lineHeight,
      font: {
        family: 'Arial',
        sizePt: nodeFont,
        bold: node.node.kind === 'decision',
        color: palette.text,
      },
      align: 'center',
      verticalAlign: 'middle',
      hostShapeId: shape.id,
      readingOrder: elements.length,
    });
  }
  const decision = shapes.get(paths.decisionId)!;
  for (const edge of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = shapes.get(edge.from)!,
      target = shapes.get(edge.to)!;
    const branch = paths.branches.findIndex((candidate) => candidate.edgeId === edge.id);
    let points: ScenePoint[];
    let labelId: string | undefined;
    if (branch >= 0) {
      const left = branch === 0,
        laneX = centerX(target.bounds);
      points = [
        { x: left ? source.bounds.x : right(source.bounds), y: centerY(source.bounds) },
        { x: laneX, y: centerY(source.bounds) },
        { x: laneX, y: target.bounds.y },
      ];
      const label = branchLabels[branch];
      labelId = objectId('branch-label', edge.id);
      elements.push({
        kind: 'text',
        id: labelId,
        sourceId: edge.id,
        role: 'branch-label',
        bounds: {
          x: left ? laneX + 0.15 : laneX - 2.85,
          y: bottom(decision.bounds) + 0.09,
          width: 2.7,
          height: label.height,
        },
        text: edge.branchLabel!,
        lines: label.lines,
        lineHeight: label.lineHeight,
        font: { family: 'Arial', sizePt: branchFont, bold: true, color: palette.text },
        align: left ? 'left' : 'center',
        verticalAlign: 'middle',
        readingOrder: elements.length,
      });
    } else if (edge.to === paths.mergeNodeId) {
      const left = centerX(source.bounds) < centerX(target.bounds);
      const portX = centerX(target.bounds) + target.bounds.width * (left ? -0.2 : 0.2);
      const joinY = target.bounds.y - 0.16;
      points = [
        { x: centerX(source.bounds), y: bottom(source.bounds) },
        { x: centerX(source.bounds), y: joinY },
        { x: portX, y: joinY },
        { x: portX, y: target.bounds.y },
      ];
    } else
      points = [
        { x: centerX(source.bounds), y: bottom(source.bounds) },
        { x: centerX(target.bounds), y: target.bounds.y },
      ];
    elements.push({
      kind: 'connector',
      id: objectId('edge', edge.id),
      sourceId: edge.id,
      role: 'flow',
      fromNodeId: edge.from,
      toNodeId: edge.to,
      points,
      stroke: palette.connector,
      strokeWidthPt: 1.75,
      arrowhead: 'triangle',
      arrowheadSize: 0.1,
      ...(labelId ? { labelId } : {}),
      readingOrder: elements.length,
    });
  }
  const readingOrder: string[] = [objectId('text', 'title')];
  const appendNode = (id: string) => {
    readingOrder.push(objectId('node', id), objectId('label', id));
  };
  const appendOutgoing = (id: string) => {
    for (const edge of graph.edges
      .filter((edge) => edge.from === id)
      .sort((a, b) => a.id.localeCompare(b.id)))
      if (edge.from !== paths.decisionId) readingOrder.push(objectId('edge', edge.id));
  };
  for (const id of paths.commonNodeIds) {
    appendNode(id);
    appendOutgoing(id);
  }
  for (const branch of paths.branches) {
    readingOrder.push(objectId('branch-label', branch.edgeId), objectId('edge', branch.edgeId));
    for (const id of branch.exclusiveNodeIds) {
      appendNode(id);
      appendOutgoing(id);
    }
  }
  for (const id of paths.sharedNodeIds) {
    appendNode(id);
    appendOutgoing(id);
  }
  for (const element of elements) element.readingOrder = readingOrder.indexOf(element.id);
  const scene: PresentationScene = {
    schemaVersion: 1,
    slideId: options.slideId,
    width: geometry.width,
    height: geometry.height,
    background: palette.background,
    bodyBounds: { ...geometry.body },
    titleBounds: { ...geometry.title },
    footerTop: geometry.footerTop,
    fontPolicy: { family: 'Arial', fallback: 'Arial', metrics: '@napi-rs/canvas', dpi: 96 },
    elements,
    readingOrder,
    flowchart: {
      startNodeId: paths.startId,
      decisionNodeId: paths.decisionId,
      commonNodeIds: [...paths.commonNodeIds],
      branches: paths.branches.map((branch, index) => ({
        edgeId: branch.edgeId,
        label: branch.label,
        lane: index === 0 ? 'left' : 'right',
        nodeIds: [...branch.nodeIds],
        edgeIds: [...branch.edgeIds],
      })),
      ...(paths.mergeNodeId ? { mergeNodeId: paths.mergeNodeId } : {}),
      sharedNodeIds: [...paths.sharedNodeIds],
    },
  };
  assertFlowchartScene(scene);
  return scene;
}
