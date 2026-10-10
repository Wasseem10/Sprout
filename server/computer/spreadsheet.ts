import ExcelJS from 'exceljs';
import { access, lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config.js';
import { analyzeWorkbookOnDatabricks } from '../providers/workbookAnalytics.js';

const demoName = 'sales-demo-synthetic.xlsx';
const currencyHint = /revenue|sales|profit|cost|price|amount|usd|dollars?/i;
const identifierHint = /(?:^|\b)(?:id|code|year|zip|postal)(?:$|\b)/i;
const categoryHint = /region|category|product|department|location|team|group/i;

export async function ensureDemoWorkbook(root: string) {
  const file = path.join(root, demoName);
  try {
    await access(file);
    return;
  } catch {
    // Create a small, clearly labeled synthetic workbook for a voice demo.
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Synthetic sales');
  sheet.addRow(['Month', 'Region', 'Revenue']);
  for (const row of [
    ['January', 'East', 1200],
    ['January', 'West', 900],
    ['January', 'South', 700],
    ['February', 'East', 1500],
    ['February', 'West', 1100],
    ['February', 'South', 800],
  ])
    sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).width = 17;
  sheet.getColumn(2).width = 17;
  sheet.getColumn(3).width = 17;
  sheet.getColumn(3).numFmt = '$#,##0';
  await workbook.xlsx.writeFile(file);
}

function simpleValue(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'result' in value)
    return simpleValue(value.result as ExcelJS.CellValue);
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string')
    return value.text;
  return null;
}

export async function analyzeSpreadsheet(
  root: string,
  question: string,
  requestedName?: string,
  cloud?: { cfg: Config; signal: AbortSignal },
) {
  const useDatabricks =
    /\bdatabricks\b/i.test(question) &&
    !/\b(?:without|avoid|skip|not with|don['’]t use|do not use)\s+(?:using\s+)?databricks\b/i.test(
      question,
    );
  if (useDatabricks && (!cloud?.cfg.dbHost || !cloud.cfg.dbWarehouse || !cloud.cfg.dbToken))
    throw new Error(
      'Connect your Databricks workspace, SQL warehouse ID, and access token in Settings first. I can also analyze the workbook locally.',
    );
  const names = (await readdir(root)).filter((name) => /^[^\\/]+\.xlsx$/i.test(name));
  const filename = requestedName
    ? names.find((name) => name.toLowerCase() === requestedName.toLowerCase())
    : names.length === 1
      ? names[0]
      : undefined;
  if (!filename)
    throw new Error(
      names.length
        ? `Choose a workbook by name. Available: ${names.slice(0, 5).join(', ')}.`
        : 'There is no .xlsx workbook in the selected folder. Add one, then ask again.',
    );
  const file = path.join(root, filename);
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 3 * 1024 * 1024 ||
    (await realpath(file)) !== file
  )
    throw new Error('The workbook must be a regular .xlsx file under 3 MB in the selected folder.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets.find((item) => item.rowCount > 1);
  if (!sheet) throw new Error('The workbook has no populated worksheet to analyze.');
  if (sheet.rowCount > 3001 || sheet.columnCount > 40)
    throw new Error('This prototype analyzes up to 3,000 rows and 40 columns.');
  const headers = Array.from({ length: sheet.columnCount }, (_, col) =>
    String(simpleValue(sheet.getRow(1).getCell(col + 1).value) ?? `Column ${col + 1}`).trim(),
  );
  const rows: (string | number | null)[][] = [];
  for (let row = 2; row <= sheet.rowCount; row++) {
    const values = headers.map((_, col) => simpleValue(sheet.getRow(row).getCell(col + 1).value));
    if (values.some((value) => value !== null && value !== '')) rows.push(values);
  }
  if (!rows.length) throw new Error('The worksheet has headers but no data rows.');
  const numeric = headers
    .map((header, col) => ({
      header,
      col,
      values: rows
        .map((row) => row[col])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    }))
    .filter(
      (item) =>
        item.values.length >= Math.max(1, Math.ceil(rows.length * 0.6)) &&
        !identifierHint.test(item.header),
    );
  const mentioned = numeric.find((item) =>
    item.header
      .split(/\W+/)
      .some((word) => word.length > 2 && new RegExp(`\\b${word}\\b`, 'i').test(question)),
  );
  const measure = mentioned ?? numeric.find((item) => currencyHint.test(item.header)) ?? numeric[0];
  const noun = `${filename}${filename === demoName ? ' (synthetic sample)' : ''}, sheet ${sheet.name}`;
  if (!measure)
    return {
      filename,
      sheet: sheet.name,
      rows: rows.length,
      provider: 'local' as const,
      summary: `${noun} has ${rows.length} data rows and columns: ${headers.join(', ')}. I did not find a mostly numeric measure to total.`,
    };
  const total = measure.values.reduce((sum, value) => sum + value, 0);
  const average = total / measure.values.length;
  const number = (value: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  let summary = `${noun} has ${rows.length} data rows. ${measure.header} totals ${number(total)} across ${measure.values.length} numeric cells; average ${number(average)}.`;
  const categories = headers
    .map((header, col) => ({ header, col }))
    .filter(
      (item) => item.col !== measure.col && rows.some((row) => typeof row[item.col] === 'string'),
    );
  const requestedCategory = categories.find((item) =>
    item.header
      .split(/\W+/)
      .some((word) => word.length > 2 && new RegExp(`\\b${word}\\b`, 'i').test(question)),
  );
  const category = requestedCategory ?? categories.find((item) => categoryHint.test(item.header));
  if (useDatabricks && cloud) {
    const selected = rows.flatMap((row) => {
      const value = row[measure.col];
      const label = category ? row[category.col] : null;
      return typeof value === 'number' && Number.isFinite(value)
        ? [{ value, category: typeof label === 'string' ? label : null }]
        : [];
    });
    const result = await analyzeWorkbookOnDatabricks(selected, cloud.cfg, cloud.signal);
    let cloudSummary = `${noun} has ${rows.length} data rows. Databricks calculated ${measure.header}: total ${number(result.total)} across ${result.count} numeric cells; average ${number(result.average)}.`;
    if (category && result.highest)
      cloudSummary += ` Highest ${category.header}: ${result.highest.category} with ${number(result.highest.total)} ${measure.header}.`;
    return {
      filename,
      sheet: sheet.name,
      rows: rows.length,
      summary: cloudSummary,
      provider: result.provider,
      queryReference: result.queryReference,
    };
  }
  if (category) {
    const groups = new Map<string, number>();
    for (const row of rows) {
      const key = row[category.col];
      const value = row[measure.col];
      if (typeof key === 'string' && typeof value === 'number')
        groups.set(key, (groups.get(key) ?? 0) + value);
    }
    const ranked = [...groups].sort((a, b) => b[1] - a[1]);
    if (ranked.length)
      summary += ` Highest ${category.header}: ${ranked[0][0]} with ${number(ranked[0][1])} ${measure.header}.`;
  }
  return { filename, sheet: sheet.name, rows: rows.length, summary, provider: 'local' as const };
}
