import { z } from 'zod';

/** Trusted application-generated output contracts; still validate the returned content locally. */
export const inferenceOutputSchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  schema: z.record(z.string(), z.unknown()).refine(
    (value) => value.type === 'object' && JSON.stringify(value).length <= 24000,
    'The output contract must be an object schema no larger than 24 KB.',
  ),
});
export type InferenceOutputSchema = z.infer<typeof inferenceOutputSchema>;
