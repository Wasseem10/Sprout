import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import * as interpreter from '../server/computer/presentation-intent';
import * as planner from '../server/computer/planner';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationOperation, PresentationTurnIntent } from '../shared/presentation-intent';
import { narrateFlowchart } from '../shared/presentation-flowchart';

const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => { for (const c of controllers.splice(0)) await c.close(); vi.restoreAllMocks(); });
const proposal = {title:'Campaign approval', graph:{orientation:'vertical', nodes:[
  {ref:'start',kind:'start',label:'Prepare campaign'}, {ref:'decision',kind:'decision',label:'Campaign approved?'},
  {ref:'launch',kind:'process',label:'Launch'}, {ref:'revise',kind:'process',label:'Revise campaign'},
  {ref:'record',kind:'process',label:'Record outcome'}, {ref:'finish',kind:'end',label:'Finish'},
],edges:[
  {from:'start',to:'decision'}, {from:'decision',to:'launch',branchLabel:'Approved'},
  {from:'decision',to:'revise',branchLabel:'Rejected'}, {from:'launch',to:'record'},
  {from:'revise',to:'record'}, {from:'record',to:'finish'},
]}};
const seed: OrderedPresentationDeck = {schemaVersion:2,title:'Campaign review',theme:'blue',textScale:1,allowImageReuse:false,slides:[
  {id:'cover',type:'cover',title:'Campaign review',subtitle:'A proposed review process for the campaign team'},
  {id:'anchor',type:'text',title:'Team responsibilities',points:['Agree who owns each review before sharing the campaign.']},
  {id:'final',type:'text',title:'Next steps',points:['Confirm the planned audience and publishing date.']},
]};
async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-graph-controller-'));
  const cfg = {...config(),localDir,owner:'isolated-graph-test',hfToken:'mock-only',cloudUrl:'',neonUrl:'',dbToken:''};
  const controller = new ComputerController(cfg); controllers.push(controller); await controller.init();
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input:unknown,promote:any) => { await promote(); return {promoted:true,opened:false,wasOpen:false,closed:0,retainedModified:0,warnings:[]}; });
  await (controller as any).savePictureDeck(legacyDeckProjection(seed),{root:localDir,assets:[],brief:'',briefName:null},signal(),1,false,[],'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',undefined,structuredClone(seed));
  const interpret = vi.spyOn(interpreter,'interpretPresentationTurn');
  const chat = vi.spyOn(planner,'chat').mockResolvedValue(JSON.stringify(proposal));
  async function request(operations:PresentationOperation[], kind:PresentationTurnIntent['kind']='request', activeSignal=signal()) {
    interpret.mockResolvedValueOnce({kind,domain:'presentation',startsNewTask:false,awaitingContinuation:false,fields:{open:false},operations});
    return controller.request(`Isolated typed graph action ${crypto.randomUUID()}`,activeSignal);
  }
  const deck = () => structuredClone(controller.snapshot().presentation!.project!.orderedDeck!);
  return {controller,request,deck,chat,localDir};
}
describe('flowchart typed operations through controller publication and undo', () => {
  it('generic slide read narrates the saved branches and merge without inference or mutation', async()=>{
    const qa=await fixture();
    await qa.request([{type:'insert_flowchart',target:2,position:'after',instruction:'Approval workflow'}]);
    const before=qa.controller.snapshot().presentation!;
    const graph=qa.deck().slides[2];if(graph.type!=='flowchart')throw new Error('No graph');
    const read=await qa.request([{type:'read_slide',target:3}]);
    expect(read.summary).toBe(`Slide 3, ${graph.title}. ${narrateFlowchart(graph.graph)}`);
    expect(read.summary).toContain('Approved');expect(read.summary).toContain('Rejected');expect(read.summary).toContain('Record outcome');
    expect(qa.controller.snapshot().presentation).toEqual(before);expect(qa.chat).toHaveBeenCalledTimes(1);
    await writeFile(path.join(qa.localDir,before.filename),'external change');
    await expect(qa.request([{type:'read_slide',target:3}])).rejects.toThrow('edited outside Insight');
  });
  it('a cancelled graph read does not change the reviewed target',async()=>{
    const qa=await fixture();
    await qa.request([{type:'insert_flowchart',target:2,position:'after',instruction:'Approval workflow'}]);
    await qa.request([{type:'read_slide',target:2}]);
    const cancel=new AbortController(),context=(qa.controller as any).presentationConversation;
    const prior=structuredClone(context.reviewedTarget);
    vi.spyOn(qa.controller,'presentationExport').mockImplementationOnce(async()=>{cancel.abort();return{bytes:Buffer.alloc(0),filename:'not-used.pptx'};});
    await expect(qa.request([{type:'read_slide',target:3}],'request',cancel.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(context.reviewedTarget).toEqual(prior);
  });
  it('inserts after a stable anchor, reads only one branch, edits one edge, and exactly undoes it on the same working file', async () => {
    const qa = await fixture();
    const before = qa.controller.snapshot().presentation!;
    const inserted = await qa.request([{type:'insert_flowchart',target:2,position:'after',instruction:'Add campaign approval with Approved and Rejected branches.'}]);
    expect(inserted.taskStatus).not.toBe('failed');
    expect(inserted.summary).toContain('as slide 3');
    const diagramDeck = qa.deck();
    expect(diagramDeck.slides.map(s=>s.id)).toEqual(['cover','anchor',expect.any(String),'final']);
    expect(diagramDeck.slides.filter(s=>s.type!=='flowchart')).toEqual(seed.slides);
    expect(inserted.state.presentation?.filename).toBe(before.filename);
    expect(inserted.changes).toHaveLength(1);
    const read = await qa.request([{type:'read_flowchart',target:3,scope:'branch',reference:'Rejected'}]);
    expect(read.summary).toContain('Revise campaign'); expect(read.summary).not.toContain('then Launch');
    expect(qa.deck()).toEqual(diagramDeck);
    expect(qa.chat).toHaveBeenCalledTimes(1);
    const edit = await qa.request([{type:'edit_flowchart',target:3,label:'Manual review',branch:'Approved',to:'Launch'}]);
    expect(edit.summary).toContain('Added Manual review');
    expect(edit.state.presentation?.filename).toBe(before.filename);
    const changed = qa.deck().slides[2];
    expect(changed.type).toBe('flowchart');
    if(changed.type==='flowchart') expect(changed.graph.nodes).toHaveLength(7);
    expect(qa.deck().slides.filter(s=>s.type!=='flowchart')).toEqual(seed.slides);
    const undone = await qa.request([{type:'undo'}]);
    expect(undone.summary).toContain('Undid'); expect(qa.deck()).toEqual(diagramDeck);
    expect(qa.chat).toHaveBeenCalledTimes(1);
    expect(undone.state.presentation?.filename).toBe(before.filename);
  });
  it('retains an ambiguous shared-edge edit and applies only the clarified branch', async () => {
    const qa = await fixture();
    await qa.request([{type:'insert_flowchart',target:2,position:'after',instruction:'Approval workflow'}]);
    const before = qa.deck();
    const question = await qa.request([{type:'edit_flowchart',target:3,label:'Manual review',to:'Record outcome'}]);
    expect(question.clarification).toBe(true); expect(question.summary).toContain('Which connection'); expect(qa.deck()).toEqual(before);
    const clarified = await qa.request([{type:'edit_flowchart',target:3,label:'Manual review',to:'Record outcome',branch:'Approved'}],'correction');
    expect(clarified.summary).toContain('between Launch and Record outcome');
    expect(qa.deck().slides).toHaveLength(4);
    const graph = qa.deck().slides[2]; if(graph.type!=='flowchart') throw new Error('No graph');
    expect(graph.graph.nodes.filter(n=>n.label==='Manual review')).toHaveLength(1);
  });
  it('keeps invalid proposals and over-capacity graph edits from changing files or revision', async () => {
    const qa = await fixture();
    const before = qa.controller.snapshot().presentation!;
    qa.chat.mockResolvedValue('{}');
    await expect(qa.request([{type:'insert_flowchart',target:2,position:'after',instruction:'Approval'}])).rejects.toMatchObject({code:'invalid_graph'});
    expect(qa.controller.snapshot().presentation?.sha256).toBe(before.sha256);
    qa.chat.mockResolvedValue(JSON.stringify(proposal));
    await qa.request([{type:'insert_flowchart',target:2,position:'after',instruction:'Approval'}]);
    await qa.request([{type:'edit_flowchart',target:3,label:'Manual review',branch:'Approved'}]);
    const full = qa.controller.snapshot().presentation!;
    await expect(qa.request([{type:'edit_flowchart',target:3,label:'Extra review',branch:'Rejected'}])).rejects.toMatchObject({code:'layout_capacity'});
    expect(qa.controller.snapshot().presentation?.sha256).toBe(full.sha256);
    expect(qa.controller.snapshot().presentation?.project?.revision).toBe(full.project?.revision);
  });
  it('uses the inserted graph as the next contextual operation target in a compound plan', async () => {
    const qa = await fixture();
    const result = await qa.request([
      {type:'insert_flowchart',target:2,position:'after',instruction:'Approval'},
      {type:'read_flowchart',target:'current',scope:'branch',reference:'Approved'},
    ]);
    expect(result.taskStatus).not.toBe('failed');
    expect(result.summary).toContain('Launch');
    expect(qa.deck().slides).toHaveLength(4);
  });
});
