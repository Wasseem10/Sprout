import { buildApp } from './app.js';
import { config } from './config.js';
const cfg = config(),
  app = await buildApp(cfg);
await app.listen({ port: cfg.port, host: cfg.host });
console.log(`InsightOS backend: http://${cfg.host}:${cfg.port} (${cfg.mode} mode)`);
for (const name of ['SIGINT', 'SIGTERM'] as const)
  process.once(name, () => {
    void app.close().then(() => process.exit(0));
  });
