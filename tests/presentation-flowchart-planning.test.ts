import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import {
  flowchartFingerprint, groundFlowchartEdit, insertFlowchartProcess, planFlowchartSlide,
  readFlowchart, resolveFlowchartRead, resolveFlowchartEdit,
} from '../server/computer/presentation-flowchart-planning';
import { flowchartNodeOrder, validateFlowchart, type Flowchart } from '../shared/presentation-flowchart';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';

vi.mock('../server/computer/planner', () => ({ chat: vi.fn() }));
const chatMock = vi.mocked(chat);
const signal = () => new AbortController().signal;
const cfg = { ...config(), hfToken: 'test-only', hfModel: 'test-qwen' };
function graph(): Flowchart {
  return validateFlowchart({ orientation: 'vertical', nodes: [
    { id: 'start', kind: 'start', label: 'Prepare campaign' },
    { id: 'decision', kind: 'decision', label: 'Campaign approved?' },
    { id: 'launch', kind: 'process', label: 'Launch' },
    { id: 'revise', kind: 'process', label: 'Revise campaign' },
    { id: 'record', kind: 'process', label: 'Record outcome' },
    { id: 'finish', kind: 'end', label: 'Finish' },
  ], edges: [
    { id: 'e0', from: 'start', to: 'decision' },
    { id: 'e1', from: 'decision', to: 'launch', branchLabel: 'Approved' },
    { id: 'e2', from: 'decision', to: 'revise', branchLabel: 'Rejected' },
    { id: 'e3', from: 'launch', to: 'record' },
    { id: 'e4', from: 'revise', to: 'record' },
    { id: 'e5', from: 'record', to: 'finish' },
  ] });
}
const deck: OrderedPresentationDeck = { schemaVersion: 2, title: 'Campaign', theme: 'blue', textScale: 1, allowImageReuse: false, slides: [
  { id: 'cover', type: 'cover', title: 'Campaign', subtitle: 'A clear campaign review process for our team' },
  { id: 'context', type: 'text', title: 'Context', points: ['Review the proposed campaign before launch.'] },
  { id: 'end', type: 'text', title: 'Next steps', points: ['Choose who will review the campaign.'] },
] };
function proposal() {
  const input = graph();
  return { title: 'Campaign approval', graph: { orientation: 'vertical', nodes: input.nodes.map(({id, ...node}) => ({ref: id, ...node})), edges: input.edges.map(({id: _id, ...edge}) => edge) } };
}
beforeEach(() => vi.clearAllMocks());
describe('bounded flowchart proposal and directed edge editing', () => {
  it('reads repeated labels by a grounded ordered reference and rejects an obsolete number/label pair', () => {
    const input = graph(); input.nodes.find(node => node.id === 'revise')!.label = 'Launch';
    expect(() => resolveFlowchartRead(input, { type: 'read_flowchart', scope: 'node', reference: 'Launch' })).toThrow('Which step');
    const order = flowchartNodeOrder(input);
    for (const id of ['launch', 'revise']) {
      const index = order.indexOf(id) + 1;
      expect(resolveFlowchartRead(input, { type: 'read_flowchart', scope: 'node', reference: `step ${index}: Launch` })).toEqual({ kind: 'node', nodeId: id });
    }
    expect(() => resolveFlowchartRead(input, { type: 'read_flowchart', scope: 'node', reference: 'step 1: Launch' })).toThrow('no longer matches');
  });
  it('grounds canonical node labels to unique spoken fragments and removes only redundant inferred endpoints', () => {
    const input = graph(); input.nodes.find(node=>node.id==='launch')!.label='Launch campaign';
    const op = groundFlowchartEdit(input,{type:'edit_flowchart',target:3,label:'Manual review',branch:'Approved',from:'Campaign approved?',to:'Launch campaign'},'On slide three, insert Manual review before Launch on the Approved branch.');
    expect(op).toEqual({type:'edit_flowchart',target:3,label:'Manual review',branch:'Approved',to:'launch'});
    expect(resolveFlowchartEdit(input,op).edgeId).toBe('e1');
    expect(() => groundFlowchartEdit(input,{type:'edit_flowchart',label:'Manual review',branch:'Approved',from:'Revise campaign',to:'Launch campaign'},'Insert Manual review before Launch on Approved.')).toThrow('conflicts');
  });
  it('does not use an inferred or negated branch to resolve an ambiguous merge, and retains the requested edit', () => {
    const op=groundFlowchartEdit(graph(),{type:'edit_flowchart',target:3,label:'Manual review',branch:'Approved',from:'Campaign approved?',to:'Record outcome'},'Insert Manual review before Record outcome on slide three.');
    expect(op).toEqual({type:'edit_flowchart',target:3,label:'Manual review',to:'Record outcome'});
    expect(()=>resolveFlowchartEdit(graph(),op)).toThrow('Which connection');
    const negated=groundFlowchartEdit(graph(),{type:'edit_flowchart',label:'Manual review',branch:'Approved',to:'Record outcome'},'Add Manual review before Record outcome, not Approved.');
    expect(negated.branch).toBeUndefined();
  });
  it('allocates IDs from a valid bounded proposal and returns a measured editable scene', async () => {
    chatMock.mockResolvedValue(JSON.stringify(proposal()));
    const result = await planFlowchartSlide('Show approval with Approved and Rejected branches.', deck, deck.slides[1], cfg, signal());
    expect(result.type).toBe('flowchart');
    expect(result.graph.nodes).toHaveLength(6);
    expect(result.graph.nodes[0].id).not.toBe('start');
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(deck.slides).toHaveLength(3);
  });
  it('repairs an invalid topology once and never accepts a loop', async () => {
    const invalid = proposal();
    invalid.graph.edges.push({ from: 'finish', to: 'start' });
    chatMock.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify(proposal()));
    expect((await planFlowchartSlide('Approval', deck, deck.slides[1], cfg, signal())).graph.nodes).toHaveLength(6);
    expect(chatMock).toHaveBeenCalledTimes(2);
    chatMock.mockClear().mockResolvedValue(JSON.stringify(invalid));
    await expect(planFlowchartSlide('Approval', deck, deck.slides[1], cfg, signal())).rejects.toMatchObject({code: 'invalid_graph'});
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('checks cancellation after model completion before returning any proposal', async () => {
    const abort = new AbortController();
    chatMock.mockImplementation(async () => { abort.abort(); return JSON.stringify(proposal()); });
    await expect(planFlowchartSlide('Approval', deck, deck.slides[1], cfg, abort.signal)).rejects.toMatchObject({name: 'AbortError'});
  });
  it('narrates only the named branch through its actual merge and end, without inference', () => {
    const text = readFlowchart(graph(), { type: 'read_flowchart', scope: 'branch', reference: 'Rejected' });
    expect(text).toContain('Revise campaign');
    expect(text).toContain('Record outcome');
    expect(text).toContain('Finish');
    expect(text).not.toContain('Launch');
    expect(chatMock).not.toHaveBeenCalled();
  });
  it('requires a branch before inserting at an ambiguous shared merge', () => {
    expect(() => resolveFlowchartEdit(graph(), {type:'edit_flowchart', label:'Manual review', to:'Record outcome'})).toThrow('Which connection');
    expect(resolveFlowchartEdit(graph(), {type:'edit_flowchart', label:'Manual review', to:'Record outcome', branch:'Approved'}).edgeId).toBe('e3');
    expect(() => resolveFlowchartEdit(graph(), {type:'edit_flowchart', label:'Manual review', branch:'Unknown'})).toThrow('Approved or Rejected');
    expect(() => resolveFlowchartEdit(graph(), {type:'edit_flowchart', label:'Manual review', from:'e1'})).toThrow('Which connection');
  });
  it('patches only the bound edge, preserves both branch labels and the other path, and enforces hash/capacity', () => {
    const original = {id:'diagram', type:'flowchart' as const, title:'Approval process', graph:graph()};
    const binding = resolveFlowchartEdit(original.graph, {type:'edit_flowchart', label:'Manual review', branch:'Approved'});
    const changed = insertFlowchartProcess(original, binding.edgeId, binding.sha256, 'Manual review', deck);
    expect(changed.slide.graph.nodes).toHaveLength(7);
    expect(changed.slide.graph.nodes.filter(node => original.graph.nodes.some(old => old.id === node.id))).toEqual(original.graph.nodes);
    expect(changed.slide.graph.edges.find(edge => edge.id === 'e2')).toEqual(original.graph.edges.find(edge => edge.id === 'e2'));
    expect(changed.slide.graph.edges.find(edge => edge.id === 'e1')?.branchLabel).toBe('Approved');
    expect(original.graph.nodes).toHaveLength(6);
    expect(() => insertFlowchartProcess(original, binding.edgeId, 'stale', 'Review', deck)).toThrow('changed');
    expect(() => insertFlowchartProcess(changed.slide, binding.edgeId, flowchartFingerprint(changed.slide.graph), 'Extra', deck)).toThrow('seven nodes');
  });
});
