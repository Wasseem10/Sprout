import 'dotenv/config';
import path from 'node:path';
export function config() {
  const port = Number(process.env.PORT ?? 4311),
    host = process.env.HOST ?? '127.0.0.1';
  const mode = process.env.APP_MODE ?? 'sample';
  if (!['sample', 'live'].includes(mode)) throw new Error('APP_MODE must be sample or live.');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 through 65535.');
  const hosted = !['127.0.0.1', 'localhost', '::1'].includes(host);
  if (
    hosted &&
    (!process.env.SESSION_PASSPHRASE ||
      process.env.SESSION_PASSPHRASE.length < 16 ||
      !process.env.CLIENT_ORIGIN)
  )
    throw new Error(
      'Hosted mode requires a SESSION_PASSPHRASE of at least 16 characters and CLIENT_ORIGIN.',
    );
  if (hosted) {
    const origin = new URL(process.env.CLIENT_ORIGIN!);
    if (origin.protocol !== 'https:' || origin.origin !== process.env.CLIENT_ORIGIN)
      throw new Error(
        'Hosted CLIENT_ORIGIN must be an exact HTTPS origin, without a trailing slash or path.',
      );
  }
  return {
    port,
    host,
    mode: mode as 'sample' | 'live',
    localDir: process.env.LOCAL_DATA_DIR || path.resolve('.local'),
    envFile: path.resolve('.env'),
    passphrase: process.env.SESSION_PASSPHRASE ?? '',
    owner: 'single-user-pilot',
    hfToken: process.env.HF_TOKEN ?? '',
    hfModel: process.env.HF_MODEL_ID || 'Qwen/Qwen2.5-7B-Instruct',
    hfVisionModel: process.env.HF_VISION_MODEL_ID || 'Qwen/Qwen2.5-VL-7B-Instruct',
    pythonBin: process.env.PYTHON_BIN ?? '',
    codeBin: process.env.VSCODE_BIN ?? '',
    powerpointBin: process.env.POWERPOINT_BIN ?? '',
    excelBin: process.env.EXCEL_BIN ?? '',
    hfEndpoint: process.env.HF_ENDPOINT_URL || 'https://router.huggingface.co/v1/chat/completions',
    dbHost: process.env.DATABRICKS_HOST ?? '',
    dbWarehouse: process.env.DATABRICKS_WAREHOUSE_ID ?? '',
    dbToken: process.env.DATABRICKS_TOKEN ?? '',
    dbCatalog: process.env.DATABRICKS_CATALOG || 'main',
    dbSchema: process.env.DATABRICKS_SCHEMA || 'insightos',
    elevenKey: process.env.ELEVENLABS_API_KEY ?? '',
    elevenVoice: process.env.ELEVENLABS_VOICE_ID ?? '',
    elevenTtsModel: process.env.ELEVENLABS_TTS_MODEL_ID || 'eleven_flash_v2_5',
    neonUrl: process.env.DATABASE_URL ?? '',
    origins: [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      'http://127.0.0.1:5173',
      ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
    ],
  };
}
export type Config = ReturnType<typeof config>;
