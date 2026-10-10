import { z } from 'zod';

const value = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((text) => !/[\r\n\0]/.test(text), 'Use a single-line value.');
export const connectionSettingsSchema = z
  .object({
    HF_TOKEN: value.optional(),
    HF_MODEL_ID: value.optional(),
    HF_VISION_MODEL_ID: value.optional(),
    ELEVENLABS_API_KEY: value.optional(),
    ELEVENLABS_VOICE_ID: value.optional(),
    DATABRICKS_HOST: value.optional(),
    DATABRICKS_WAREHOUSE_ID: value.optional(),
    DATABRICKS_TOKEN: value.optional(),
    DATABRICKS_CATALOG: value.optional(),
    DATABRICKS_SCHEMA: value.optional(),
    DATABASE_URL: value.optional(),
    APP_MODE: z.enum(['sample', 'live']).optional(),
  })
  .strict();
export type ConnectionSettings = z.infer<typeof connectionSettingsSchema>;
export const providerSchema = z.enum(['huggingFace', 'elevenLabs', 'databricks', 'neon']);
export type Provider = z.infer<typeof providerSchema>;
export type ConnectionCheck = { status: 'passed' | 'failed'; detail: string };
export type ConnectionReport = { checkedAt: string; checks: ConnectionCheck[] };
export type ConnectionState = {
  editable: boolean;
  defaults: {
    HF_MODEL_ID: string;
    HF_VISION_MODEL_ID: string;
    ELEVENLABS_VOICE_ID: string;
    DATABRICKS_HOST: string;
    DATABRICKS_WAREHOUSE_ID: string;
    DATABRICKS_CATALOG: string;
    DATABRICKS_SCHEMA: string;
    APP_MODE: 'sample' | 'live';
  };
  configured: Record<Provider, boolean>;
  reports: Partial<Record<Provider, ConnectionReport>>;
};
export const accountUrls = {
  huggingFace: 'https://huggingface.co/settings/tokens',
  elevenLabs: 'https://elevenlabs.io/app',
  databricks: 'https://login.databricks.com/',
  neon: 'https://console.neon.tech/',
  vultr: 'https://my.vultr.com/',
} as const;
