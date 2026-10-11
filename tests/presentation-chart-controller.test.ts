import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import * as interpreter from '../server/computer/presentation-intent';
import { Databricks } from '../server/providers/databricks';
import { PresentationStore } from '../server/providers/presentationStore';
import { analyzeLocal, datasetVersion } from '../shared/analysis';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationFields, PresentationOperation, PresentationTurnIntent } from '../shared/presentation-intent';
import type { Dataset, Comparison } from '../shared/schema';
import type { StudioState } from '../shared/studio';

const controllers:ComputerController[]=[];
const signal=()=>new AbortController().signal;
afterEach(async()=>{for(const c of controllers.splice(0))await c.close();vi.restoreAllMocks();});
const seed:OrderedPresentationDeck={schemaVersion:2,title:'Revenue review',theme:'blue',textScale:1,allowImageReuse:false,slides:[
 {id:'cover',type:'cover',title:'Revenue review',subtitle:'A financial review using a supported source table'},
 {id:'anchor',type:'text',title:'Regional performance',points:['Compare the reported revenue across regions.']},
 {id:'closing',type:'text',title:'Next steps',points:['Review the dated evidence before making decisions.']},
]};
function source():StudioState {
 const dataset:Dataset={id:'chart-test',name:'Regional revenue.csv',synthetic:true,rows:[
 {region:'North',location_id:'A',date:'2026-01-10',revenue:10.1,operating_start:'2025-01-01',operating_end:null},
 {region:'North',location_id:'A',date:'2026-04-10',revenue:15.2,operating_start:'2025-01-01',operating_end:null},
 {region:'South',location_id:'B',date:'2026-01-10',revenue:20.3,operating_start:'2025-01-01',operating_end:null},
 {region:'South',location_id:'B',date:'2026-04-10',revenue:31.4,operating_start:'2025-01-01',operating_end:null},
 ]};
 const comparison:Comparison={previous:{label:'Q1',start:'2026-01-01',end:'2026-03-31'},current:{label:'Q2',start:'2026-04-01',end:'2026-06-30'},commonLocations:true};
 const result=analyzeLocal(dataset,comparison);
 return {workspace:{schemaVersion:1,moduleId:'data',title:'Regional revenue',dataset,result,view:{kind:'chart',topN:null},projectId:null},baseline:structuredClone(result),revision:1,sourceSheet:'Revenue',sourceRows:[2,3,6,7],lastChange:'',evidence:[],canUndo:false,interpretation:'hugging-face',outputs:{excel:null,powerpoint:null}};
}
async function fixture(initial=seed) {
 const localDir=await mkdtemp(path.join(tmpdir(),'insight-chart-controller-'));
 const cfg={...config(),localDir,owner:'isolated-chart-controller',hfToken:'mock-only',cloudUrl:'',neonUrl:'',dbToken:''};
 async function open() {
  const controller=new ComputerController(cfg);controllers.push(controller);await controller.init();
  vi.spyOn(controller as any,'launchOffice').mockResolvedValue(undefined);
  const refresh=vi.spyOn(controller as any,'refreshPresentationFile').mockImplementation(async(_input:unknown,promote:any)=>{await promote();return {promoted:true,opened:false,wasOpen:false,closed:0,retainedModified:0,warnings:[]};});
  return {controller,refresh};
 }
 const {controller,refresh}=await open();
 await (controller as any).savePictureDeck(legacyDeckProjection(initial),{root:localDir,assets:[],brief:'',briefName:null},signal(),1,false,[],'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',undefined,structuredClone(initial));
 controller.state.studio=source();
 const reports=vi.spyOn(controller as any,'writeStudioReports');
 const interpret=vi.spyOn(interpreter,'interpretPresentationTurn');
 const db=vi.spyOn(Databricks.prototype,'analyze').mockImplementation(async(dataset,comparison)=>{
  const result=analyzeLocal(dataset,comparison);result.provider='databricks';result.createdAt=new Date().toISOString();
  result.queryReference=`Databricks statement fresh-statement; table \`catalog\`.\`schema\`.\`ops_${datasetVersion(dataset).slice(0,24)}\``;
  return result;
 });
 async function request(operations:PresentationOperation[],active=controller,kind:PresentationTurnIntent['kind']='request',activeSignal=signal(),fields:PresentationFields={}) {
  interpret.mockResolvedValueOnce({kind,domain:'presentation',startsNewTask:false,awaitingContinuation:false,fields:{open:false,...fields},operations});
  return active.request(`Isolated chart action ${crypto.randomUUID()}`,activeSignal);
 }
 return {cfg,localDir,controller,refresh,reports,db,request,open,deck:()=>structuredClone(controller.snapshot().presentation!.project!.orderedDeck!)};
}

