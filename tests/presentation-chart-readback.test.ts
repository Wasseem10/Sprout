import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../server/config';
import { analyzeLocal, datasetVersion } from '../shared/analysis';
import type { StudioState } from '../shared/studio';
import type { Dataset } from '../shared/schema';
import { buildVerifiedChartSnapshot, captureStudioChartBinding } from '../server/computer/presentation-chart-snapshot';
import { readChartSnapshot, storeChartEvidence } from '../server/computer/presentation-chart-readback';

async function fixture(values:[number,number][],topN:number|null=null){
 const dataset:Dataset={id:'arithmetic-test',name:'Quarterly revenue.csv',synthetic:true,rows:values.flatMap(([previous,current],i)=>[previous,current].map((revenue,p)=>({region:`Region ${i+1}`,location_id:`site-${i}`,date:p?'2026-04-03':'2026-01-03',revenue,operating_start:'2025-01-01',operating_end:null})))};
 const result=analyzeLocal(dataset,{previous:{label:'Q1',start:'2026-01-01',end:'2026-03-31'},current:{label:'Q2',start:'2026-04-01',end:'2026-06-30'},commonLocations:true});
 result.provider='databricks';result.createdAt='2026-10-11T12:00:00.000Z';result.queryReference=`Databricks statement arithmetic-test; table \`catalog\`.\`schema\`.\`ops_${datasetVersion(dataset).slice(0,24)}\``;
 const studio:StudioState={workspace:{moduleId:'data',schemaVersion:1,title:'Quarterly analysis',dataset,result,view:{kind:'chart',topN},projectId:null},baseline:structuredClone(result),revision:1,sourceSheet:'Revenue',sourceRows:dataset.rows.map((_,i)=>i+2),lastChange:'',evidence:[],canUndo:false,interpretation:'hugging-face',outputs:{excel:null,powerpoint:null}};
 const prepared=buildVerifiedChartSnapshot(studio,captureStudioChartBinding(studio),new Date('2026-10-11T12:01:00.000Z'));
 const cfg={...config(),localDir:await mkdtemp(path.join(tmpdir(),'chart-readback-'))};
 await storeChartEvidence(cfg,prepared.snapshot,prepared.localEvidence,new AbortController().signal);
 return readChartSnapshot(prepared.snapshot,'source',cfg);
}
describe('saved chart percentage evidence',()=>{
 it('states the exact full-total arithmetic, source rows and dated verification without an inference request',async()=>{
  const text=await fixture([[10.1,15.2],[20.3,31.4]]);
  expect(text).toContain('previous $30.40, current $46.60, a change of $16.20');
  expect(text).toContain('(current - previous) / abs(previous) * 100');
  expect(text).toContain('($46.60 minus $30.40) divided by $30.40, times 100, gives 53.29 percent');
  expect(text).toContain('displayed totals equal the full totals');
  expect(text).toContain('2, 3, 4, 5');expect(text).toContain('2026-10-11');expect(text).toContain('not a new live query');
 });
 it('keeps displayed top-category growth separate from full totals',async()=>{
  const text=await fixture([[100,110],[100,200]],1);
  expect(text).toContain('Full totals across all 2 included regions: previous $200.00, current $310.00');
  expect(text).toContain('55.00 percent');expect(text).toContain('omits 1 regions');
  expect(text).toContain('Displayed-region totals are separate: previous $100.00, current $200.00');
  expect(text).toContain('100.00 percent');expect(text).toContain('not only the displayed bars');
 });
 it('uses the absolute previous total for negative revenue',async()=>{
  const text=await fixture([[-10,-5]]);
  expect(text).toContain('(-$5.00 minus -$10.00) divided by $10.00');expect(text).toContain('50.00 percent');
 });
 it('does not invent a percentage for a zero baseline',async()=>{
  const text=await fixture([[0,7.07]]);
  expect(text).toContain('previous $0.00, current $7.07');expect(text).toContain('percentage is undefined; it is not zero percent');
 });
});
