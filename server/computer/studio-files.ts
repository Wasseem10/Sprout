import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { writeFile } from 'node:fs/promises';
import {
  includedStudioRows,
  studioMoney,
  studioPercent,
  studioSummary,
  type StudioState,
} from '../../shared/studio.js';

export async function writeStudioWorkbook(studio: StudioState, file: string) {
  const book = new ExcelJS.Workbook();
  book.creator = 'InsightOS';
  book.calcProperties.fullCalcOnLoad = true;
  const summary = book.addWorksheet('Analysis'),
    data = book.addWorksheet('Source records');
  const r = studio.workspace.result!,
    dataset = studio.workspace.dataset!,
    c = r.comparison;
  summary.addRows([
    ['Quarterly operations analysis', dataset.name],
    ['Source type', dataset.synthetic ? 'Fictional sample records' : 'User-imported records'],
    ['Only continuously operating locations (1 = yes)', Number(c.commonLocations)],
    ['Previous period start', new Date(c.previous.start + 'T00:00:00Z')],
    ['Previous period end', new Date(c.previous.end + 'T00:00:00Z')],
    ['Current period start', new Date(c.current.start + 'T00:00:00Z')],
    ['Current period end', new Date(c.current.end + 'T00:00:00Z')],
    [
      'Calculation source',
      r.provider === 'databricks'
        ? 'Databricks SQL reconciled with source records'
        : 'Local integer-cent calculations',
    ],
    [
      'Chart scope',
      studio.workspace.view.topN
        ? `Top ${studio.workspace.view.topN} by absolute change. Totals include all regions.`
        : 'All included regions',
    ],
    ['Revision', studio.revision],
    [],
    ['Region', c.previous.label, c.current.label, 'Change (USD)', 'Growth'],
  ]);
  data.addRow([
    'Date',
    'Location',
    'Region',
    'Revenue (USD)',
    'Operating start',
    'Operating end',
    'Included',
    'Original row',
  ]);
  const included = includedStudioRows(studio);
  for (const row of included) {
    const n = data.rowCount + 1;
    data.addRow([
      new Date(row.date + 'T00:00:00Z'),
      row.location_id,
      row.region,
      row.revenue,
      new Date(row.operating_start + 'T00:00:00Z'),
      row.operating_end ? new Date(row.operating_end + 'T00:00:00Z') : null,
      {
        formula: `IF(AND(OR(AND(A${n}>=Analysis!$B$4,A${n}<=Analysis!$B$5),AND(A${n}>=Analysis!$B$6,A${n}<=Analysis!$B$7)),OR(Analysis!$B$3=0,AND(E${n}<=Analysis!$B$4,OR(F${n}="",F${n}>=Analysis!$B$7)))),1,0)`,
        result: Number(row.included),
      },
      `${studio.sourceSheet} row ${row.sourceRow}`,
    ]);
  }
  // Keep all source regions in the formula build so changing the coverage control can restore excluded regions.
  const regions = [...new Set(dataset.rows.map((row) => row.region))].sort();
  const last = data.rowCount;
  const amounts = `'Source records'!$D$2:$D$${last}`,
    labels = `'Source records'!$C$2:$C$${last}`;
  const dates = `'Source records'!$A$2:$A$${last}`,
    keep = `'Source records'!$G$2:$G$${last}`;
  for (const region of regions) {
    const n = summary.rowCount + 1,
      values = r.regions.find((group) => group.region === region);
    summary.addRow([
      region,
      {
        formula: `SUMIFS(${amounts},${labels},$A${n},${dates},">="&$B$4,${dates},"<="&$B$5,${keep},1)`,
        result: values?.previous ?? 0,
      },
      {
        formula: `SUMIFS(${amounts},${labels},$A${n},${dates},">="&$B$6,${dates},"<="&$B$7,${keep},1)`,
        result: values?.current ?? 0,
      },
      { formula: `C${n}-B${n}`, result: values?.delta ?? 0 },
      {
        formula: `IF(B${n}=0,"Undefined",D${n}/ABS(B${n}))`,
        result: values?.percent === null || !values ? 'Undefined' : values.percent / 100,
      },
    ]);
  }
  const lastGroup = summary.rowCount,
    total = lastGroup + 1;
  summary.addRow([
    'Total',
    { formula: `SUM(B13:B${lastGroup})`, result: r.previousTotal },
    { formula: `SUM(C13:C${lastGroup})`, result: r.currentTotal },
    { formula: `C${total}-B${total}`, result: r.currentTotal - r.previousTotal },
    {
      formula: `IF(B${total}=0,"Undefined",D${total}/ABS(B${total}))`,
      result: r.percent === null ? 'Undefined' : r.percent / 100,
    },
  ]);
  summary.addRow([]);
  summary.addRow([
    'Definition',
    'Same locations means operating continuously from the previous period start to the current period end. This does not establish why revenue changed.',
  ]);
  summary.addRow([
    'Report behavior',
    'Excel formulas recalculate after edits in Excel. PowerPoint is a snapshot of the exported analysis revision.',
  ]);
  summary.getCell('B3').dataValidation = {
    type: 'whole',
    operator: 'between',
    formulae: [0, 1],
    showErrorMessage: true,
    error: 'Choose 0 for all locations or 1 for continuous locations.',
  };
  summary.getCell('B3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EEFF' } };
  for (const n of [4, 5, 6, 7]) summary.getCell(n, 2).numFmt = 'mm/dd/yyyy';
  for (let n = 13; n <= total; n++) {
    for (const col of [2, 3, 4]) summary.getCell(n, col).numFmt = '$#,##0.00;[Red]-$#,##0.00';
    summary.getCell(n, 5).numFmt = '0.0%';
  }
  summary.columns = [{ width: 51 }, { width: 43 }, { width: 23 }, { width: 23 }, { width: 20 }];
  summary.views = [{ state: 'frozen', ySplit: 12 }];
  data.columns.forEach((col) => {
    col.width = 22;
  });
  data.getColumn(8).width = 35;
  for (const col of [1, 5, 6]) data.getColumn(col).numFmt = 'mm/dd/yyyy';
  data.getColumn(4).numFmt = '$#,##0.00';
  data.autoFilter = `A1:H${last}`;
  data.views = [{ state: 'frozen', ySplit: 1 }];
  data.getCell('J1').value = 'Calculation reference';
  data.getCell('J2').value = r.queryReference;
  data.getColumn(10).width = 95;
  data.getCell('J2').alignment = { wrapText: true, vertical: 'top' };
  for (const sheet of [summary, data]) {
    sheet.eachRow((row) => {
      row.height = 25;
      row.font = { name: 'Aptos', size: 12 };
    });
    const header = sheet.getRow(sheet === summary ? 12 : 1);
    header.height = 32;
    header.eachCell((cell) => {
      cell.font = { name: 'Aptos', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16365E' } };
    });
  }
  summary.getRow(1).font = { name: 'Aptos', size: 17, bold: true };
  summary.getCell('B1').font = { name: 'Aptos', size: 12 };
  summary.getCell('B1').alignment = { wrapText: true, vertical: 'middle' };
  summary.getRow(1).height = 45;
  summary.getRow(total).font = { name: 'Aptos', size: 12, bold: true };
  for (const n of [8, 9, total + 2, total + 3]) {
    summary.getRow(n).height = 85;
    summary.getCell(n, 2).alignment = { wrapText: true, vertical: 'top' };
  }
  await writeFile(file, Buffer.from(await book.xlsx.writeBuffer()), { flag: 'wx', mode: 0o600 });
}

