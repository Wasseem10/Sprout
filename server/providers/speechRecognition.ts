import { z } from 'zod';
import type { Config } from '../config.js';
import { fetchJson } from './http.js';

export const speechModel = 'openai/whisper-large-v3';
export async function huggingFaceTranscribe(
  cfg: Config,
  audio: Buffer,
  contentType: string,
  signal: AbortSignal,
): Promise<string> {
  if (!cfg.hfToken) throw new Error('Voice backup recognition needs the saved Hugging Face key.');
  const result = await fetchJson(
    `https://router.huggingface.co/hf-inference/models/${speechModel}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.hfToken}`, 'Content-Type': contentType },
      body: new Uint8Array(audio),
      signal,
    },
  );
  return z.string().max(2000).parse(result.text);
}