describe('verified chart integration into the existing presentation',()=>{
 it('asks before/after, inserts one slide, reads frozen evidence, saves/restarts/resumes and undoes without querying again',async()=>{
  const qa=await fixture(),before=qa.controller.snapshot().presentation!;
  const ask=await qa.request([{type:'insert_verified_chart',target:2}]);
  expect(ask.clarification).toBe(true);expect(ask.summary).toContain('before or after slide 2');expect(qa.db).not.toHaveBeenCalled();
  const inserted=await qa.request([{type:'insert_verified_chart',target:2,position:'after'}],qa.controller,'correction');
  expect(inserted.summary).toContain('verified revenue chart as slide 3');
  expect(inserted.state.presentation?.filename).toBe(before.filename);expect(qa.db).toHaveBeenCalledTimes(1);expect(qa.reports).not.toHaveBeenCalled();
  const frozen=qa.deck(),chart=frozen.slides[2];if(chart.type!=='chart')throw new Error('Missing chart');
  expect(frozen.slides.filter(s=>s.type!=='chart')).toEqual(seed.slides);
  expect(chart.chart.verifiedSnapshot?.categories).toEqual(['South','North']);
  expect(chart.chart.verifiedSnapshot?.series[1].valuesCents).toEqual([3140,1520]);
  const evidenceFiles=await readdir(path.join(qa.localDir,'chart-evidence'));expect(evidenceFiles).toHaveLength(1);
  const read=await qa.request([{type:'read_chart',target:3,detail:'source'}]);
  expect(read.summary).toContain('sheet Revenue');expect(read.summary).toContain('2, 3, 6, 7');expect(read.summary).toContain('not a new live query');
  const values=await qa.request([{type:'read_chart',target:3,detail:'values'}]);expect(values.summary).toContain('$15.20');
  const generic=await qa.request([{type:'read_slide',target:3}]);expect(generic.summary).toContain('saved Databricks result');
  await qa.request([{type:'save'}]);
  const id=qa.controller.snapshot().presentation!.project!.saved!.id;
  const saved=await new PresentationStore(qa.cfg).load(id,signal());
  expect(JSON.stringify(saved?.session)).toContain(chart.chart.verifiedSnapshot!.snapshotHash);
  expect(JSON.stringify(saved?.session)).not.toContain('"sourceRow":');
  expect(JSON.stringify(saved?.session)).not.toContain(qa.localDir);
  await qa.controller.close();
  const restarted=await qa.open();
  await qa.request([{type:'resume'}],restarted.controller);
  expect(restarted.controller.snapshot().presentation!.project!.orderedDeck).toEqual(frozen);
  const reread=await qa.request([{type:'read_chart',target:3,detail:'values'}],restarted.controller);
  expect(reread.summary).toContain('$15.20');expect(qa.db).toHaveBeenCalledTimes(1);
  await qa.request([{type:'undo'}],restarted.controller);
  expect(restarted.controller.snapshot().presentation!.project!.orderedDeck).toEqual(seed);
  expect(restarted.controller.snapshot().presentation!.filename).toBe(before.filename);
 });
 it('rejects a changed Studio selection at the actual promotion boundary and preserves the file',async()=>{
  const qa=await fixture(),before=qa.controller.snapshot().presentation!;
  qa.refresh.mockImplementation(async(_input:unknown,promote:any)=>{qa.controller.state.studio!.workspace.view.topN=1;await promote();return {} as any;});
  await expect(qa.request([{type:'insert_verified_chart',target:2,position:'before'}])).rejects.toMatchObject({code:'stale_revision'});
  expect(qa.controller.snapshot().presentation?.sha256).toBe(before.sha256);expect(qa.deck()).toEqual(seed);
  expect(qa.controller.snapshot().presentation?.project?.revision).toBe(1);
 });
 it('does not insert on cancelled or inconsistent provider results',async()=>{
  const qa=await fixture(),before=qa.controller.snapshot().presentation!;
  const cancel=new AbortController();
  qa.db.mockImplementationOnce(async()=>{cancel.abort();return structuredClone(qa.controller.state.studio!.workspace.result!);});
  await expect(qa.request([{type:'insert_verified_chart',target:2,position:'after'}],qa.controller,'request',cancel.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(qa.controller.snapshot().presentation?.sha256).toBe(before.sha256);
  qa.db.mockImplementationOnce(async()=>{const result=structuredClone(qa.controller.state.studio!.workspace.result!);result.currentTotal++;return result;});
  await expect(qa.request([{type:'insert_verified_chart',target:2,position:'after'}])).rejects.toMatchObject({code:'unverified_data'});
  expect(qa.deck()).toEqual(seed);
 });
 it('checks slide capacity before calling Databricks and never replaces the anchor',async()=>{
  const full={...seed,slides:[...seed.slides,...Array.from({length:7},(_,i)=>({id:`extra-${i}`,type:'text' as const,title:`Section ${i+1}`,points:['A preserved source paragraph.']}))]};
  const qa=await fixture(full);
  await expect(qa.request([{type:'insert_verified_chart',target:4,position:'before'}])).rejects.toMatchObject({code:'layout_capacity'});
  expect(qa.db).not.toHaveBeenCalled();expect(qa.deck()).toEqual(full);
 });
 it('does not claim row evidence if the local attachment is missing or corrupted, and refuses altered output bytes',async()=>{
  const qa=await fixture();await qa.request([{type:'insert_verified_chart',target:2,position:'after'}]);
  const file=(await readdir(path.join(qa.localDir,'chart-evidence')))[0];
  await writeFile(path.join(qa.localDir,'chart-evidence',file),'{}');
  const read=await qa.request([{type:'read_chart',target:3,detail:'source'}]);expect(read.summary).toContain('not available on this computer');
  const active=qa.controller.snapshot().presentation!;
  await writeFile(path.join(qa.localDir,active.filename),'external edit');
  await expect(qa.request([{type:'read_chart',target:3,detail:'values'}])).rejects.toThrow();
  expect(qa.db).toHaveBeenCalledTimes(1);
 });
 it('clarifies a source filename, imports without touching the deck, then refreshes changed bytes with the same slide ID and one undo',async()=>{
  const qa=await fixture(),before=qa.controller.snapshot().presentation!;
  const folder=path.join(qa.localDir,'Revenue sources');await mkdir(folder);
  const csv='date,location_id,region,revenue,operating_start,operating_end\n2026-01-10,A,North,10.10,2025-01-01,\n2026-04-10,A,North,15.20,2025-01-01,\n';
  await writeFile(path.join(folder,'Revenue.csv'),csv);await writeFile(path.join(folder,'Alternative.csv'),csv);
  const choose=await qa.request([{type:'import_studio_source',folderPath:folder}]);expect(choose.clarification).toBe(true);expect(choose.summary).toContain('Revenue.csv');expect(qa.db).not.toHaveBeenCalled();
  const loaded=await qa.request([{type:'import_studio_source',datasetFilename:'Revenue.csv'}],qa.controller,'correction');
  expect(loaded.summary).toContain('Loaded Revenue.csv');expect(qa.controller.snapshot().presentation?.sha256).toBe(before.sha256);
  await qa.request([{type:'insert_verified_chart',target:2,position:'after'}]);
  const first=qa.deck(),chart=first.slides[2];if(chart.type!=='chart')throw new Error('Expected chart');
  const history=(qa.controller as any).pictureHistory.length;
  await writeFile(path.join(folder,'Revenue.csv'),csv.replace('15.20','25.20'));
  const oldRead=await qa.request([{type:'read_chart',target:3,detail:'values'}]);expect(oldRead.summary).toContain('$15.20');expect(qa.db).toHaveBeenCalledTimes(1);
  await qa.request([{type:'refresh_verified_chart',target:3}]);
  const refreshed=qa.deck(),next=refreshed.slides[2];if(next.type!=='chart')throw new Error('Expected chart');
  expect(next.id).toBe(chart.id);expect(next.title).toBe(chart.title);expect(refreshed.slides).toHaveLength(4);
  expect(next.chart.verifiedSnapshot?.snapshotHash).not.toBe(chart.chart.verifiedSnapshot?.snapshotHash);
  expect(next.chart.series[1].values).toEqual([25.2]);expect(refreshed.slides.filter(s=>s.id!==chart.id)).toEqual(first.slides.filter(s=>s.id!==chart.id));
  expect((qa.controller as any).pictureHistory).toHaveLength(history+1);expect(qa.db).toHaveBeenCalledTimes(2);expect(qa.reports).not.toHaveBeenCalled();
  await qa.request([{type:'undo'}]);expect(qa.deck()).toEqual(first);
 });
 it('refuses missing original refresh sources and checks changed source bytes at publication',async()=>{
  const qa=await fixture();await qa.request([{type:'insert_verified_chart',target:2,position:'after'}]);
  const first=qa.deck();qa.controller.state.studio!.workspace.dataset!.name='Different source.csv';
  const wrong=await qa.request([{type:'refresh_verified_chart',target:3}]);expect(wrong.clarification).toBe(true);expect(wrong.summary).toContain('original source');expect(qa.deck()).toEqual(first);expect(qa.db).toHaveBeenCalledTimes(1);
  // A fresh explicit source load also replaces the prior pending source question.
  const folder=path.join(qa.localDir,'Only dataset');await mkdir(folder);
  const csv='date,location_id,region,revenue,operating_start,operating_end\n2026-01-10,A,North,10.10,2025-01-01,\n2026-04-10,A,North,15.20,2025-01-01,\n';await writeFile(path.join(folder,'Source.csv'),csv);
  (qa.controller as any).presentationConversation.cancel();
  await qa.request([{type:'import_studio_source',folderPath:folder}]);
  qa.refresh.mockImplementation(async(_input:unknown,promote:any)=>{await writeFile(path.join(folder,'Source.csv'),csv.replace('15.20','25.20'));await promote();return {} as any;});
  await expect(qa.request([{type:'insert_verified_chart',target:2,position:'before'}])).rejects.toMatchObject({code:'stale_revision'});
  expect(qa.deck()).toEqual(first);
 });
 it('refreshes a chart in a ten-slide deck without adding a slide and cancels without mutation',async()=>{
  const qa=await fixture();await qa.request([{type:'insert_verified_chart',target:2,position:'after'}]);
  const chartDeck=qa.deck();chartDeck.slides.push(...Array.from({length:6},(_,i)=>({id:`tail-${i}`,type:'text' as const,title:`Preserved ${i}`,points:['Preserved source text.']})));
  await(qa.controller as any).savePictureDeck(legacyDeckProjection(chartDeck),{root:qa.localDir,assets:[],brief:'',briefName:null},signal(),3,false,[],'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',undefined,chartDeck);
  await qa.request([{type:'refresh_verified_chart',target:3}]);expect(qa.deck().slides).toHaveLength(10);
  const before=qa.deck(),cancel=new AbortController();qa.db.mockImplementationOnce(async()=>{cancel.abort();return structuredClone(qa.controller.state.studio!.workspace.result!);});
  await expect(qa.request([{type:'refresh_verified_chart',target:3}],qa.controller,'request',cancel.signal)).rejects.toMatchObject({name:'AbortError'});expect(qa.deck()).toEqual(before);
 });
 it('loads a missing source dependency before continuing the already bound chart request',async()=>{
  const qa=await fixture();qa.controller.state.studio=null;
  const folder=path.join(qa.localDir,'Original source');await mkdir(folder);await writeFile(path.join(folder,'Only.csv'),'date,location_id,region,revenue,operating_start,operating_end\n2026-01-10,A,North,10.10,2025-01-01,\n2026-04-10,A,North,15.20,2025-01-01,\n');
  const question=await qa.request([{type:'insert_verified_chart',target:2,position:'after'}]);expect(question.clarification).toBe(true);expect(qa.db).not.toHaveBeenCalled();
  const completed=await qa.request([],qa.controller,'continuation',signal(),{folderPath:folder});expect(completed.clarification).toBeUndefined();expect(completed.summary).toContain('Loaded Only.csv');expect(completed.summary).toContain('verified revenue chart as slide 3');expect(qa.db).toHaveBeenCalledTimes(1);expect(qa.deck().slides.filter(s=>s.type!=='chart')).toEqual(seed.slides);
 });
});
