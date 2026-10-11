import { describe, expect, it } from 'vitest';
import {
  applyFlowchartPatch,
  validateFlowchart,
  type Flowchart,
} from '../shared/presentation-flowchart';
import {
  assertFlowchartScene,
  FlowchartLayoutError,
  layoutFlowchart,
} from '../server/computer/presentation-flowchart-layout';
import type {
  PresentationSceneConnector,
  PresentationSceneShape,
  PresentationSceneText,
} from '../shared/presentation-scene';

function separate(): Flowchart {
  return validateFlowchart({
    orientation: 'vertical',
    nodes: [
      { id: 'start', kind: 'start', label: 'Start' },
      { id: 'decision', kind: 'decision', label: 'Campaign approval' },
      { id: 'launch', kind: 'process', label: 'Launch' },
      { id: 'success', kind: 'end', label: 'Campaign launched' },
      { id: 'revise', kind: 'process', label: 'Revise' },
      { id: 'rejected', kind: 'end', label: 'Revision required' },
    ],
    edges: [
      { id: 'entry', from: 'start', to: 'decision' },
      { id: 'approved', from: 'decision', to: 'launch', branchLabel: 'Approved' },
      { id: 'launched', from: 'launch', to: 'success' },
      { id: 'rejected', from: 'decision', to: 'revise', branchLabel: 'Rejected' },
      { id: 'revised', from: 'revise', to: 'rejected' },
    ].map((edge) => ({ ...edge, id: `edge_${edge.id}` })),
  });
}
function merged(): Flowchart {
  const graph = separate();
  graph.nodes = graph.nodes.filter((node) => !['success', 'rejected'].includes(node.id));
  graph.nodes.push(
    { id: 'merge', kind: 'process', label: 'Record outcome' },
    { id: 'finish', kind: 'end', label: 'Finish' },
  );
  graph.edges = graph.edges.map((edge) =>
    ['success', 'rejected'].includes(edge.to) ? { ...edge, to: 'merge' } : edge,
  );
  graph.edges.push({ id: 'edge_finish', from: 'merge', to: 'finish' });
  return validateFlowchart(graph);
}
const layout = (graph: Flowchart) =>
  layoutFlowchart(graph, { slideId: 'campaign-flow', title: 'Campaign approval process' });
const shape = (scene: ReturnType<typeof layout>, id: string) =>
  scene.elements.find(
    (item) => item.kind === 'shape' && item.sourceId === id,
  ) as PresentationSceneShape;

