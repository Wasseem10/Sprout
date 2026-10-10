import { z } from 'zod';
import { energyBillSchema } from './energy.js';

export const billValuesSchema = energyBillSchema
  .extend({ total: z.number().finite().nonnegative().max(1000000) })
  .strict();
export type BillValues = z.infer<typeof billValuesSchema>;
export const billFields = [
  'month',
  'days',
  'kwh',
  'energyCharge',
  'otherCharges',
  'total',
] as const;
export type BillField = (typeof billFields)[number];
export const billLabels: Record<BillField, string> = {
  month: 'Billing month',
  days: 'Billing days',
  kwh: 'Electricity used (kWh)',
  energyCharge: 'Energy charges ($)',
  otherCharges: 'Other current charges ($)',
  total: 'Current bill total ($)',
};
export type BillDocument = {
  id: string;
  filename: string;
  synthetic: boolean;
  provider: 'pdf-text' | 'hugging-face';
  values: Partial<BillValues>;
  evidence: { field: BillField; page: number; quote: string }[];
  warnings: string[];
  confirmed: boolean;
  preview: string | null;
  correctedFields?: BillField[];
};
export type BillWorkspace = {
  documents: BillDocument[];
  candidates: { id: string; filename: string; size: number; modifiedAt: string }[];
  pendingReadIds: string[];
  location: string | null;
  reviewId: string | null;
  export: { filename: string; sha256: string } | null;
};
export const newBillWorkspace = (): BillWorkspace => ({
  documents: [],
  candidates: [],
  pendingReadIds: [],
  location: null,
  reviewId: null,
  export: null,
});
export function checkBillValues(values: Partial<BillValues>): string[] {
  const result = billValuesSchema.safeParse(values);
  if (!result.success) return ['Check the missing or invalid bill fields before continuing.'];
  if (result.data.kwh <= 0) return ['Usage must be greater than zero for this comparison.'];
  if (
    ['energyCharge', 'otherCharges', 'total'].some(
      (field) =>
        Math.abs(
          Number(values[field as BillField]) * 100 -
            Math.round(Number(values[field as BillField]) * 100),
        ) > 0.000001,
    )
  )
    return ['Dollar amounts must have no more than two decimal places.'];
  if (
    Math.round(result.data.energyCharge * 100) + Math.round(result.data.otherCharges * 100) !==
    Math.round(result.data.total * 100)
  )
    return [
      'Energy and other current charges do not add up to the current bill total. Check for a previous balance or multiple utility services.',
    ];
  return [];
}
