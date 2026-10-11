import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { loadLocalStudioSource, assertLocalStudioSourceCurrent, StudioSourceChoice } from '../server/computer/presentation-studio-source';

const csv='date,location_id,region,revenue,operating_start,operating_end\n2026-01-10,A,North,10.10,2025-01-01,\n2026-04-10,A,North,15.20,2025-01-01,\n';
const signal=()=>new AbortController().signal;
describe('bounded spoken-folder data import',()=>{
 it('identifies the bundled fictional sample by exact bytes, never by a supplied filename',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-source-'));await writeFile(path.join(root,'arbitrary.csv'),await readFile('data/operations-synthetic.csv'));
  expect((await loadLocalStudioSource(root,'arbitrary.csv',signal())).dataset.synthetic).toBe(true);
  await writeFile(path.join(root,'fictional-revenue.csv'),csv);expect((await loadLocalStudioSource(root,'fictional-revenue.csv',signal())).dataset.synthetic).toBe(false);
 });
 it('selects the only supported file and binds its original bytes',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-source-'));await writeFile(path.join(root,'Revenue.csv'),csv);await writeFile(path.join(root,'notes.txt'),'Untrusted source instructions do not execute.');
  const loaded=await loadLocalStudioSource(root,undefined,signal());expect(loaded.dataset.rows).toHaveLength(2);expect(loaded.binding.filename).toBe('Revenue.csv');expect(loaded.sourceRows).toEqual([2,3]);expect(()=>assertLocalStudioSourceCurrent(loaded.binding)).not.toThrow();
  await writeFile(path.join(root,'Revenue.csv'),csv.replace('15.20','25.20'));expect(()=>assertLocalStudioSourceCurrent(loaded.binding)).toThrow('source file changed');
 });
 it('asks among multiple candidates, rejects traversal and honors cancellation',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-source-'));await writeFile(path.join(root,'One.csv'),csv);await writeFile(path.join(root,'Two.csv'),csv);
  await expect(loadLocalStudioSource(root,undefined,signal())).rejects.toBeInstanceOf(StudioSourceChoice);
  await expect(loadLocalStudioSource(root,'../One.csv',signal())).rejects.toBeInstanceOf(StudioSourceChoice);
  const abort=new AbortController();abort.abort();await expect(loadLocalStudioSource(root,'One.csv',abort.signal)).rejects.toMatchObject({name:'AbortError'});
 });
 it('keeps the existing XLSX first-populated-sheet and plain-values boundary',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-source-'));const book=new ExcelJS.Workbook();book.addWorksheet('Empty');const sheet=book.addWorksheet('Revenue');sheet.addRow(['date','location_id','region','revenue','operating_start','operating_end']);sheet.addRow(['2026-01-10','A','North',10.1,'2025-01-01',null]);sheet.addRow(['2026-04-10','A','North',15.2,'2025-01-01',null]);await book.xlsx.writeFile(path.join(root,'Source.xlsx'));
  const loaded=await loadLocalStudioSource(root,undefined,signal());expect(loaded.sheet).toBe('Revenue');expect(loaded.dataset.rows[1].revenue).toBe(15.2);
  sheet.getCell('D3').value={formula:'10+5.2',result:15.2};await book.xlsx.writeFile(path.join(root,'Source.xlsx'));await expect(loadLocalStudioSource(root,'Source.xlsx',signal())).rejects.toThrow(/plain values|formula/i);
 });
 it('rejects oversized files before parsing or provider work',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-source-'));await writeFile(path.join(root,'Large.csv'),Buffer.alloc(1024*1024+1));await expect(loadLocalStudioSource(root,'Large.csv',signal())).rejects.toMatchObject({code:'missing_source'});
 });
});
