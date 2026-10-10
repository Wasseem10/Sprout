# Vultr deployment handoff — not deployed

Use an authorized existing Vultr Ubuntu instance with Docker and the Compose plugin. This app uses CPU hosting plus external inference; a GPU is not required. No resources have been purchased or created. The Docker/Compose configuration has not been run on a Vultr host.

1. Put this repository on the instance. Point a DNS A record for your domain at its IP. Allow inbound 80/443, keep 4311 private, and restrict SSH to your access needs.
2. Copy `.env.example` to `.env` on the host. Set `HOST=0.0.0.0`, `PORT=4311`, `CLIENT_ORIGIN=https://your-domain`, and a unique `SESSION_PASSPHRASE` of at least 16 characters. Set `INSIGHTOS_DOMAIN=your-domain`. Do not put a URL scheme in INSIGHTOS_DOMAIN.
3. Set real provider credentials and `APP_MODE=live` for a sponsor demonstration. A hosted sample run must be identified as hosted sample mode. Use `DATABASE_URL` for Neon; otherwise persistence uses the private host volume.
4. Run from repository root:

```sh
docker compose --env-file .env -f deploy/compose.yaml up -d --build
docker compose --env-file .env -f deploy/compose.yaml ps
curl --fail https://your-domain/health
```

Caddy obtains TLS certificates for the domain and proxies the frontend plus API on one origin. Its named volume retains certificates; the app volume retains the session secret and local development projects. Runtime refuses all-interface binding without the private-session configuration. This is a single-user pilot, not shared multi-user access.

5. Open `https://your-domain`, unlock with the separate session passphrase, import the synthetic file, compare/filter, and save/reload. Confirm Databricks statement references, actual Neon restoration, and real provider checks. A health check alone is insufficient sponsor evidence.
6. For the desktop buddy, keep `INSIGHTOS_APP_URL` empty so the UI and computer actions stay on the laptop. Set `INSIGHTOS_CLOUD_URL=https://your-domain` and `INSIGHTOS_CLOUD_PASSPHRASE` to the deployed server's `SESSION_PASSPHRASE` in the laptop's backend `.env`. Restart the local backend. The coordinator's Hugging Face inference now runs through the authenticated `/api/agent/infer` service on the host; browser, mouse, files and Office execution stay local. Keep `INSIGHTOS_CLOUD_URL` empty on the server. Do not expose either passphrase in `VITE_*` variables. Using `INSIGHTOS_APP_URL` instead loads the hosted data UI, whose computer controls are intentionally unavailable.
7. Set `DEPLOYMENT_URL=https://your-domain` locally, run `npm run check:providers`, and record the app making an actual request to the Vultr host. Keep host/account screenshots free of secrets. No Vultr API key is used by this code; provisioning is outside the app.

Stop with `docker compose --env-file .env -f deploy/compose.yaml down`. This preserves named volumes. If bringing the service back, keep the same passphrase and CLIENT_ORIGIN. Native remote mode and this deployment path need a live host before they can be verified.