export async function writeStudioPresentation(studio: StudioState, file: string) {
  const pptx = new (PptxGenJS as unknown as new () => any)();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'InsightOS';
  pptx.title = 'Quarterly operations review';
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' };
  const r = studio.workspace.result!,
    dataset = studio.workspace.dataset!;
  const white = 'F4F8FF',
    blue = '85B9FF',
    muted = 'BDD0E9',
    navy = '0C1830';
  const source = `${dataset.synthetic ? 'Fictional sample. ' : ''}${dataset.name}. Revision ${studio.revision}. ${r.comparison.commonLocations ? 'Continuous locations only.' : 'All reported locations.'}`;
  const add = (title: string) => {
    const slide = pptx.addSlide();
    slide.background = { color: navy };
    slide.addText(title, {
      x: 0.7,
      y: 0.55,
      w: 11.9,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: white,
      margin: 0,
    });
    slide.addText(source, {
      x: 0.7,
      y: 6.88,
      w: 11.9,
      h: 0.34,
      fontSize: 12,
      color: muted,
      margin: 0,
    });
    slide.addNotes(`${source}\n${r.calculation}\n${r.queryReference}\n${studioSummary(studio)}`);
    return slide;
  };
  const cover = add('Quarterly operations review');
  cover.addText(`${r.comparison.previous.label} compared with ${r.comparison.current.label}`, {
    x: 0.7,
    y: 2,
    w: 11.8,
    h: 0.9,
    fontSize: 42,
    color: white,
    bold: true,
    margin: 0,
  });
  cover.addText(
    `${r.comparison.commonLocations ? 'Continuously operating locations' : 'All reported locations'}\n${r.includedLocations} locations and ${r.includedRows} contributing records`,
    { x: 0.7, y: 3.4, w: 11.8, h: 1.3, fontSize: 25, color: muted, margin: 0 },
  );
  const findings = add('Revenue comparison');
  findings.addText(studioPercent(r.percent), {
    x: 0.7,
    y: 1.8,
    w: 11.8,
    h: 1.6,
    fontSize: 72,
    bold: true,
    color: blue,
    margin: 0,
  });
  findings.addText(
    `Revenue change between the selected periods\n${studioMoney(r.previousTotal)} compared with ${studioMoney(r.currentTotal)}\nDifference: ${studioMoney(r.currentTotal - r.previousTotal)}`,
    { x: 0.7, y: 3.65, w: 11.8, h: 2.0, fontSize: 25, color: white, margin: 0, breakLine: false },
  );
  const groups = r.regions.slice(0, studio.workspace.view.topN ?? r.regions.length).slice(0, 10);
  const chart = add('Regional revenue');
  if (groups.length)
    chart.addChart(
      pptx.ChartType.bar,
      [
        {
          name: r.comparison.previous.label,
          labels: groups.map((g) => g.region),
          values: groups.map((g) => g.previous),
        },
        {
          name: r.comparison.current.label,
          labels: groups.map((g) => g.region),
          values: groups.map((g) => g.current),
        },
      ],
      {
        x: 0.7,
        y: 1.65,
        w: 11.8,
        h: 4.65,
        catAxisLabelColor: white,
        catAxisLabelFontSize: 17,
        valAxisLabelColor: white,
        valAxisLabelFontSize: 14,
        valAxisTitle: 'Revenue (USD)',
        showValue: false,
        showLegend: true,
        legendColor: white,
        legendFontSize: 17,
        chartColors: ['557BAA', blue],
        showCatName: false,
        showTitle: false,
        showBorder: false,
        catAxisLineColor: muted,
        valAxisLineColor: muted,
        valGridLine: { color: '33435D' },
        valAxisMinVal: Math.min(0, ...groups.flatMap((g) => [g.previous, g.current])),
        showShadow: false,
        showSerName: false,
        gapSize: 65,
        grouping: 'clustered',
        altText: groups
          .map(
            (g) =>
              `${g.region}: ${studioMoney(g.previous)} to ${studioMoney(g.current)}, change ${studioPercent(g.percent)}.`,
          )
          .join(' '),
      },
    );
  else
    chart.addText('No source rows match the selected coverage.', {
      x: 0.7,
      y: 2.4,
      w: 11.8,
      h: 1.5,
      fontSize: 28,
      color: white,
    });
  chart.addText(
    `${groups.length} regions shown, ranked by absolute change. Totals cover all included regions.`,
    { x: 0.7, y: 6.35, w: 11.8, h: 0.4, fontSize: 15, color: muted, margin: 0 },
  );
  const coverage = add('Analysis coverage');
  const lines = [
    `All reported locations: ${studioPercent(studio.baseline.percent)} growth`,
    `Selected coverage: ${studioPercent(r.percent)} growth`,
    `${r.excludedLocations} locations excluded from the selected coverage`,
    'Coverage changes the comparison. These records do not establish the cause.',
  ];
  lines.forEach((line, i) =>
    coverage.addText(line, {
      x: 0.7,
      y: 1.8 + i * 1.06,
      w: 11.8,
      h: 0.85,
      fontSize: i < 2 ? 29 : 23,
      color: i === 1 ? blue : white,
      margin: 0,
    }),
  );
  const evidence = add('Source evidence');
  const rows = includedStudioRows(studio)
    .filter((row) => row.included)
    .slice(0, 6);
  evidence.addTable(
    [
      [
        { text: 'Original row', options: { bold: true } },
        { text: 'Location', options: { bold: true } },
        { text: 'Date', options: { bold: true } },
        { text: 'Revenue (USD)', options: { bold: true } },
      ],
      ...rows.map((row) => [
        String(row.sourceRow),
        row.location_id,
        row.date,
        studioMoney(row.revenue),
      ]),
    ],
    {
      x: 0.7,
      y: 1.7,
      w: 11.8,
      colW: [2.1, 3.5, 3.0, 3.2],
      rowH: 0.5,
      fontSize: 18,
      color: white,
      fill: navy,
      border: { type: 'solid', color: '33435D', pt: 1 },
      margin: 0.12,
      autoPage: false,
    },
  );
  evidence.addText(
    `First ${rows.length} of ${r.includedRows} contributing records. The Excel workbook contains every source row and the inclusion formulas.`,
    { x: 0.7, y: 5.7, w: 11.8, h: 0.8, fontSize: 20, color: muted, margin: 0 },
  );
  const next = add('Questions for the team');
  [
    'Which coverage matches the decision we need to make?',
    'What additional evidence could explain the regional changes?',
    'Which source records should we review before presenting a conclusion?',
  ].forEach((line, i) =>
    next.addText(line, {
      x: 0.7,
      y: 1.85 + i * 1.25,
      w: 11.8,
      h: 0.95,
      fontSize: 28,
      color: white,
      margin: 0,
    }),
  );
  await writeFile(file, Buffer.from(await pptx.write({ outputType: 'nodebuffer' })), {
    flag: 'wx',
    mode: 0o600,
  });
}
