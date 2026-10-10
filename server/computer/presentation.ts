import PptxGenJS from 'pptxgenjs';
import { z } from 'zod';
import type { Config } from '../config.js';
import { chat } from './planner.js';

const outlineSchema = z.object({
  title: z.string().trim().min(3).max(90),
  subtitle: z.string().trim().min(3).max(150),
  slides: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(90),
        points: z.array(z.string().trim().min(5).max(160)).min(2).max(4),
      }),
    )
    .min(2)
    .max(8),
});
export type PresentationOutline = z.infer<typeof outlineSchema>;

export async function generatePresentationOutline(
  request: string,
  slideCount: number,
  cfg: Config,
  signal: AbortSignal,
): Promise<PresentationOutline> {
  if (!cfg.hfToken) throw new Error('Presentation creation needs Hugging Face connected.');
  const system = `Create an editable ${slideCount}-slide PowerPoint outline for the user's topic. Return ONLY one JSON object in this exact shape: {"title":"Short title","subtitle":"One sentence","slides":[{"title":"Section title","points":["Specific point one","Specific point two"]}]}. The cover is title/subtitle; slides must contain exactly ${slideCount - 1} content slides. Each content slide has title and 2-4 short points. Write concrete, plain language suitable for spoken reading. Do not invent statistics, dates, quotes, studies, sources, or facts the user did not provide. If the topic lacks evidence, use a practical overview and label suggestions as suggestions. No Markdown, instructions to the assistant, code, or links.`;
  let lastIssue = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(
      cfg,
      system +
        (attempt
          ? ` The previous response did not have exactly ${slideCount - 1} content slides. Correct the count.`
          : ''),
      request,
      signal,
    );
    try {
      const candidate = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(candidate.slides))
        candidate.slides = candidate.slides.map((slide) => {
          if (!slide || typeof slide !== 'object') return slide;
          const item = slide as Record<string, unknown>;
          return { ...item, points: item.points ?? item.bullets ?? item.keyPoints ?? item.content };
        });
      const parsed = outlineSchema.safeParse(candidate);
      if (!parsed.success) {
        lastIssue = parsed.error.issues
          .map((issue) => issue.path.join('.') + ': ' + issue.message)
          .slice(0, 3)
          .join('; ');
      } else if (parsed.data.slides.length >= slideCount - 1) {
        return { ...parsed.data, slides: parsed.data.slides.slice(0, slideCount - 1) };
      } else {
        lastIssue = `only ${parsed.data.slides.length} content slides`;
      }
    } catch {
      lastIssue = 'response was not valid JSON';
    }
  }
  throw new Error(
    `The presentation model did not return a valid outline (${lastIssue}). No deck was created.`,
  );
}

export async function writePresentation(outline: PresentationOutline, file: string) {
  // The package's CommonJS type export is read as a namespace by NodeNext;
  // the runtime default export is the constructor.
  const pptx = new (PptxGenJS as unknown as new () => any)();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'InsightOS';
  pptx.subject = 'Editable presentation created by InsightOS';
  pptx.title = outline.title;
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };
  const navy = '101A30',
    white = 'F8FAFF',
    cyan = '73E5DF',
    muted = 'CFD8E8';
  const cover = pptx.addSlide();
  cover.background = { color: navy };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.65,
    y: 0.8,
    w: 0.11,
    h: 5.8,
    line: { color: cyan },
    fill: { color: cyan },
  });
  cover.addText('INSIGHTOS PRESENTATION', {
    x: 1.05,
    y: 1.05,
    w: 10.9,
    h: 0.4,
    fontFace: 'Aptos',
    fontSize: 16,
    bold: true,
    color: cyan,
    charSpacing: 2,
    margin: 0,
  });
  cover.addText(outline.title, {
    x: 1.05,
    y: 2.0,
    w: 11.2,
    h: 2.2,
    fontFace: 'Aptos Display',
    fontSize: 38,
    bold: true,
    color: white,
    breakLine: false,
    margin: 0,
    valign: 'middle',
  });
  cover.addText(outline.subtitle, {
    x: 1.05,
    y: 5.1,
    w: 10.7,
    h: 0.9,
    fontFace: 'Aptos',
    fontSize: 21,
    color: muted,
    margin: 0,
    valign: 'middle',
  });
  outline.slides.forEach((section, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: navy };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.72,
      y: 0.58,
      w: 0.78,
      h: 0.08,
      line: { color: cyan },
      fill: { color: cyan },
    });
    slide.addText(section.title, {
      x: 0.72,
      y: 1.02,
      w: 11.75,
      h: 0.9,
      fontFace: 'Aptos Display',
      fontSize: 32,
      bold: true,
      color: white,
      margin: 0,
    });
    section.points.forEach((point, item) => {
      const y = 2.25 + item * 1.05;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 0.78,
        y: y + 0.17,
        w: 0.17,
        h: 0.17,
        line: { color: cyan },
        fill: { color: cyan },
      });
      slide.addText(point, {
        x: 1.18,
        y,
        w: 11.25,
        h: 0.9,
        fontFace: 'Aptos',
        fontSize: point.length > 120 ? 18 : point.length > 85 ? 20 : 22,
        color: white,
        margin: 0,
        breakLine: false,
        valign: 'middle',
      });
    });
    slide.addText(`${index + 2} / ${outline.slides.length + 1}`, {
      x: 11.75,
      y: 7.02,
      w: 0.8,
      h: 0.2,
      align: 'right',
      fontFace: 'Aptos',
      fontSize: 10,
      color: muted,
      margin: 0,
    });
  });
  await pptx.writeFile({ fileName: file });
}
