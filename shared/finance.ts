import { z } from 'zod';
import { isoDate } from './schema.js';

export const transactionSchema = z
  .object({
    date: isoDate,
    category: z.string().trim().min(1).max(80),
    description: z.string().max(200),
    kind: z.enum(['income', 'expense']),
    cents: z.number().int().min(0).max(100_000_000),
  })
  .strict();
export type Transaction = z.infer<typeof transactionSchema>;
export const ledgerSchema = z.array(transactionSchema).min(1).max(3000);
export type MonthTotal = {
  month: string;
  income: number;
  expenses: number;
  remaining: number;
  count: number;
};
export type CategoryTotal = {
  category: string;
  current: number;
  previous: number;
  change: number;
  count: number;
};
export type FinanceAnalysis = {
  months: MonthTotal[];
  current: MonthTotal;
  previous: MonthTotal | null;
  categories: CategoryTotal[];
  sourceRows: number;
};
export const loanSchema = z
  .object({
    principal: z.number().int().min(100).max(100_000_000),
    apr: z.number().min(0).max(100),
    months: z.number().int().min(1).max(360),
    limit: z.number().int().min(0).max(100_000_000),
  })
  .strict();
export type LoanInput = z.infer<typeof loanSchema>;
export type LoanResult = LoanInput & {
  payment: number;
  total: number;
  interest: number;
  withinLimit: boolean;
  remainingAfter: number;
};
export type FinanceState = {
  sourceName: string;
  synthetic: boolean;
  transactions: Transaction[];
  analysis: FinanceAnalysis;
  provider: 'local' | 'databricks';
  queryReference: string | null;
  reductions: Record<string, number>;
  scenarioSavings: number;
  scenarioRemaining: number;
  loan: LoanResult | null;
  narrativeProvider: 'verified-calculations' | 'hugging-face';
  narrative: string;
  export: { filename: string; sha256: string; opened: boolean } | null;
  updatedAt: string;
};
export function dollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
export function analyzeFinance(input: Transaction[]): FinanceAnalysis {
  const rows = ledgerSchema.parse(input);
  const monthly = new Map<string, MonthTotal>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const total = monthly.get(month) ?? { month, income: 0, expenses: 0, remaining: 0, count: 0 };
    total[row.kind === 'income' ? 'income' : 'expenses'] += row.cents;
    total.count++;
    total.remaining = total.income - total.expenses;
    monthly.set(month, total);
  }
  const months = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  const current = months.at(-1)!;
  const previous = months.at(-2) ?? null;
  const categories = new Map<string, CategoryTotal>();
  for (const row of rows.filter((r) => r.kind === 'expense')) {
    if (row.date.slice(0, 7) !== current.month && row.date.slice(0, 7) !== previous?.month)
      continue;
    const category = categories.get(row.category) ?? {
      category: row.category,
      current: 0,
      previous: 0,
      change: 0,
      count: 0,
    };
    if (row.date.slice(0, 7) === current.month) {
      category.current += row.cents;
      category.count++;
    } else category.previous += row.cents;
    category.change = category.current - category.previous;
    categories.set(row.category, category);
  }
  return {
    months,
    current,
    previous,
    categories: [...categories.values()].sort(
      (a, b) => b.current - a.current || a.category.localeCompare(b.category),
    ),
    sourceRows: rows.length,
  };
}
export function calculateLoan(input: LoanInput, available: number): LoanResult {
  const loan = loanSchema.parse(input);
  const rate = loan.apr / 1200;
  const payment = Math.ceil(
    (rate === 0
      ? loan.principal / loan.months
      : (loan.principal * rate) / (1 - Math.pow(1 + rate, -loan.months))) - 1e-7,
  );
  // Final payment settles the outstanding balance; intermediate payments round up to cents.
  let balance = loan.principal,
    total = 0;
  for (let month = 0; month < loan.months; month++) {
    const due = balance * (1 + rate);
    const paid = month === loan.months - 1 ? Math.round(due) : Math.min(payment, Math.round(due));
    total += paid;
    balance = Math.max(0, due - paid);
  }
  return {
    ...loan,
    payment,
    total,
    interest: total - loan.principal,
    withinLimit: payment <= loan.limit && payment <= available,
    remainingAfter: available - payment,
  };
}
export function refreshFinance(state: FinanceState): FinanceState {
  for (const [name, amount] of Object.entries(state.reductions)) {
    const category = state.analysis.categories.find((c) => c.category === name);
    if (!category || !Number.isInteger(amount) || amount < 0 || amount > category.current)
      throw new Error(
        'Computer finance reduction must be within the category’s observed spending.',
      );
  }
  state.scenarioSavings = Object.values(state.reductions).reduce((a, b) => a + b, 0);
  state.scenarioRemaining = state.analysis.current.remaining + state.scenarioSavings;
  if (state.loan) {
    const { principal, apr, months, limit } = state.loan;
    state.loan = calculateLoan({ principal, apr, months, limit }, state.scenarioRemaining);
  }
  state.export = null;
  state.updatedAt = new Date().toISOString();
  return state;
}
export function newFinanceState(
  rows: Transaction[],
  sourceName: string,
  synthetic: boolean,
): FinanceState {
  const transactions = ledgerSchema.parse(rows);
  return refreshFinance({
    sourceName,
    synthetic,
    transactions,
    analysis: analyzeFinance(transactions),
    provider: 'local',
    queryReference: null,
    reductions: {},
    scenarioSavings: 0,
    scenarioRemaining: 0,
    loan: null,
    narrativeProvider: 'verified-calculations',
    narrative: '',
    export: null,
    updatedAt: new Date().toISOString(),
  });
}
export function financeNarration(state: FinanceState) {
  const { current, previous, categories } = state.analysis;
  const monthName = (month: string) =>
    new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  let text = `${state.synthetic ? 'Using sample transactions. ' : ''}For ${monthName(current.month)}, recorded income is ${dollars(current.income)}, spending is ${dollars(current.expenses)}, and the difference is ${dollars(current.remaining)}.`;
  if (previous) {
    const change = current.expenses - previous.expenses;
    text += ` Spending ${change >= 0 ? 'increased' : 'decreased'} ${dollars(Math.abs(change))} compared with ${monthName(previous.month)}.`;
    const increased = categories
      .filter((c) => c.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 2);
    if (increased.length)
      text += ` Largest increases: ${increased.map((c) => `${c.category}, ${dollars(c.change)}`).join('; ')}.`;
  }
  text += ' These totals cover the uploaded records, not your bank balance.';
  return text;
}
