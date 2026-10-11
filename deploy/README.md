# Vultr remote inference deployment

This package is ready for an owned Linux host, but a package is not a deployment. Confirm the actual host and record a live request before claiming Vultr use. No resources are provisioned or purchased by these scripts.

Insight keeps its buddy, microphone, files, browser, mouse and Office execution on the laptop. The deployed service performs Hugging Face text/vision inference through authenticated `/api/agent/infer` requests. Screenshots or selected source images required by a vision request are transmitted to that service and its Hugging Face provider. It does not gain remote control of the laptop.

## Prerequisites

- An owned Vultr Ubuntu host and authorized SSH access.
- Docker with the Compose plugin, a hostname with DNS pointing to the host, and inbound TCP 80/443. Keep port 4311 private.
- A Hugging Face inference token and model access on the host; a GPU is unnecessary for this external-inference architecture.
- A separate cloud session passphrase of at least 16 characters. Use a random value, distinct from account passwords.

A Vultr API key or console login alone does not provide the host, SSH access, DNS or deployment. The app does not use a Vultr provisioning API.

## Deploy on the owned host

Put the repository on the host without the laptop's `.env`, `.local`, account files or evidence artifacts. The Dockerfile copies an explicit source allowlist, so deployment settings cannot enter an image layer. It installs production packages and verifies server imports/native canvas during image build. Chromium, Electron, Windows executables and native desktop control are not required on this host.

From the repository root:

```sh
cp deploy/cloud.env.example deploy/.env.cloud
chmod 600 deploy/.env.cloud
```

Edit the private `deploy/.env.cloud` file with the actual `INSIGHTOS_DOMAIN`, matching `CLIENT_ORIGIN=https://your-domain`, `SESSION_PASSPHRASE` and `HF_TOKEN`. Keep secrets out of shell history and GitHub. Do not copy the entire laptop configuration. The template includes the current Qwen3 text/vision routes; use models available to the configured HF account.

`APP_MODE=sample` only selects the optional CSV dashboard calculation mode. The authenticated inference endpoint always calls the configured HF models and returns actual cloud-service provenance; it has no sample inference substitution. `DATABASE_URL` is optional hosted storage. The laptop's Neon connection is configured independently.

Validate without printing expanded secrets, then start:

```sh
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml ps
curl --fail https://your-domain/health
```

Caddy obtains TLS certificates and exposes one HTTPS origin. Its persistent volumes retain certificates; the private application volume retains the session secret and local projects. The app runs as a non-root user with a read-only image, a writable private data volume and temporary directory. The proxy waits for app health. Desktop actions are disabled on the hosted service. This remains a single-user pilot.

## Precompiled bundle for a small host

The default Dockerfile compiles TypeScript and Vite inside the image build. To avoid that work on a small VPS, build on the laptop and prepare the explicit runtime allowlist:

```sh
npm run build
node deploy/prepare-bundle.mjs
```

The command prints the newly created ignored `.local/vultr-bundle-*` directory. Copy that entire directory to the owned server (for example `/opt/insightos`) using authorized SSH. It contains compiled application files, dependency manifests, synthetic fixtures and deployment configuration; it excludes the laptop's `.env`, `.local`, receipts, screenshots, personal image folders and native executables. A secret-free manifest records each file's hash. Preparing a bundle does not deploy the service.

In the bundle directory on the host, create private `deploy/.env.cloud` as above, then use the runtime override:

```sh
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml -f deploy/compose.runtime.yaml config --quiet
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml -f deploy/compose.runtime.yaml up -d --build
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml -f deploy/compose.runtime.yaml ps
```

The runtime image still installs production Linux dependencies and checks server imports/native canvas. It does not contain development dependencies or run a browser. A CPU host with 2 GB RAM is a reasonable deployment target for this external-inference service; a GPU is unnecessary. A 1 GB host has not been verified. This is capacity guidance, not an instruction to buy a plan.

TLS requires a public DNS name resolving to the actual server and inbound 80/443. An existing domain is best. For a temporary demonstration, an IP-derived public DNS service may provide a hostname, but verify that DNS resolves to the owned instance before using it. Do not weaken the cloud client's HTTPS requirement or expose port 4311 publicly.

For a secret-free local configuration check, run `node deploy/check-config.mjs`. It renders Compose internally using only synthetic values and checks private ports, healthy startup and persistent data. A successful config check does not prove the Linux image built or the deployed service works.

## Connect the laptop and verify actual inference

Keep `INSIGHTOS_APP_URL` empty on the laptop so the native buddy uses its local UI/API. In **Settings → Vultr**, save the deployed HTTPS origin and its cloud session passphrase, then run **Test**. The equivalent backend variables are `INSIGHTOS_CLOUD_URL` and `INSIGHTOS_CLOUD_PASSPHRASE`; changes through Settings apply immediately, while manual local `.env` edits require a backend restart.

The deployed container forcibly leaves these cloud-routing variables empty, preventing inference recursion. No permanent local HF key, laptop session cookie or desktop executable path is sent to the remote inference route. It authenticates with a separate cloud session cookie, and the remote host uses its own HF token.

On the configured laptop:

```sh
npm run check:cloud -- --vision
```

This consumes real inference credits for a synthetic text challenge and image. It checks the service identity, hosted/session configuration, rejection of unauthenticated inference, fresh authenticated HF output, and optional vision recognition. It writes a secret-free receipt to ignored `.local/cloud-inference-verification.json`. Omit `--vision` for a text-only check. Failed checks do not label a connection verified or substitute local inference.

The receipt explicitly marks the hosting provider **unverified**: HTTP responses cannot prove which company hosts the origin. Confirm the owned instance and matching origin in the Vultr console, then record the desktop app making a real request through it. A health response or adapter alone is insufficient evidence of meaningful Vultr use. Rehearse the same presentation workflow afterward, including current HF model access and failure behavior.

Do not set the native buddy's `INSIGHTOS_APP_URL` to the cloud origin or public Vercel sample. That loads a hosted data UI instead of the local computer assistant. No credentials belong in `VITE_*` variables.

## Stop and resume

```sh
docker compose --env-file deploy/.env.cloud -f deploy/compose.yaml down
```

This preserves named volumes. Keep the same passphrase/origin when resuming. Stop does not delete saved projects or certificates. Caddy's administrative endpoint is disabled; recreate/restart the proxy when changing its configuration.

References: [Docker Compose services](https://docs.docker.com/reference/compose-file/services/), [Dockerfile](https://docs.docker.com/reference/dockerfile/), and [Caddy configuration](https://caddyserver.com/docs/caddyfile/options).
