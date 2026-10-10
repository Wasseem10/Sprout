import { writeFile } from 'node:fs/promises';
import { config } from '../server/config.js';
import { cloudInference } from '../server/providers/cloudInference.js';
const cfg = config();
if (!cfg.cloudUrl || !cfg.cloudPassphrase)
  throw new Error(
    'Configure INSIGHTOS_CLOUD_URL and INSIGHTOS_CLOUD_PASSPHRASE in the local backend first.',
  );
const started = Date.now();
const raw = await cloudInference(
  cfg,
  {
    system: 'Return exactly JSON {"answer":4}.',
    content: 'What is 2 plus 2?',
    vision: false,
    json: true,
  },
  AbortSignal.timeout(45000),
);
if (JSON.parse(raw).answer !== 4)
  throw new Error('Cloud inference did not pass the expected response check.');
const report = {
  checkedAt: new Date().toISOString(),
  origin: new URL(cfg.cloudUrl).origin,
  elapsedMs: Date.now() - started,
  authenticatedInference: true,
  hostingEvidence:
    'Verify the instance in the Vultr console separately; this check establishes a working remote inference service.',
};
await writeFile('artifacts/cloud-inference-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
