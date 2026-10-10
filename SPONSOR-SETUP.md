# Connect InsightOS

Open **Settings & connections**. Account buttons open your system browser for sign-in. Paste credentials into the app's masked fields; do not send them in chat. Click **Save**, then **Test** for each provider. Changes apply without restarting. The local `.env` stores plaintext credentials and is excluded from Git. Blank key fields preserve the existing key. Closing Settings clears unsaved keys.

## First: AI and voice

1. **Hugging Face:** create an access token at [Settings → Access Tokens](https://huggingface.co/settings/tokens) with permission to make Inference Providers calls. Save it under Hugging Face. Leave text and vision models at defaults initially. Test runs actual command planning, code generation and a synthetic-image request. If a model is unavailable to your account, change its ID to a supported compatible model and test again. [Official inference setup](https://huggingface.co/docs/inference-providers/en/guides/first-api-call).
2. **ElevenLabs:** sign in to [your account](https://elevenlabs.io/app), create an API key with text-to-speech and speech-to-text access, and allow voice listing if leaving Voice ID blank. Save it under ElevenLabs. Test prefers an included premade voice if needed, generates short audio and sends it to Scribe for transcription. Library voices may require a paid plan for API use. Providing your own accessible voice ID skips voice listing. [Official API authentication](https://elevenlabs.io/docs/api-reference/authentication).
3. Close Settings and press the center Play button once. Start with **Hi, what can you help me with?**, then **Open Calculator** or **Make a PowerPoint about George Washington**. General conversation and browsing do not need a folder. File-producing tasks prepare a local workspace when needed. Keep **Spoken replies** enabled and test speaking over a reply on the actual laptop.

Tests use account credits. No automatic billing purchase is implemented. Missing credentials and failed checks are shown explicitly; a saved key is not a successful live test. Verification results reset after a server restart. Microphone permissions, playback, Stop and screen descriptions need a rehearsal on the actual demo laptop.

## Databricks analytics

Use an existing authorized workspace via [Databricks login](https://login.databricks.com/) or set one up through [Databricks Free Edition](https://www.databricks.com/learn/free-edition). Enter:

- Workspace URL: its HTTPS origin, without a path.
- SQL warehouse ID: from the warehouse's connection details.
- Access token: authorized for the Statement Execution API.
- Catalog/schema: defaults `main` / `insightos`; the account needs schema/table creation and insert/select permissions.

Save, then Test. It uploads the included synthetic fixture and runs both all-location and common-location revenue queries, checking known totals. Synthetic tables remain in your workspace. Once HF and Databricks are saved, enable **Use Hugging Face + Databricks in the data workspace** and rehearse a CSV task. Your chosen CSV is then uploaded for live analysis. [Official Statement Execution setup](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial). Account signup alone does not establish warehouse access or authentication; OAuth is not implemented in this pilot.

The buddy also supports **Analyze the demo Excel workbook with Databricks. Which region has the highest revenue?** It prepares the selected numeric measure and category, sends those values in a parameterized SQL query, and reads back the actual warehouse totals, average and highest group. The returned state keeps the statement ID for verification. This workbook path needs query access but does not create or replace tables. Requests that explicitly name Databricks fail clearly if the warehouse is missing; they never silently substitute local totals. Ordinary workbook requests still calculate locally.

Useful accessibility demo: a person asks about a workbook without navigating cells, hears the calculated answer, then asks a follow-up by category. The synthetic demo has six rows, total revenue **6,200**, and highest region **East, 2,700**. This is descriptive analytics, not forecasting or arbitrary Excel formula editing. On this laptop the workspace host is saved, but the warehouse ID and token are still missing; do not claim a live Databricks result until configured and tested.

## Neon saves

The desktop buddy also uses Neon for explicit conversational preferences: say “Remember that I prefer remote jobs.” It creates `insightos_assistant_memory`, uses owner-scoped parameterized SQL, and reads the notes when planning a goal. Say “What do you remember about me?” after restarting to verify persistence, or “forget my saved preferences” to clear them. Without `DATABASE_URL`, notes are saved locally and must not be described as Neon-backed. The existing Test button checks project storage; also rehearse the preference flow for this new feature.

In [Neon](https://console.neon.tech/), create or choose a project and copy its PostgreSQL connection string. Save it under Neon. Test creates the project table, writes a synthetic data project and reads it back. The test project is retained. Neon stores CSV workspace projects, not desktop browser or screen state. Never commit the connection string.

## Vultr

The new hybrid route hosts Hugging Face inference on the deployed service while keeping the desktop and its browser local. Set `INSIGHTOS_CLOUD_URL` and `INSIGHTOS_CLOUD_PASSPHRASE` on the laptop, keep `INSIGHTOS_APP_URL` empty, then run `npm run check:cloud`. Run an actual desktop goal through that configuration as well; record both the goal result and evidence that the server is your Vultr instance. No instance has been created by this build.

Vultr requires a real server deployment, domain/TLS and hosted session configuration. Its API key is not needed by the running InsightOS app. Follow [deploy/README.md](deploy/README.md) after you have instance access. Hosted CSV analysis is supported; controlling this laptop requires the local desktop backend. No Vultr resources have been provisioned by this build.

Hugging Face and ElevenLabs have passed real account requests on this machine. Databricks, Neon and deployment still need live checks. Keys and database passwords must stay out of videos, screenshots and the repository.
