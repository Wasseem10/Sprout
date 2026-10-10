import { readdir, lstat, realpath, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Config } from '../config.js';
import type { ComputerResult, ComputerState } from '../../shared/computer.js';
import {
  billFields,
  billLabels,
  billValuesSchema,
  checkBillValues,
  newBillWorkspace,
  type BillValues,
  type BillDocument,
} from '../../shared/bills.js';
import { newEnergyState, billNarration, money } from './energy.js';
import { readBillDocument } from './bill-documents.js';

type Candidate = { file: string; size: number; mtime: number };
function spokenNumber(text: string) {
  const numeric = text.match(/^\$?\s*(\d[\d,]*(?:\.\d+)?)/);
  if (numeric) return Number(numeric[1].replace(/,/g, ''));
  const small: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  const words = text.toLowerCase().replace(/-/g, ' ').split(/\s+/);
  let total = 0,
    group = 0,
    seen = false;
  for (const word of words) {
    if (word === 'and') continue;
    if (small[word] !== undefined) {
      group += small[word];
      seen = true;
    } else if (word === 'hundred' && seen) group *= 100;
    else if (word === 'thousand' && seen) {
      total += group * 1000;
      group = 0;
    } else break;
  }
  return seen ? total + group : undefined;
}
export class BillAssistant {
  private files = new Map<string, Candidate>();
  constructor(
    private cfg: Config,
    private state: ComputerState,
    private root: () => string | null,
    private downloads = path.join(homedir(), 'Downloads'),
  ) {}
  private workspace() {
    return (this.state.bills ??= newBillWorkspace());
  }
  private answer(summary: string): ComputerResult {
    this.state.task = {
      id:
        this.state.task?.goal === 'Understand electricity bills'
          ? this.state.task.id
          : crypto.randomUUID(),
      goal: 'Understand electricity bills',
      status: 'waiting',
      message: summary.slice(0, 180),
      steps: [],
    };
    return {
      tool: 'energyHelp',
      summary,
      spokenSummary: summary,
      state: structuredClone(this.state),
      clarification: true,
    };
  }
  private review(doc: BillDocument) {
    const v = doc.values;
    const missing = billFields.filter((f) => v[f] === undefined);
    const month = v.month
      ? new Date(`${v.month}-02T12:00:00Z`).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : 'The billing month is missing';
    return `${doc.synthetic ? 'This is a sample bill. ' : ''}${month}: ${v.kwh === undefined ? 'usage is missing' : `${v.kwh} kilowatt-hours`}, ${v.days === undefined ? 'billing days are missing' : `${v.days} days`}, ${v.total === undefined ? 'total is missing' : `${money(v.total)} current charges`}. ${v.energyCharge === undefined ? '' : `Energy charges are ${money(v.energyCharge)}. `}${v.otherCharges === undefined ? '' : `Other current charges are ${money(v.otherCharges)}. `}${missing.length ? `Please provide ${missing.map((f) => billLabels[f]).join(', ')}.` : 'Are those numbers correct? Say “confirm this bill,” or correct a field.'}`;
  }
  async import(filename: string, bytes: Buffer, signal: AbortSignal) {
    const workspace = this.workspace();
    if (workspace.documents.length >= 4)
      throw new Error('Computer clear the bill documents before importing more than four.');
    const doc = await readBillDocument(
      path.basename(filename).slice(0, 160),
      bytes,
      this.cfg,
      signal,
    );
    signal.throwIfAborted();
    workspace.documents.push(doc);
    workspace.reviewId = doc.id;
    workspace.export = null;
    workspace.pendingReadIds = [];
    this.state.energy = null;
    return this.answer(this.review(doc));
  }
  async discover(sample: boolean, selected: boolean, two: boolean) {
    const workspace = this.workspace();
    const root = sample ? path.resolve('data/bills') : selected ? this.root() : this.downloads;
    if (!root)
      return this.answer(
        'Choose a folder with the native folder picker, or say “find my electricity bills in Downloads.”',
      );
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      return this.answer(
        'I could not open that folder. You can choose your bills with the Choose bills button.',
      );
    }
    this.files.clear();
    const matches: { id: string; filename: string; size: number; modifiedAt: string }[] = [];
    for (const name of names.slice(0, 1500)) {
      if (
        !/\.(?:pdf|png|jpe?g)$/i.test(name) ||
        (!sample && !selected && !/bill|utility|electric|energy|statement|ouc|duke|fpl/i.test(name))
      )
        continue;
      const file = path.join(root, name),
        info = await lstat(file);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size > 5 * 1024 * 1024 ||
        path.relative(await realpath(root), await realpath(file)).startsWith('..')
      )
        continue;
      const id = crypto.randomUUID();
      this.files.set(id, { file, size: info.size, mtime: info.mtimeMs });
      matches.push({ id, filename: name, size: info.size, modifiedAt: info.mtime.toISOString() });
    }
    matches.sort((a, b) =>
      sample ? b.filename.localeCompare(a.filename) : b.modifiedAt.localeCompare(a.modifiedAt),
    );
    workspace.candidates = matches.slice(0, 6);
    workspace.location = sample ? 'Sample bills' : selected ? 'Selected folder' : 'Downloads';
    workspace.pendingReadIds = workspace.candidates.slice(0, two ? 2 : 1).map((c) => c.id);
    if (!matches.length)
      return this.answer(
        'I did not find a matching bill PDF or image. Choose bills directly, or rename them to include “electricity bill” and try Downloads again.',
      );
    const picked = workspace.candidates.filter((c) => workspace.pendingReadIds.includes(c.id));
    return this.answer(
      `I found ${picked.map((c) => c.filename.replace(/\.pdf|\.png|\.jpe?g/gi, '').replace(/[-_]/g, ' ')).join(' and ')} in ${workspace.location}. ${sample ? 'They are synthetic sample documents. ' : ''}Shall I read ${picked.length === 1 ? 'it' : 'both'}?`,
    );
  }
  async readPending(signal: AbortSignal) {
    const workspace = this.workspace();
    const ids = [...workspace.pendingReadIds];
    if (!ids.length)
      return this.answer(
        'First ask me to find your electricity bills in Downloads, or choose a PDF.',
      );
    if (workspace.documents.length + ids.length > 4)
      return this.answer('Clear the current bills before reading more than four documents.');
    // Read and validate all selected files before changing the active analysis.
    const documents: BillDocument[] = [];
    for (const id of ids) {
      signal.throwIfAborted();
      const candidate = this.files.get(id);
      if (!candidate)
        throw new Error('Computer bill selection expired. Find your saved bills again.');
      const info = await lstat(candidate.file);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size !== candidate.size ||
        info.mtimeMs !== candidate.mtime ||
        (await realpath(candidate.file)) !== candidate.file
      )
        throw new Error(
          'Computer bill file changed. Find your saved bills again before reading it.',
        );
      documents.push(
        await readBillDocument(
          path.basename(candidate.file),
          await readFile(candidate.file),
          this.cfg,
          signal,
        ),
      );
    }
    signal.throwIfAborted();
    workspace.documents.push(...documents);
    workspace.pendingReadIds = [];
    workspace.candidates = [];
    workspace.reviewId = documents[0].id;
    workspace.export = null;
    this.state.energy = null;
    return this.answer(
      `${documents.length > 1 ? `I read ${documents.length} bills. Let's check the first. ` : ''}${this.review(documents[0])}`,
    );
  }
  async confirm(id: string, values?: BillValues) {
    const workspace = this.workspace(),
      doc = workspace.documents.find((d) => d.id === id);
    if (!doc) throw new Error('Computer this bill is no longer available.');
    const proposed = values ? billValuesSchema.parse(values) : doc.values;
    const errors = checkBillValues(proposed);
    if (errors.length)
      return this.answer(
        `${errors.join(' ')} You can correct a value by saying “usage is 1200,” or edit the fields.`,
      );
    const duplicate = workspace.documents.find(
      (d) => d.id !== id && d.confirmed && d.values.month === proposed.month,
    );
    if (duplicate)
      return this.answer(
        'These bills have the same billing month. Correct the month or remove the duplicate before comparing.',
      );
    if (values)
      doc.correctedFields = [
        ...new Set([
          ...(doc.correctedFields ?? []),
          ...billFields.filter((field) => values[field] !== doc.values[field]),
        ]),
      ];
    doc.values = proposed;
    doc.confirmed = true;
    doc.warnings = doc.warnings.filter((w) => w.startsWith('Image extraction'));
    workspace.export = null;
    const next = workspace.documents.find((d) => !d.confirmed);
    workspace.reviewId = next?.id ?? null;
    if (next) return this.answer(`Confirmed. Now the next bill. ${this.review(next)}`);
    const confirmed = workspace.documents.filter((d) => d.confirmed);
    if (confirmed.length < 2)
      return this.answer(
        'Confirmed. Add the previous month’s bill to compare, or say “find my latest two electricity bills in Downloads.”',
      );
    const synthetic = confirmed.every((d) => d.synthetic);
    this.state.energy = newEnergyState(
      confirmed.map((d) => {
        const { total: _total, ...bill } = billValuesSchema.parse(d.values);
        return bill;
      }),
      confirmed
        .map((d) => d.filename)
        .join(' + ')
        .slice(0, 160),
      synthetic ? 'synthetic' : 'imported',
    );
    const c = this.state.energy.comparison;
    return this.answer(
      `Both bills are confirmed. Your current bill ${c.billChange >= 0 ? 'rose' : 'fell'} by ${money(Math.abs(c.billChange))}. ${money(c.usageEffect)} of the change comes from usage, ${money(c.rateEffect)} from the effective energy rate, and ${money(c.otherEffect)} from other charges. What monthly improvement payment could you afford?`,
    );
  }
  async request(request: string, signal: AbortSignal): Promise<ComputerResult | null> {
    const text = request.trim(),
      workspace = this.state.bills;
    const reopen = text.match(/\b(?:review|correct|edit)\s+(?:the\s+)?bill\s+(\d{4}-\d{2})\b/i);
    if (reopen && workspace) {
      const bill = workspace.documents.find((d) => d.values.month === reopen[1]);
      if (!bill)
        return this.answer(
          'I do not have that billing month. Which of your saved documents should I review?',
        );
      workspace.reviewId = bill.id;
      bill.confirmed = false;
      workspace.export = null;
      this.state.energy = null;
      return this.answer(`Let's review that bill. ${this.review(bill)}`);
    }
    if (/\b(?:clear|reset|remove all)\b.*\b(?:bill|document)s?\b/i.test(text)) {
      this.state.bills = newBillWorkspace();
      this.state.energy = null;
      this.files.clear();
      return this.answer('Cleared the bill workspace. Your original files are unchanged.');
    }
    if (
      /\b(?:try|read|find|use|open|load)\b.*\b(?:sample|demo)\b.*\b(?:pdf|document|bill)s?\b/i.test(
        text,
      ) &&
      !/energy demo/i.test(text)
    ) {
      this.state.bills = newBillWorkspace();
      this.state.energy = null;
      return this.discover(true, false, true);
    }
    if (
      (/\b(?:find|read|open|compare|analy[sz]e)\b/i.test(text) &&
        /\b(?:bill|pdf)s?\b/i.test(text) &&
        /\b(?:downloads|saved|folder|computer|latest)\b/i.test(text)) ||
      /\bdownloads\b.*\bbills?\b/i.test(text)
    ) {
      return this.discover(
        false,
        /selected folder|chosen folder/i.test(text),
        /\btwo|both|compare|bills\b/i.test(text),
      );
    }
    if (
      workspace?.pendingReadIds.length &&
      /^(?:yes|yes please|okay|ok|read (?:it|them|both|the saved bills)|go ahead|continue)[.!?]*$/i.test(
        text,
      )
    )
      return this.readPending(signal);
    if (workspace?.pendingReadIds.length && /^(?:no|cancel|stop)[.!?]*$/i.test(text)) {
      workspace.pendingReadIds = [];
      return this.answer('Okay. Which bill would you like to use?');
    }
    const doc = workspace?.documents.find((d) => d.id === workspace.reviewId);
    if (doc) {
      if (
        /^(?:yes|yes please|correct|those (?:numbers|values) are correct|(?:confirm|use|accept)(?: this| the)?(?: bill| numbers| values)?|continue)[.!?]*$/i.test(
          text,
        )
      )
        return this.confirm(doc.id);
      const correction = text.match(
        /\b(usage|kilowatt[- ]hours?|kwh|billing days|days|energy charges?|other charges?|total|billing month|month)\s*(?:is|are|should be|to|:)\s*(.+?)[.!?]*$/i,
      );
      if (correction) {
        const field: keyof BillValues = /month/i.test(correction[1])
          ? 'month'
          : /days/i.test(correction[1])
            ? 'days'
            : /other/i.test(correction[1])
              ? 'otherCharges'
              : /energy/i.test(correction[1])
                ? 'energyCharge'
                : /total/i.test(correction[1])
                  ? 'total'
                  : 'kwh';
        const value =
          field === 'month' ? text.match(/\d{4}-\d{2}/)?.[0] : spokenNumber(correction[2]);
        if (value === undefined)
          return this.answer(
            field === 'month'
              ? 'Give the billing month and year, for example “month is 2026-09.”'
              : 'I did not understand that number. Try “usage is twelve hundred” or “total is 240.”',
          );
        const parsed = billValuesSchema.partial().safeParse({ [field]: value });
        if (!parsed.success)
          return this.answer('That value is not valid for this bill field. Please try again.');
        Object.assign(doc.values, parsed.data);
        doc.correctedFields = [...new Set([...(doc.correctedFields ?? []), field])];
        doc.confirmed = false;
        doc.warnings = checkBillValues(doc.values);
        workspace!.export = null;
        this.state.energy = null;
        return this.answer(`Updated ${billLabels[field].toLowerCase()}. ${this.review(doc)}`);
      }
      if (/\b(?:read|check|review|explain)\b.*\b(?:bill|numbers|values)\b/i.test(text))
        return this.answer(this.review(doc));
    }
    if (
      workspace?.documents.length &&
      !this.state.energy &&
      /\b(?:compare|why|higher|increased|afford|budget|payment)\b/i.test(text)
    )
      return this.answer(
        doc
          ? `First confirm your bill numbers. ${this.review(doc)}`
          : 'Add and confirm two different billing months before comparing.',
      );
    if (
      workspace?.documents.length &&
      this.state.energy &&
      /\b(?:why|explain|compare)\b.*\b(?:bill|higher|increase|change)\b/i.test(text)
    )
      return this.answer(billNarration(this.state.energy));
    return null;
  }
}
