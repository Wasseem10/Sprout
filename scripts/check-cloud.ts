import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';
import { config, type Config } from '../server/config.js';
import {
  cloudInferenceWithEvidence,
  cloudOrigin,
  type CloudInferenceInput,
} from '../server/providers/cloudInference.js';

export async function verifyCloudInference(cfg: Config, options: { vision?: boolean } = {}) {
  const origin = cloudOrigin(cfg);
  const started = Date.now();
  const signal = AbortSignal.timeout(options.vision ? 120000 : 75000);
  const probe = async (pathname: string) => {
    const response = await fetch(new URL(pathname, origin), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Cloud verification could not read service readiness.');
    return response.json().catch(() => {
      throw new Error('Cloud verification received an invalid readiness response.');
    });
  };
  const health = await probe('/health');
  if (health.ok !== true || health.service !== 'insightos')
    throw new Error('Cloud verification did not find the InsightOS health response.');
  const status = await probe('/api/status');
  if (
    status.hosted !== true ||
    status.sessionRequired !== true ||
    status.computer?.local !== false ||
    status.integrations?.huggingFace?.configured !== true
  )
    throw new Error(
      'Cloud verification requires a hosted, session-protected service with remote Hugging Face configured and desktop execution disabled.',
    );

  const left = randomInt(11, 80),
    right = randomInt(11, 80),
    challenge = randomUUID();
  const input: CloudInferenceInput = {
    system:
      'Calculate the sum. Return only JSON with the exact supplied challenge and the numeric answer.',
    content: { challenge, left, right },
    vision: false,
    json: true,
    maxTokens: 500,
  };
  // This probe must be rejected before any provider call consumes inference credits.
  const unauthorized = await fetch(new URL('/api/agent/infer', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    redirect: 'error',
  });
  if (unauthorized.status !== 401)
    throw new Error('Cloud verification requires unauthenticated inference to return HTTP 401.');
  const inferred = await cloudInferenceWithEvidence(cfg, input, signal);
  let answer: any;
  try {
    answer = JSON.parse(inferred.text);
  } catch {
    throw new Error('Cloud verification inference did not return the expected JSON.');
  }
  if (answer.challenge !== challenge || answer.answer !== left + right)
    throw new Error('Cloud verification failed the fresh, synthetic inference challenge.');

  let visionPassed: boolean | null = null;
  if (options.vision) {
    // The generated image contains no desktop capture or private user data.
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(256, 160),
      context = canvas.getContext('2d');
    context.fillStyle = '#123bc9';
    context.fillRect(0, 0, 256, 160);
    context.fillStyle = '#ffffff';
    context.font = 'bold 110px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('7', 128, 80);
    const vision = await cloudInferenceWithEvidence(
      cfg,
      {
        system: 'Read the single large digit in the image. Return only JSON {"digit":number}.',
        content: [
          { type: 'text', text: 'What large digit is visible on this synthetic blue card?' },
          { type: 'image_url', image_url: { url: canvas.toDataURL('image/png') } },
        ],
        vision: true,
        json: true,
        maxTokens: 500,
      },
      signal,
    );
    try {
      visionPassed = JSON.parse(vision.text).digit === 7;
    } catch {
      visionPassed = false;
    }
    if (!visionPassed) throw new Error('Cloud verification failed the synthetic vision check.');
  }
  return {
    checkedAt: new Date().toISOString(),
    origin: origin.origin,
    elapsedMs: Date.now() - started,
    health: true,
    sessionRequired: true,
    unauthenticatedInferenceHttp: 401,
    authenticatedInference: true,
    freshChallengeMatched: true,
    visionInference: visionPassed,
    provider: inferred.provider,
    execution: inferred.execution,
    desktopExecution: 'local-only',
    textModel: status.integrations.huggingFace.model ?? null,
    visionModel: status.computer.visionModel ?? null,
    hostingProvider: 'unverified',
    hostingEvidence:
      'Remote inference passed. Verify this origin belongs to the owned Vultr instance before claiming Vultr use.',
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Configure INSIGHTOS_CLOUD_URL and INSIGHTOS_CLOUD_PASSPHRASE on the laptop, then run npm run check:cloud [-- --vision]. Makes real remote Hugging Face requests and writes a secret-free .local/cloud-inference-verification.json receipt. Does not provision resources or prove the hosting company.',
    );
    return;
  }
  const cfg = config(),
    output = path.resolve(cfg.localDir, 'cloud-inference-verification.json');
  await mkdir(cfg.localDir, { recursive: true });
  try {
    const report = await verifyCloudInference(cfg, { vision: process.argv.includes('--vision') });
    await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report));
  } catch (error) {
    // Do not print provider bodies, cookies, passphrases, or network errors containing URLs.
    const detail =
      error instanceof Error && /^Cloud (?:AI|verification)\b/.test(error.message)
        ? error.message
        : 'Cloud verification failed before completion. Check network, TLS, model access and remote service configuration.';
    await writeFile(
      output,
      JSON.stringify({ checkedAt: new Date().toISOString(), verified: false, detail }, null, 2),
      { mode: 0o600 },
    );
    console.error(detail);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
