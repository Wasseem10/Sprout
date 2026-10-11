import { it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { parseStudioFile } from '../server/computer/studio-assistant';
import { studioMoney } from '../shared/studio';

const require = createRequire(import.meta.url),
  JSZip = require('jszip');
const controllers: ComputerController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
});
const signal = () => new AbortController().signal;
async function setup() {
  const cfg = {
    ...config(),
    hfToken: '',
    cloudUrl: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-studio-')),
  };
  const computer = new ComputerController(cfg);
  controllers.push(computer);
  await computer.init();
  return { computer, cfg };
}
it('connects source-grounded filter correction to matching Excel and native PowerPoint evidence, and invalidates old reports', async () => {
  const { computer, cfg } = await setup();
  const first = await computer.request('Start the analysis demo', signal());
  expect(first.state.studio?.workspace.result?.currentTotal).toBe(204000);
  const changed = await computer.request('Wait, compare only the same locations', signal());
  expect(changed.state.studio?.workspace.result).toMatchObject({
    previousTotal: 126000,
    currentTotal: 141000,
    includedRows: 30,
    excludedLocations: 2,
  });
  const evidence = await computer.request(
    'How did you get that number? Show the source rows',
    signal(),
  );
  expect(evidence.summary).toContain('$15,000');
  expect(evidence.state.studio?.evidence).toHaveLength(30);
  await computer.request('Create an Excel and PowerPoint report', signal());
  const workbook = await computer.studioExport('excel'),
    deck = await computer.studioExport('powerpoint');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(workbook.bytes as any);
  expect(book.worksheets.map((s) => s.name)).toEqual(['Analysis', 'Source records']);
  expect(book.getWorksheet('Analysis')!.getCell('B3').value).toBe(1);
  expect(book.getWorksheet('Analysis')!.getCell('C18').value).toEqual({
    formula: 'SUM(C13:C17)',
    result: 141000,
  });
  expect(book.getWorksheet('Source records')!.rowCount).toBe(40);
  const zip = await JSZip.loadAsync(deck.bytes);
  expect(
    Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)),
  ).toHaveLength(6);
  expect(await zip.file('ppt/slides/slide2.xml').async('string')).toContain('11.9%');
  const chart = await zip.file('ppt/charts/chart1.xml').async('string');
  expect(chart).toContain('c:barChart');
  expect(chart).toContain('c:externalData');
  expect(
    Object.keys(zip.files).some(
      (name) => name.startsWith('ppt/embeddings/') && name.endsWith('.xlsx'),
    ),
  ).toBe(true);
  const restored = await computer.request('Undo the studio analysis change', signal());
  expect(restored.state.studio?.workspace.result?.currentTotal).toBe(204000);
  expect(restored.state.presentation).toBeNull();
  await expect(computer.studioExport('excel')).rejects.toThrow('Regenerate');
  await expect(computer.action({ tool: 'openPresentation' }, signal())).rejects.toThrow(
    'Create a presentation',
  );
  await computer.request('Create an Excel report', signal());
  const exported = await computer.studioExport('excel');
  await writeFile(path.join(cfg.localDir, 'analysis-workspace', exported.filename), 'changed');
  await expect(computer.studioExport('excel')).rejects.toThrow('changed after export');
});
it('accepts a real plain-value Excel source with correct row references and rejects missing/cached formulas', async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('My source');
  sheet.addRows([
    ['date', 'location_id', 'region', 'revenue', 'operating_start', 'operating_end'],
    ['2026-01-02', 'A', '=1+1', 100, '2025-01-01', ''],
    ['2026-04-02', 'A', '=1+1', 120, '2025-01-01', ''],
  ]);
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  const parsed = await parseStudioFile('my-data.xlsx', bytes);
  expect(parsed.sheet).toBe('My source');
  expect(parsed.dataset.rows[0].region).toBe('=1+1');
  const { computer } = await setup();
  const imported = await computer.importStudio('my-data.xlsx', bytes, signal());
  expect(imported.state.studio?.workspace.result?.percent).toBe(20);
  await computer.request('Create an Excel report', signal());
  const output = new ExcelJS.Workbook();
  await output.xlsx.load((await computer.studioExport('excel')).bytes as any);
  expect(output.getWorksheet('Source records')!.getCell('C2').value).toBe('=1+1');
  expect(output.getWorksheet('Source records')!.getCell('H2').value).toBe('My source row 2');
  sheet.getCell('D2').value = { formula: 'SUM(50,50)', result: 100 };
  await expect(
    parseStudioFile('formula.xlsx', Buffer.from(await book.xlsx.writeBuffer())),
  ).rejects.toThrow('plain source values');
});
it('retains source positions across blank rows and speaks cents without rounding them away', async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('Original sheet');
  sheet.addRows([
    ['date', 'location_id', 'region', 'revenue', 'operating_start', 'operating_end'],
    ['2026-01-02', 'A', 'East', 100.25, '2025-01-01', ''],
    [],
    ['2026-04-02', 'A', 'East', 120.25, '2025-01-01', ''],
  ]);
  const { computer } = await setup();
  const imported = await computer.importStudio(
    'blank-row.xlsx',
    Buffer.from(await book.xlsx.writeBuffer()),
    signal(),
  );
  expect(imported.state.studio?.sourceRows).toEqual([2, 4]);
  const evidence = await computer.request('Show the source rows', signal());
  expect(evidence.state.studio?.evidence[1]).toContain('row 4');
  expect(studioMoney(120.25)).toBe('$120.25');
});
