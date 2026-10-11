import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { StudioAssistant } from '../server/computer/studio-assistant';
import { Databricks } from '../server/providers/databricks';
import { analyzeLocal, parseCsv } from '../shared/analysis';
import type { ComputerState } from '../shared/computer';
import type { StudioState } from '../shared/studio';

const controllers: ComputerController[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const controller of controllers.splice(0)) await controller.close();
});
const signal = () => new AbortController().signal;
const localConfig = () => ({
  ...config(),
  hfToken: '',
  cloudUrl: '',
  dbHost: '',
  dbToken: '',
  dbWarehouse: '',
});
const dataset = () =>
  parseCsv(
    'date,location_id,region,revenue,operating_start,operating_end\n' +
      '2026-01-01,A,East,100.25,2025-01-01,\n' +
      '2026-04-01,A,East,120.25,2025-01-01,',
    'Fictional routing test.csv',
    true,
  );
function assistant() {
  const state: ComputerState = { folder: null, code: null, browser: null, screen: null };
  const exported = vi.fn(
    async (
      _studio: StudioState,
      _kind: 'excel' | 'powerpoint' | 'both',
      _open: boolean,
      _signal: AbortSignal,
    ) => {},
  );
  const studio = new StudioAssistant(localConfig(), state, exported);
  studio.import(dataset());
  return { studio, state, exported };
}

it('verifies explicit Databricks report requests before exporting and does not export failed verification', async () => {
  const { studio, state, exported } = assistant();
  const before = structuredClone(state.studio);
  const verify = vi.spyOn(Databricks.prototype, 'analyze');
  verify.mockRejectedValueOnce(new Error('Warehouse unavailable'));
  await expect(
    studio.request(
      'Verify the studio results with Databricks and create an Excel report',
      signal(),
    ),
  ).rejects.toThrow('Warehouse unavailable');
  expect(exported).not.toHaveBeenCalled();
  expect(state.studio).toEqual(before);

  verify.mockImplementationOnce(async (source, comparison) => ({
    ...analyzeLocal(source, comparison),
    provider: 'databricks',
    queryReference: 'Databricks statement verified-test',
  }));
  exported.mockImplementationOnce(async () => {
    expect(state.studio?.workspace.result?.provider).toBe('databricks');
    expect(state.studio?.revision).toBe(2);
  });
  const result = await studio.request(
    'Verify the studio results with Databricks and create an Excel report',
    signal(),
  );
  expect(result?.state.studio?.workspace.result?.currentTotal).toBe(120.25);
  expect(exported).toHaveBeenCalledTimes(1);
  expect(exported.mock.calls[0]?.[1]).toBe('excel');
});

it('preserves the active analysis after opening a report and leaves image-deck edits to their own workflow', async () => {
  const { studio } = assistant();
  expect(studio.ownsRequest('Create an Excel and PowerPoint report')).toBe(true);
  expect(studio.ownsRequest('Swap the images on slides two and three')).toBe(false);
  expect(studio.ownsRequest('Add a retention step to the final diagram')).toBe(false);
  expect(studio.ownsRequest('Make a PowerPoint about hackathons')).toBe(false);
  expect(await studio.request('Open PowerPoint', signal())).toBeNull();
  expect(studio.active).toBe(true);
  expect(studio.ownsRequest('How did you calculate the growth?')).toBe(true);
});

it('exports the current Studio analysis when an image folder is still selected', async () => {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-studio-routing-'));
  const imageRoot = path.join(localDir, 'Marketing');
  await mkdir(imageRoot);
  await writeFile(path.join(imageRoot, 'photo.png'), Buffer.from('folder image test'));
  const computer = new ComputerController({ ...localConfig(), localDir });
  controllers.push(computer);
  await computer.init();
  await computer.authorizeFolder(
    imageRoot,
    await readFile(path.join(localDir, 'desktop-bridge-key'), 'utf8'),
  );
  await computer.request('Start the analysis demo', signal());
  await computer.request('Compare only the same locations', signal());
  const output = await computer.request('Create an Excel and PowerPoint report', signal());
  expect(output.tool).toBe('studioHelp');
  expect(output.state.presentation?.slideCount).toBe(6);
  expect(output.state.presentation?.project).toBeUndefined();
  expect(output.state.studio?.workspace.result?.currentTotal).toBe(141000);
  expect((await computer.studioExport('excel')).bytes.subarray(0, 2).toString()).toBe('PK');
  expect((await computer.studioExport('powerpoint')).bytes.subarray(0, 2).toString()).toBe('PK');
});
