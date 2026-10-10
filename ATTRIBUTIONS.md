# Attribution and licenses

The interface and synthetic fixture were authored for InsightOS with Codex assistance. No personal story, user interview, accessibility certification, or competitive award is claimed. The inspiration acknowledges existing screen readers and conversational assistants; we do not claim to have invented voice control.

The live text/code route uses [Qwen3-Coder-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct), by the Qwen team; its model card lists Apache-2.0. The repository's older fallback is Qwen2.5-7B-Instruct, which was unavailable through this account's enabled providers. No weights were downloaded or distributed. If changing HF_MODEL_ID, inspect that model's actual license and provider terms. Model access and hosted inference service terms are separate from a weights license.

React, Vite, Electron, Fastify, Papa Parse, Zod, Neon serverless, and Lucide icons are used through npm packages. Versions are pinned in package-lock.json. `artifacts/dependency-licenses.json` inventories installed package license metadata; original license/notice files remain in their packages. Electron embeds Chromium and Node with their own third-party notices. Review redistributed notices when preparing an installer; no installer has been produced.

Major licenses from installed package metadata: React/Electron/Fastify/Papa Parse/Zod/Vite MIT; Neon serverless MIT; TypeScript Apache-2.0; Playwright Apache-2.0; Lucide ISC. Check the inventory for exact versions and transitive dependencies. No Adobe/Figma assets or sponsor logos were used. Font rendering uses system fonts with no bundled font files.

The project has no selected redistribution license of its own yet. The team can choose one before publishing; do not assume dependency licenses license our source automatically. Public GitHub visibility is required by the event but is separate from choosing a license.

The operator uses Playwright (Apache-2.0). The live vision route uses [Qwen3-VL-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct), whose model card lists Apache-2.0; the older code fallback is Qwen2.5-VL-7B-Instruct. No weights are distributed. Synthetic-image and native-buddy-screenshot inference passed; human-selected window interpretation still needs rehearsal. Browser content comes from [Books to Scrape](https://books.toscrape.com/), a public practice catalog; no purchase or real retailer price is claimed.
