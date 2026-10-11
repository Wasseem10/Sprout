import { describe, expect, it } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { validateFlowchart, type Flowchart } from '../shared/presentation-flowchart';
import { layoutFlowchart } from '../server/computer/presentation-flowchart-layout';
import {
  finalizeFlowchartPptx,
  renderFlowchartScene,
} from '../server/computer/presentation-flowchart-render';

const graph = (): Flowchart =>
  validateFlowchart({
    orientation: 'vertical',
    nodes: [
      { id: 'start', kind: 'start', label: 'Start' },
      { id: 'decision', kind: 'decision', label: 'Campaign approval' },
      { id: 'launch', kind: 'process', label: 'Share the approved campaign with local residents' },
      { id: 'revise', kind: 'process', label: 'Revise' },
      { id: 'record', kind: 'process', label: 'Record outcome' },
      { id: 'finish', kind: 'end', label: 'Finish' },
    ],
    edges: [
      { id: 'e0', from: 'start', to: 'decision' },
      { id: 'e1', from: 'decision', to: 'launch', branchLabel: 'Approved' },
      { id: 'e2', from: 'decision', to: 'revise', branchLabel: 'Rejected' },
      { id: 'e3', from: 'launch', to: 'record' },
      { id: 'e4', from: 'revise', to: 'record' },
      { id: 'e5', from: 'record', to: 'finish' },
    ],
  });
const emu = (inches: number) => Math.round(inches * 914400);
const xmlEscape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
async function exported(theme: 'blue' | 'dark' = 'blue', input = graph()) {
  const scene = layoutFlowchart(input, {
    slideId: 'flow1',
    title: 'Campaign approval process',
    theme,
  });
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'SCENE', width: scene.width, height: scene.height });
  pptx.layout = 'SCENE';
  const slide = pptx.addSlide();
  const receipt = renderFlowchartScene(slide, scene);
  slide.addShape('rect', {
    x: 0.5,
    y: 7.1,
    w: 0.2,
    h: 0.1,
    objectName: 'Unrelated existing shape',
  });
  const candidate = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  const final = await finalizeFlowchartPptx(candidate, [receipt]);
  return { scene, receipt, candidate, final, zip: await JSZip.loadAsync(final) };
}

