import type { ComputerResult, ComputerState } from '../../shared/computer.js';
import { energyStateSchema, type EnergyState } from '../../shared/energy.js';
import type { Config } from '../config.js';
import { EnergyStore } from '../providers/energyStore.js';
import {
  billNarration,
  energyOnDatabricks,
  money,
  newEnergyState,
  quoteNarration,
  recalculate,
} from './energy.js';

type IO = {
  importBills: (filename: string) => Promise<EnergyState>;
  application: (state: EnergyState, signal: AbortSignal, readOnly?: boolean) => Promise<boolean>;
  openProgram: (signal: AbortSignal) => Promise<void>;
};
function budgetFrom(text: string) {
  if (!/\b(budget|afford|limit|payment|a month|per month|monthly|dollars?)\b|\$/i.test(text))
    return null;
  const numeric =
    text.match(/\$\s*(-?\d+(?:\.\d{1,2})?)/i) ??
    text.match(/(?<![\w.])(-?\d+(?:\.\d{1,2})?)(?:\s*dollars?)?/i);
  if (numeric) return Number(numeric[1]);
  const units: Record<string, number> = {
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
  };
  const tens: Record<string, number> = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  const compound = text
    .toLowerCase()
    .match(
      /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b/,
    );
  if (compound) return tens[compound[1]] + (units[compound[2]] ?? 0);
  if (/\b(?:one )?hundred\b/i.test(text)) return 100;
  const word = Object.keys(units).find((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  return word ? units[word] : null;
}
export class EnergyAssistant {
  active = false;
  constructor(
    private cfg: Config,
    private state: ComputerState,
    private io: IO,
  ) {}
  async request(request: string, signal: AbortSignal): Promise<ComputerResult | null> {
    const text = request.trim();
    if (/\b(?:powerpoint|presentation|slides|python|code)\b/i.test(text)) return null;
    const explicit =
      /\b(?:energy|electricity|electric|utility)\b.*\b(?:bill|plan|demo|saving|usage|application|program|sample)|\b(?:bill|demo|sample)\b.*\b(?:energy|electricity|electric|utility)\b/i.test(
        text,
      );
    const startSample =
      /\b(?:sample|demo|synthetic)\b/i.test(text) &&
      (explicit || (this.active && /\bbills?\b/i.test(text)));
    const importFile =
      /\benergy\b/i.test(text) || this.active
        ? text.match(
            /\b(?:import|analy[sz]e|read|use)\s+(?:my\s+)?(?:energy\s+)?([\w .-]+\.csv)\b/i,
          )
        : null;
    const bareBudget =
      this.active &&
      this.state.energy?.budget === null &&
      /^(?:\d+(?:\.\d{1,2})?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|(?:one )?hundred)[.!?]*$/i.test(
        text,
      );
    const budget = budgetFrom(text) ?? (bareBudget ? budgetFrom(text + ' dollars') : null);
    const option = /\b(?:weather|sealing|seal)\b/i.test(text)
      ? 'sealing'
      : /\bducts?\b/i.test(text)
        ? 'ducts'
        : /\bthermostat\b/i.test(text)
          ? 'thermostat'
          : null;
    let name = text.match(/\b(?:my name is|use (?:the )?name|name is)\s+(.+?)[.!?]*$/i);
    if (
      !name &&
      this.active &&
      this.state.energy?.phase === 'application' &&
      !this.state.energy.applicant.name &&
      /^[\p{L}][\p{L} '\-]{1,79}[.!?]?$/u.test(text) &&
      !/^(?:stop|cancel|forget|open|create|make|find|search|what|why|how|yes|no|continue|use|homeowner|renter|compare|save|resume)\b/i.test(
        text,
      )
    )
      name = [text, text.replace(/[.!?]$/, '')] as RegExpMatchArray;
    const ownership = /\bhomeowner|own (?:my|the) home\b/i.test(text)
      ? 'homeowner'
      : /\brenter|rent (?:my|the) home\b/i.test(text)
        ? 'renter'
        : null;
    const followup =
      this.active &&
      (budget !== null ||
        /\b(?:record|track)\b.*\busage\b/i.test(text) ||
        option ||
        name ||
        ownership ||
        /^(?:yes|continue|compare(?: .*options)?|what(?:'s| is) left|read (?:it|that|the application) back|review(?: .*application)?|why(?: .*bill)?|explain(?: .*bill)?|use demo details|(?:prepare|start|fill|open|help me with)(?: .*application)|(?:save|resume|restore)(?: .*plan)|(?:open|show)(?: .*program)|(?:record|track)(?: .*usage)|analy[sz]e .*databricks)[.!?]*$/i.test(
          text,
        ));
    if (!explicit && !startSample && !followup && !importFile) {
      // An unrelated command is handled by the general computer agent.
      if (/\b(?:open|create|make|write|find|search|analy[sz]e)\b/i.test(text)) this.active = false;
      return null;
    }
    this.active = true;
    const answer = (summary: string, spokenSummary?: string): ComputerResult => ({
      tool: 'energyHelp',
      summary,
      spokenSummary,
      state: structuredClone(this.state),
      clarification: true,
    });
    if (/\b(?:resume|restore|load)\b.*\bplan\b/i.test(text)) {
      const saved = await new EnergyStore(this.cfg).load(signal);
      if (!saved)
        return answer(
          'There is no saved energy plan yet. Say “start the energy demo” to try sample bills.',
        );
      saved.comparison = newEnergyState(saved.bills).comparison;
      const provider = saved.saved;
      this.state.energy = recalculate(saved);
      this.state.energy.saved = provider;
      return answer(
        `I restored your ${provider === 'neon' ? 'Neon' : 'local'} energy plan. ${quoteNarration(saved)} Your browser application needs a fresh verification before review.`,
      );
    }
    if (startSample && !/details/i.test(text)) {
      this.state.energy = newEnergyState();
      if (this.state.task?.status !== 'running')
        this.state.task = {
          id: crypto.randomUUID(),
          goal: 'Understand energy bills and prepare an accessible improvement application',
          status: 'waiting',
          message: 'Waiting for your monthly payment limit',
          steps: [{ tool: 'energyHelp', summary: 'Analyzed two labeled synthetic bills.' }],
        };
      const c = this.state.energy.comparison;
      return answer(
        billNarration(this.state.energy),
        `Using sample bills, your bill rose ${money(c.billChange)} to ${money(c.currentBill)}. The increase comes from more energy used, not a higher effective rate. What monthly improvement payment could you afford?`,
      );
    }
    if (importFile) {
      this.state.energy = await this.io.importBills(importFile[1].trim());
      return answer(billNarration(this.state.energy));
    }
    const state = this.state.energy;
    if (!state)
      return answer(
        'I can analyze your bills or use a sample household. Say “start the energy demo,” or choose a folder and ask me to import an energy CSV.',
      );
    if (/\b(?:save)\b.*\bplan\b/i.test(text)) {
      state.saved = await new EnergyStore(this.cfg).save(state, signal);
      return answer(
        `I saved your bill baseline, budget, selected improvement and application answers ${state.saved === 'neon' ? 'in Neon' : 'on this computer'}. Say “resume my energy plan” to return to it. Nothing was submitted.`,
      );
    }
    if (/\b(?:open|show)\b.*\b(?:real|ouc|local|program)\b/i.test(text)) {
      await this.io.openProgram(signal);
      return answer(
        'I opened OUC’s real Efficiency Delivered information. The program starts with a conservation audit. Actual eligibility and financing must be checked with OUC; our sample quotes are separate.',
      );
    }
    if (/\b(?:record|track)\b.*\busage\b/i.test(text)) {
      const match = text.match(/(\d+(?:\.\d+)?)\s*(?:kwh|kilowatt[- ]hours?).*?(\d+)\s*days?/i);
      if (!match)
        return answer(
          'Tell me the observed usage and period, for example “record usage 1000 kilowatt-hours over 30 days.”',
        );
      const kwh = Number(match[1]),
        days = Number(match[2]);
      if (days < 1 || days > 366 || kwh > 1000000)
        return answer('Please give a valid usage amount and a period of 1 to 366 days.');
      const baseline = state.comparison.currentDailyKwh;
      const dailyChange = Math.round((kwh / days - baseline) * 100) / 100;
      state.observedPostUpgrade = { kwh, days, dailyChange };
      state.saved = null;
      return answer(
        `Recorded ${kwh} kilowatt-hours over ${days} days. Daily usage is ${Math.abs(dailyChange)} kilowatt-hours ${dailyChange <= 0 ? 'lower' : 'higher'} than your baseline. ${state.source === 'synthetic' ? 'The baseline is synthetic, so this is a demo comparison. ' : ''}Weather and occupancy can affect usage; this comparison does not prove the upgrade caused the change.`,
      );
    }
    if (/\bdatabricks\b/i.test(text) && !/\b(?:without|skip|avoid)\b/i.test(text)) {
      const result = await energyOnDatabricks(state, this.cfg, signal);
      const [billChange, usageEffect, rateEffect, otherEffect] = result.values;
      state.comparison = { ...state.comparison, billChange, usageEffect, rateEffect, otherEffect };
      state.provider = 'databricks';
      state.queryReference = result.queryReference;
      return answer('Databricks SQL verified the bill comparison. ' + billNarration(state));
    }
    const wasApplication = ['application', 'review'].includes(state.phase);
    let changed = false;
    if (budget !== null) {
      if (!Number.isFinite(budget) || budget < 0 || budget > 10000)
        return answer('Give a monthly payment limit between zero and ten thousand dollars.');
      state.budget = budget;
      changed = true;
      state.phase = 'comparison';
    }
    if (option) {
      state.selected = option;
      changed = true;
    }
    if (name) {
      state.applicant.name = name[1].trim().slice(0, 80);
      changed = true;
    }
    if (ownership) {
      state.applicant.ownership = ownership;
      changed = true;
    }
    if (/\buse (?:the )?demo details\b/i.test(text)) {
      state.applicant = { name: 'Alex Demo', ownership: 'homeowner' };
      changed = true;
    }
    if (changed) recalculate(state);
    if (/^yes[.!?]*$/i.test(text) && !state.selected && state.budget !== null) {
      state.selected = energyStateSchema.shape.selected.parse(
        [...state.quotes].filter((q) => q.fitsBudget).sort((a, b) => b.annualKwh - a.annualKwh)[0]
          ?.id ?? null,
      );
    }
    const wantsApplication =
      /\b(?:application|apply|fill out|read .*back|what(?:'s| is) left)\b/i.test(text) ||
      (/^yes[.!?]*$/i.test(text) && state.selected !== null && state.budget !== null) ||
      (wasApplication && (changed || /^(?:yes|continue)[.!?]*$/i.test(text)));
    if (wantsApplication) {
      state.phase = 'application';
      if (state.budget === null) return answer('What is your maximum monthly payment?');
      if (!state.selected)
        return answer(
          'Which improvement should I use: weather sealing, duct repair, or thermostat?',
        );
      const quote = state.quotes.find((q) => q.id === state.selected)!;
      if (!quote.fitsBudget)
        return answer(
          `${quote.name} costs ${money(quote.payment)} a month, above your ${money(state.budget)} payment limit. Weather sealing is $25 a month and thermostat is $12.50 in the sample quotes. Which would you prefer?`,
        );
      if (!state.applicant.name)
        return answer(
          'What name should appear on the demo application? You can say “use demo details” for fictional information.',
        );
      if (!state.applicant.ownership)
        return answer(
          'Are you a homeowner or renter? I will record your answer without deciding eligibility.',
        );
      const readOnly = state.applicationVerified && !changed && /\b(?:read|review)\b/i.test(text);
      const verified = await this.io.application(state, signal, readOnly);
      signal.throwIfAborted();
      state.applicationVerified = verified;
      state.phase = verified ? 'review' : 'application';
      if (this.state.task) {
        this.state.task.status = verified ? 'completed' : 'waiting';
        this.state.task.message = verified
          ? 'Application verified and ready for your review'
          : 'Application needs attention';
      }
      return answer(
        verified
          ? `I verified the demo application in the browser. Name: ${state.applicant.name}. Property status: ${state.applicant.ownership}. Improvement: ${quote.name}. Payment limit: ${money(state.budget)}. Sample payment: ${money(quote.payment)} for ${quote.months} months at ${quote.apr}% interest. Estimated reduction: ${quote.annualKwh} kilowatt-hours a year. Nothing was submitted. You can change an answer or say “save my energy plan.”`
          : 'I cannot verify that the browser review matches your plan. Your answers are still here; tell me what to change.',
      );
    }
    if (budget !== null || option || /^yes|\bcompare\b/i.test(text)) {
      if (this.state.task) this.state.task.message = 'Comparing costs within your payment limit';
      const available = state.quotes
        .filter((q) => q.fitsBudget !== false)
        .sort((a, b) => b.annualKwh - a.annualKwh);
      const q = state.selected ? state.quotes.find((q) => q.id === state.selected) : available[0];
      return answer(
        quoteNarration(state),
        q
          ? `${q.name} ${q.fitsBudget === false ? 'exceeds your payment limit' : 'would cost'} ${money(q.payment)} a month for ${q.months} months. Estimated bill savings are ${money(q.estimatedSavings)} a month. These are sample quotes, not approved financing. ${q.fitsBudget === false ? 'Would you like a lower-payment option?' : 'Would you like to use this option for the demo application?'}`
          : undefined,
      );
    }
    return answer(billNarration(state));
  }
}