describe('unconnected measured flowchart scenes', () => {
  it.each(['blue', 'light', 'dark'] as const)(
    'lays out six nodes and two complete labeled paths in %s',
    (theme) => {
      const graph = separate();
      const original = structuredClone(graph);
      const scene = layoutFlowchart(graph, {
        slideId: 'campaign-flow',
        title: 'Campaign approval process',
        theme,
      });
      expect(scene.elements.filter((element) => element.kind === 'shape')).toHaveLength(6);
      expect(scene.elements.filter((element) => element.kind === 'connector')).toHaveLength(5);
      expect(
        scene.elements
          .filter((element) => element.kind === 'text' && element.role === 'branch-label')
          .map((element) => (element as PresentationSceneText).text),
      ).toEqual(['Approved', 'Rejected']);
      expect(scene.flowchart.branches.map((branch) => branch.nodeIds)).toEqual([
        ['launch', 'success'],
        ['revise', 'rejected'],
      ]);
      expect(scene.bodyBounds).toMatchObject({ y: 1.7, height: 5 });
      expect(scene.footerTop).toBe(7.08);
      expect(graph).toEqual(original);
      expect(scene.readingOrder.indexOf('campaign-flow:branch-label:edge_approved')).toBeLessThan(
        scene.readingOrder.indexOf('campaign-flow:label:launch'),
      );
      expect(
        scene.elements.every((element) => scene.readingOrder[element.readingOrder] === element.id),
      ).toBe(true);
      expect(() => assertFlowchartScene(scene)).not.toThrow();
    },
  );
  it.each(['edge_approved', 'edge_rejected', 'edge_entry'])(
    'fits seven nodes after inserting into %s',
    (edgeId) => {
      const graph = applyFlowchartPatch(
        separate(),
        { type: 'insertProcessOnEdge', edgeId, label: 'Manual review' },
        (kind) => `inserted_${kind}`,
      );
      const scene = layout(graph);
      expect(scene.elements.filter((element) => element.kind === 'shape')).toHaveLength(7);
      expect(shape(scene, 'inserted_node').labelId).toBe('campaign-flow:label:inserted_node');
      expect(() => assertFlowchartScene(scene)).not.toThrow();
    },
  );
  it('routes merged branches through distinct ports without crossing and preserves a seven-node prefix', () => {
    const graph = applyFlowchartPatch(
      merged(),
      { type: 'insertProcessOnEdge', edgeId: 'edge_entry', label: 'Prepare' },
      (kind) => `prefix_${kind}`,
    );
    const scene = layout(graph);
    expect(scene.flowchart.mergeNodeId).toBe('merge');
    expect(scene.flowchart.sharedNodeIds).toEqual(['merge', 'finish']);
    const joins = scene.elements.filter(
      (element): element is PresentationSceneConnector =>
        element.kind === 'connector' && element.toNodeId === 'merge',
    );
    expect(joins).toHaveLength(2);
    expect(joins[0].points.at(-1)!.x).not.toBe(joins[1].points.at(-1)!.x);
    expect(() => assertFlowchartScene(scene)).not.toThrow();
  });
  it('makes array reordering immaterial and keeps lanes stable when branch labels change', () => {
    const graph = separate();
    const scene = layout(graph);
    graph.nodes.reverse();
    graph.edges.reverse();
    expect(layout(graph)).toEqual(scene);
    const renamed = applyFlowchartPatch(graph, {
      type: 'relabelBranch',
      edgeId: 'edge_approved',
      label: 'Ready',
    });
    expect(
      layout(renamed).flowchart.branches.map((branch) => [branch.edgeId, branch.lane]),
    ).toEqual(scene.flowchart.branches.map((branch) => [branch.edgeId, branch.lane]));
    expect(layout(renamed).elements.map((element) => element.id)).toEqual(
      scene.elements.map((element) => element.id),
    );
  });
  it('wraps labels with actual Arial metrics and retains explicit readable font sizes', () => {
    const graph = separate();
    graph.nodes.find((node) => node.id === 'launch')!.label =
      'Share the approved campaign with local residents';
    const scene = layout(graph);
    const label = scene.elements.find(
      (element) => element.kind === 'text' && element.sourceId === 'launch',
    ) as PresentationSceneText;
    expect(label.lines.length).toBeGreaterThan(1);
    expect(label.lines.map((line) => line.text).join(' ')).toBe(label.text);
    expect(label.font).toMatchObject({ family: 'Arial', sizePt: 18 });
    expect(label.lines.every((line) => line.width <= label.bounds.width)).toBe(true);
  });
  it('rejects overlong words or a deep dense graph without shrinking or truncating labels', () => {
    const word = separate();
    word.nodes[1].label = 'W'.repeat(55);
    expect(() => layout(word)).toThrow(FlowchartLayoutError);
    const dense = applyFlowchartPatch(
      merged(),
      {
        type: 'insertProcessOnEdge',
        edgeId: 'edge_entry',
        label: 'Prepare all of the relevant campaign materials carefully',
      },
      (kind) => `prefix_${kind}`,
    );
    dense.nodes.forEach((node) => {
      node.label = 'Consider every important question before making the decision';
    });
    expect(() => layout(dense)).toThrow('taller');
    expect(
      dense.nodes.every(
        (node) => node.label === 'Consider every important question before making the decision',
      ),
    ).toBe(true);
  });
  it.each(['overlap', 'crossing', 'detached', 'outside', 'text-metrics', 'reading-order'] as const)(
    'detects corrupted scene invariant: %s',
    (defect) => {
      const scene = layout(separate());
      const connector = scene.elements.find(
        (element) => element.kind === 'connector',
      ) as PresentationSceneConnector;
      if (defect === 'overlap')
        shape(scene, 'launch').bounds = { ...shape(scene, 'revise').bounds };
      if (defect === 'crossing')
        connector.points = [
          { x: 0.7, y: shape(scene, 'launch').bounds.y + 0.1 },
          { x: 12.5, y: shape(scene, 'launch').bounds.y + 0.1 },
        ];
      if (defect === 'detached') connector.points[0].y += 0.06;
      if (defect === 'outside') shape(scene, 'start').bounds.y = 1;
      if (defect === 'text-metrics')
        (
          scene.elements.find(
            (element) => element.kind === 'text' && element.role === 'node-label',
          ) as PresentationSceneText
        ).lines[0].width = 0;
      if (defect === 'reading-order') scene.readingOrder.pop();
      expect(() => assertFlowchartScene(scene)).toThrow(FlowchartLayoutError);
    },
  );
});