describe('native PowerPoint rendering of the shared measured flowchart scene', () => {
  it.each(['blue', 'dark'] as const)(
    'preserves measured shape/text/path geometry and editability in %s',
    async (theme) => {
      const { scene, receipt, zip } = await exported(theme);
      const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
      const objects = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((match) => match[0]);
      expect(objects).toHaveLength(scene.elements.length + 1);
      expect(xml).not.toContain('<p:pic>');
      expect(Object.keys(zip.files).filter((name) => /^ppt\/media\/.+/.test(name))).toHaveLength(0);
      for (const [index, metadata] of receipt.objects.entries()) {
        const block = objects[index];
        const element = scene.elements.find((item) => item.id === metadata.sceneElementId)!;
        expect(block).toContain(`name="${xmlEscape(metadata.objectName)}"`);
        expect(block).toContain(`descr="${xmlEscape(metadata.altText)}"`);
        const offset = block.match(/<a:off x="(\d+)" y="(\d+)"/)!;
        const extent = block.match(/<a:ext cx="(\d+)" cy="(\d+)"/)!;
        if (element.kind === 'connector') {
          expect(block).toContain('<a:custGeom>');
          expect(block).toContain('<a:tailEnd type="triangle"/>');
          const points = [...block.matchAll(/<a:pt x="(\d+)" y="(\d+)"/g)];
          expect(points).toHaveLength(element.points.length);
          points.forEach((point, i) => {
            expect(
              Math.abs(Number(offset[1]) + Number(point[1]) - emu(element.points[i].x)),
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(Number(offset[2]) + Number(point[2]) - emu(element.points[i].y)),
            ).toBeLessThanOrEqual(1);
          });
        } else {
          expect([
            Number(offset[1]),
            Number(offset[2]),
            Number(extent[1]),
            Number(extent[2]),
          ]).toEqual(
            [element.bounds.x, element.bounds.y, element.bounds.width, element.bounds.height].map(
              emu,
            ),
          );
          if (element.kind === 'shape')
            expect(block).toContain(`<a:prstGeom prst="${element.geometry}">`);
          else {
            const text = [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]);
            expect(text).toEqual(element.lines.map((line) => xmlEscape(line.text)));
            expect(block).toContain(`sz="${Math.round(element.font.sizePt * 100)}"`);
            expect(block).toContain('typeface="Arial"');
            expect(block).toContain('wrap="none"');
            expect(block).not.toContain('normAutofit');
            expect(block).toContain(`<a:spcPts val="${Math.round(element.lineHeight * 7200)}"/>`);
          }
        }
      }
      expect(receipt.objects.map((object) => object.sceneElementId)).toEqual(scene.readingOrder);
      expect(receipt.objects.filter((object) => object.kind === 'connector')).toHaveLength(
        scene.elements.filter((element) => element.kind === 'connector').length,
      );
    },
  );
  it('requires explicit accessibility finalization and preserves unrelated package parts/objects', async () => {
    const { candidate, final, receipt } = await exported();
    const before = await JSZip.loadAsync(candidate),
      after = await JSZip.loadAsync(final);
    const originalXml = await before.file('ppt/slides/slide1.xml')!.async('string');
    const finalXml = await after.file('ppt/slides/slide1.xml')!.async('string');
    expect(receipt.requiresAccessibilityFinalization).toBe(true);
    expect(originalXml).not.toContain(`descr="${xmlEscape(receipt.objects[0].altText)}"`);
    expect(finalXml.match(/<p:cNvPr\b[^>]*name="Unrelated existing shape"[^>]*>/)?.[0]).toBe(
      originalXml.match(/<p:cNvPr\b[^>]*name="Unrelated existing shape"[^>]*>/)?.[0],
    );
    for (const filename of Object.keys(before.files).filter(
      (name) => !before.files[name].dir && name !== 'ppt/slides/slide1.xml',
    ))
      expect(await after.file(filename)!.async('nodebuffer')).toEqual(
        await before.file(filename)!.async('nodebuffer'),
      );
  });
  it('escapes labels once in editable text and alt descriptions', async () => {
    const input = graph();
    input.nodes.find((node) => node.id === 'revise')!.label = 'Revise "A&B" <draft>';
    const { zip } = await exported('blue', input);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('descr="Revise &quot;A&amp;B&quot; &lt;draft&gt;"');
    expect(xml).not.toContain('&amp;amp;');
  });
  it('removes only missing master declarations from a multi-slide export', async () => {
    const pptx = new PptxGenJS();
    const scenes = [1, 2, 3].map((index) =>
      layoutFlowchart(graph(), { slideId: `flow${index}`, title: 'Campaign approval process' }),
    );
    pptx.defineLayout({ name: 'SCENE', width: scenes[0].width, height: scenes[0].height });
    pptx.layout = 'SCENE';
    const receipts = scenes.map((scene) => renderFlowchartScene(pptx.addSlide(), scene));
    const candidate = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const before = await JSZip.loadAsync(candidate);
    const after = await JSZip.loadAsync(await finalizeFlowchartPptx(candidate, receipts));
    const types = await after.file('[Content_Types].xml')!.async('string');
    for (const match of types.matchAll(/<Override\b[^>]*\bPartName="([^"]+)"[^>]*\/>/g))
      expect(after.file(match[1].slice(1))).not.toBeNull();
    for (const filename of Object.keys(before.files).filter(
      (name) =>
        !before.files[name].dir &&
        name !== '[Content_Types].xml' &&
        !/^ppt\/slides\/slide\d+\.xml$/.test(name),
    ))
      expect(await after.file(filename)!.async('nodebuffer')).toEqual(
        await before.file(filename)!.async('nodebuffer'),
      );
  });
  it('refuses invalid scene geometry before adding any objects', () => {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    const scene = layoutFlowchart(graph(), { slideId: 'invalid', title: 'Invalid geometry' });
    const calls = { shapes: 0, texts: 0 };
    const originalShape = slide.addShape.bind(slide),
      originalText = slide.addText.bind(slide);
    slide.addShape = (...args) => {
      calls.shapes++;
      return originalShape(...args);
    };
    slide.addText = (...args) => {
      calls.texts++;
      return originalText(...args);
    };
    const element = scene.elements.find((element) => element.kind === 'shape')!;
    if (element.kind === 'shape') element.bounds.y = -1;
    expect(() => renderFlowchartScene(slide, scene)).toThrow();
    expect(calls).toEqual({ shapes: 0, texts: 0 });
  });
  it('rejects missing or repeated named objects and mismatched slide dimensions', async () => {
    const { candidate, receipt } = await exported();
    await expect(finalizeFlowchartPptx(candidate, [{ ...receipt, width: 10 }])).rejects.toThrow(
      'slide size',
    );
    await expect(finalizeFlowchartPptx(candidate, [receipt, receipt])).rejects.toThrow(
      'globally unique',
    );
    const missing = structuredClone(receipt);
    missing.objects[0].objectName = 'Absent named shape';
    await expect(finalizeFlowchartPptx(candidate, [missing])).rejects.toThrow('missing a named');
    const duplicateZip = await JSZip.loadAsync(candidate);
    duplicateZip.file(
      'ppt/slides/slide2.xml',
      await duplicateZip.file('ppt/slides/slide1.xml')!.async('string'),
    );
    await expect(
      finalizeFlowchartPptx(await duplicateZip.generateAsync({ type: 'nodebuffer' }), [receipt]),
    ).rejects.toThrow('more than once');
  });
});
