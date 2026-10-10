import { z } from 'zod';

export const energyBillSchema = z
  .object({
    month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
    days: z.number().int().min(1).max(366),
    kwh: z.number().min(0).max(1000000),
    energyCharge: z.number().min(0).max(1000000),
    otherCharges: z.number().min(0).max(1000000),
  })
  .strict();
export type EnergyBill = z.infer<typeof energyBillSchema>;
export type EnergyOption = {
  id: string;
  name: string;
  cost: number;
  rebate: number;
  estimatedMonthlyKwh: number;
  months: number;
  apr: number;
};
export type EnergyQuote = EnergyOption & {
  financed: number;
  payment: number;
  totalRepayment: number;
  interest: number;
  estimatedSavings: number;
  netMonthlyCost: number;
  annualKwh: number;
  fitsBudget: boolean | null;
};
const energyQuoteSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(100),
  cost: z.number().finite().nonnegative(),
  rebate: z.number().finite().nonnegative(),
  estimatedMonthlyKwh: z.number().finite().nonnegative(),
  months: z.number().int().positive(),
  apr: z.number().finite().nonnegative(),
  financed: z.number().finite().nonnegative(),
  payment: z.number().finite().nonnegative(),
  totalRepayment: z.number().finite().nonnegative(),
  interest: z.number().finite(),
  estimatedSavings: z.number().finite().nonnegative(),
  netMonthlyCost: z.number().finite(),
  annualKwh: z.number().finite().nonnegative(),
  fitsBudget: z.boolean().nullable(),
});
export const energyStateSchema = z.object({
  source: z.enum(['synthetic', 'imported']),
  sourceName: z.string().max(160),
  bills: z.array(energyBillSchema).min(2).max(36),
  budget: z.number().min(0).max(10000).nullable(),
  selected: z.enum(['sealing', 'ducts', 'thermostat']).nullable(),
  phase: z.enum(['analysis', 'comparison', 'application', 'review']),
  applicant: z.object({
    name: z.string().max(80),
    ownership: z.enum(['homeowner', 'renter']).nullable(),
  }),
  comparison: z.object({
    previousBill: z.number(),
    currentBill: z.number(),
    billChange: z.number(),
    usageChange: z.number(),
    usageEffect: z.number(),
    rateEffect: z.number(),
    otherEffect: z.number(),
    previousDailyKwh: z.number(),
    currentDailyKwh: z.number(),
    rate: z.number(),
  }),
  quotes: z.array(energyQuoteSchema).max(5),
  provider: z.enum(['local', 'databricks']),
  queryReference: z.string().optional(),
  saved: z.enum(['local', 'neon']).nullable(),
  applicationVerified: z.boolean(),
  observedPostUpgrade: z
    .object({ days: z.number(), kwh: z.number(), dailyChange: z.number() })
    .nullable(),
  updatedAt: z.string(),
});
export type EnergyState = z.infer<typeof energyStateSchema>;

export const energyProgramUrl =
  'https://www.ouc.com/solutions-programs/savings/efficiency-delivered/homeowners-renter/';
export const energyDemoUrl = 'https://demo.insightos.invalid/energy-application';
