import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { VerifiedChartSnapshot } from '../../shared/presentation-chart-snapshot.js';
import { describeChartSnapshot, validateChartSnapshotIntegrity, type StudioChartEvidence } from './presentation-chart-snapshot.js';
import { PresentationFailureError } from '../../shared/presentation-failure.js';

const evidenceSchema = z.strictObject({
  datasetFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
  sourceSheet:z.string().min(1).max(160),
  rows:z.array(z.strictObject({datasetRow:z.number().int().min(0).max(5000),sourceRow:z.number().int().min(2).max(1048576),region:z.string().min(1).max(160),period:z.enum(['previous','current']).nullable(),status:z.enum(['included','outside-periods','excluded-location'])})).max(5000),
});
function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function verifiedEvidence(snapshot:VerifiedChartSnapshot,value:unknown):StudioChartEvidence {
  const evidence=evidenceSchema.parse(value);
  const hash=createHash('sha256').update(canonical(evidence)).digest('hex');
  if(hash!==snapshot.evidence.sha256 || evidence.datasetFingerprint!==snapshot.dataset.fingerprint || evidence.sourceSheet!==snapshot.dataset.sourceSheet || evidence.rows.length!==snapshot.counts.sourceRows)
    throw new PresentationFailureError('unverified_data','The chart row evidence does not match its saved source snapshot.');
  return evidence;
}
function evidenceFile(cfg:Config,snapshot:VerifiedChartSnapshot) {return path.join(cfg.localDir,'chart-evidence',`${snapshot.evidence.sha256}.json`);}
async function readEvidence(cfg:Config,snapshot:VerifiedChartSnapshot) {
  const file=evidenceFile(cfg,snapshot),stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw new Error('Invalid local evidence file.');
  return verifiedEvidence(snapshot,JSON.parse(await readFile(file,'utf8')));
}
/** Only row indices/status metadata is stored locally. Cloud sessions contain the frozen aggregate snapshot. */
export async function storeChartEvidence(cfg:Config,input:VerifiedChartSnapshot,value:StudioChartEvidence,signal:AbortSignal):Promise<void> {
  const snapshot=validateChartSnapshotIntegrity(input),evidence=verifiedEvidence(snapshot,value);
  signal.throwIfAborted();
  const file=evidenceFile(cfg,snapshot);
  await mkdir(path.dirname(file),{recursive:true});
  signal.throwIfAborted();
  try {await writeFile(file,JSON.stringify(evidence),{flag:'wx',mode:0o600});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await readEvidence(cfg,snapshot);}
  signal.throwIfAborted();
}
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(cents/100);
function arithmetic(total:VerifiedChartSnapshot['totals']['full']):string {
  const inputs=`previous ${money(total.previousCents)}, current ${money(total.currentCents)}, a change of ${money(total.deltaCents)}`;
  if(total.previousCents===0)return `${inputs}. Growth uses (current - previous) / abs(previous) * 100. The previous total is zero, so this percentage is undefined; it is not zero percent.`;
  return `${inputs}. Growth uses (current - previous) / abs(previous) * 100: (${money(total.currentCents)} minus ${money(total.previousCents)}) divided by ${money(Math.abs(total.previousCents))}, times 100, gives ${total.percent!.toFixed(2)} percent.`;
}
function sourceTotals(snapshot:VerifiedChartSnapshot):string {
  const full=`Full totals across all ${snapshot.scope.fullCategoryCount} included regions: ${arithmetic(snapshot.totals.full)}`;
  return snapshot.scope.omittedCategoryCount
    ? `${full} The chart displays the top ${snapshot.categories.length} regions ranked by absolute revenue change and omits ${snapshot.scope.omittedCategoryCount} regions. Displayed-region totals are separate: ${arithmetic(snapshot.totals.displayed)} The overall growth above uses the full totals, not only the displayed bars.`
    : `${full} Every included region is displayed, so the displayed totals equal the full totals.`;
}

/** Caller must first verify the active output-file hash. Readback performs no provider request. */
export async function readChartSnapshot(input:VerifiedChartSnapshot,detail:'summary'|'source'|'values',cfg:Config):Promise<string> {
  const snapshot=validateChartSnapshotIntegrity(input);
  if(detail==='summary')return describeChartSnapshot(snapshot);
  const dated=`This saved snapshot was verified with Databricks on ${snapshot.verification.verifiedAt.slice(0,10)}. It is not a new live query.`;
  if(detail==='values')return `${snapshot.dataset.synthetic?'Fictional sample. ':''}${snapshot.categories.map((region,i)=>`${region}: ${snapshot.series[0].label}, ${money(snapshot.series[0].valuesCents[i])}; ${snapshot.series[1].label}, ${money(snapshot.series[1].valuesCents[i])}.`).join(' ')} ${snapshot.scope.omittedCategoryCount?`${snapshot.scope.omittedCategoryCount} regions are omitted from this top-category chart. `:''}${dated}`;
  let rowDetail='Row-level evidence is not available on this computer; the saved aggregate snapshot remains available.';
  try {
    const evidence=await readEvidence(cfg,snapshot);
    const rows=evidence.rows.filter(row=>row.status==='included').map(row=>row.sourceRow);
    rowDetail=`Included source rows begin with ${rows.slice(0,8).join(', ')}${rows.length>8?`, with ${rows.length-8} additional included rows recorded locally`:''}. ${snapshot.counts.excludedLocationRows} rows were excluded by the location rule and ${snapshot.counts.outsidePeriodRows} fell outside the compared dates.`;
  }catch{/* Source metadata remains useful even when a local evidence attachment is absent or corrupt. */}
  const comparison=snapshot.analysis.comparison;
  return `${snapshot.dataset.synthetic?'Fictional sample. ':''}Source: ${snapshot.dataset.name}, sheet ${snapshot.dataset.sourceSheet}. Revenue is summed in integer cents for ${comparison.previous.start} through ${comparison.previous.end}, compared with ${comparison.current.start} through ${comparison.current.end}. ${comparison.commonLocations?'Only continuously operating locations are included.':'All reported locations are included.'} ${sourceTotals(snapshot)} ${rowDetail} ${dated}`;
}
