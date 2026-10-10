import Papa from 'papaparse';
import {
  energyBillSchema,
  type EnergyBill,
  type EnergyOption,
  type EnergyQuote,
  type EnergyState,
} from './energy.js';

// These are fictional contractor quotes, not OUC offers or eligibility decisions.
export const energyOptions: EnergyOption[] = [
  {
    id: 'sealing',
    name: 'Weather sealing',
    cost: 600,
    rebate: 0,
    estimatedMonthlyKwh: 50,
    months: 24,
    apr: 0,
  },
  {
    id: 'ducts',
    name: 'Duct repair',
    cost: 1200,
    rebate: 200,
    estimatedMonthlyKwh: 100,
    months: 24,
    apr: 0,
  },
  {
    id: 'thermostat',
    name: 'Thermostat',
    cost: 300,
    rebate: 0,
    estimatedMonthlyKwh: 25,
    months: 24,
    apr: 0,
  },
];
export const syntheticBills: EnergyBill[] = [
  { month: '2026-08', days: 30, kwh: 900, energyCharge: 135, otherCharges: 60 },
  { month: '2026-09', days: 30, kwh: 1200, energyCharge: 180, otherCharges: 60 },
];
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const round = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function compareBills(bills: EnergyBill[]) {
  const checked = bills
    .map((b) => energyBillSchema.parse(b))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (checked.length < 2 || new Set(checked.map((b) => b.month)).size !== checked.length)
    throw new Error('Computer energy analysis needs at least two different billing months.');
  const [previous, current] = checked.slice(-2);
  if (previous.kwh <= 0 || current.kwh <= 0)
    throw new Error('Computer energy comparison needs positive usage for both months.');
  const oldRate = previous.energyCharge / previous.kwh,
    rate = current.energyCharge / current.kwh;
  return {
    previousBill: round(previous.energyCharge + previous.otherCharges),
    currentBill: round(current.energyCharge + current.otherCharges),
    billChange: round(
      current.energyCharge + current.otherCharges - previous.energyCharge - previous.otherCharges,
    ),
    usageChange: round(current.kwh - previous.kwh),
    usageEffect: round((current.kwh - previous.kwh) * oldRate),
    rateEffect: round(current.kwh * (rate - oldRate)),
    otherEffect: round(current.otherCharges - previous.otherCharges),
    previousDailyKwh: round(previous.kwh / previous.days),
    currentDailyKwh: round(current.kwh / current.days),
    rate,
  };
}
export function quoteOption(
  option: EnergyOption,
  rate: number,
  budget: number | null,
): EnergyQuote {
  if (
    ![option.cost, option.rebate, option.estimatedMonthlyKwh, rate, option.apr].every(
      Number.isFinite,
    ) ||
    option.cost < 0 ||
    option.rebate < 0 ||
    option.rebate > option.cost ||
    rate < 0 ||
    option.apr < 0 ||
    !Number.isInteger(option.months) ||
    option.months < 1 ||
    option.estimatedMonthlyKwh < 0
  )
    throw new Error('Computer energy quote has invalid assumptions.');
  const financed = option.cost - option.rebate,
    monthlyRate = option.apr / 1200;
  const exactPayment = monthlyRate
    ? (financed * monthlyRate) / (1 - (1 + monthlyRate) ** -option.months)
    : financed / option.months;
  const payment = round(exactPayment),
    estimatedSavings = round(option.estimatedMonthlyKwh * rate);
  return {
    ...option,
    financed,
    payment,
    totalRepayment: round(exactPayment * option.months),
    interest: round(exactPayment * option.months - financed),
    estimatedSavings,
    netMonthlyCost: round(payment - estimatedSavings),
    annualKwh: option.estimatedMonthlyKwh * 12,
    fitsBudget: budget === null ? null : payment <= budget,
  };
}
export function recalculate(state: EnergyState) {
  state.quotes = energyOptions.map((option) =>
    quoteOption(option, state.comparison.rate, state.budget),
  );
  state.saved = null;
  state.applicationVerified = false;
  state.updatedAt = new Date().toISOString();
  return state;
}
export function newEnergyState(
  bills = syntheticBills,
  sourceName = 'Orlando household · synthetic bills',
  source: EnergyState['source'] = 'synthetic',
): EnergyState {
  return recalculate({
    source,
    sourceName,
    bills,
    budget: null,
    selected: null,
    phase: 'analysis',
    applicant: { name: '', ownership: null },
    comparison: compareBills(bills),
    quotes: [],
    provider: 'local',
    saved: null,
    applicationVerified: false,
    observedPostUpgrade: null,
    updatedAt: new Date().toISOString(),
  });
}
export function parseEnergyCsv(text: string): EnergyBill[] {
  if (text.length > 100000) throw new Error('Computer energy CSV must be under 100 KB.');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length || parsed.data.length < 2 || parsed.data.length > 36)
    throw new Error('Computer energy CSV needs 2 to 36 valid billing rows.');
  const columns = ['month', 'days', 'kwh', 'energyCharge', 'otherCharges'];
  if (!columns.every((c) => parsed.meta.fields?.includes(c)))
    throw new Error(
      'Computer energy CSV needs month, days, kwh, energyCharge, and otherCharges columns.',
    );
  const bills = parsed.data.map((row) => {
    if (columns.some((c) => !row[c]?.trim()))
      throw new Error('Computer energy CSV contains an empty required value.');
    const result = energyBillSchema.safeParse({
      month: row.month.trim(),
      days: Number(row.days),
      kwh: Number(row.kwh),
      energyCharge: Number(row.energyCharge),
      otherCharges: Number(row.otherCharges),
    });
    if (!result.success)
      throw new Error(
        'Computer energy CSV contains an invalid month, day count, usage, or charge.',
      );
    return result.data;
  });
  compareBills(bills);
  return bills.sort((a, b) => a.month.localeCompare(b.month));
}
export function billNarration(state: EnergyState) {
  const c = state.comparison;
  return `${state.source === 'synthetic' ? 'Using clearly labeled sample bills. ' : 'Using your imported bills. '}Your bill ${c.billChange >= 0 ? 'rose' : 'fell'} ${money(Math.abs(c.billChange))}, from ${money(c.previousBill)} to ${money(c.currentBill)}. Usage changed from ${c.previousDailyKwh} to ${c.currentDailyKwh} kilowatt-hours a day. The bill change breaks down into ${money(c.usageEffect)} from usage, ${money(c.rateEffect)} from the effective energy rate, and ${money(c.otherEffect)} from other charges. This does not identify which appliance caused the change. What monthly improvement payment could you afford?`;
}
export function quoteNarration(state: EnergyState) {
  const available = state.quotes
    .filter((q) => q.fitsBudget !== false)
    .sort((a, b) => b.annualKwh - a.annualKwh);
  const q = state.selected ? state.quotes.find((q) => q.id === state.selected)! : available[0];
  if (!q)
    return 'None of the sample financing options fits that payment budget. We can look at a free conservation audit instead.';
  return `${state.budget !== null ? `With a ${money(state.budget)} monthly payment limit, ` : ''}${q.name.toLowerCase()} ${q.fitsBudget === false ? 'exceeds your limit' : 'fits'} at ${money(q.payment)} a month for ${q.months} months. The sample quote assumes ${money(q.cost)} cost, ${money(q.rebate)} rebate, and ${q.apr}% interest. Estimated savings are ${money(q.estimatedSavings)} a month and ${q.annualKwh} kilowatt-hours a year. The monthly payment minus estimated savings is ${money(q.netMonthlyCost)}. These are hypothetical quotes, not an approval or achieved savings. ${q.fitsBudget === false ? 'Would you like an option within your payment limit?' : `Would you like to choose ${q.name.toLowerCase()} or compare another option?`}`;
}
