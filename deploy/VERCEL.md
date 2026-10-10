# Public Vercel deployment

Public URL: https://insightos-livid.vercel.app/
Repository: https://github.com/Wasseem10/insightos

The `insightos` Vercel project is connected to the public GitHub repository. Production publishes use `npm run build:public`, with `dist` as the output. No provider keys are needed or deployed. `.vercelignore` excludes local configuration, credentials, development data and evidence artifacts; `.gitignore` excludes both Vercel account configuration and environment files.

The public sample is an interactive browser workflow, not a remote desktop agent. Its preloaded inputs come from the synthetic PDFs under `public/samples`. It uses the same validated bill comparison and affordability functions as the full desktop app. Visitors can correct inputs, change the budget, choose a fictional quote, review a local practice form, download a sample plan, or hear browser-generated narration. A changed bill, budget, choice or applicant detail invalidates the previous review. Nothing is submitted. Public browser speech is not presented as ElevenLabs.

Hugging Face, ElevenLabs and Databricks live functionality runs in the separately configured desktop app. Its real-provider evidence is in `artifacts`, and its recording sequence is in `COMPUTER-DEMO.md`. This deployment is not a Vultr or Neon integration.

To publish an update with an already authenticated Vercel CLI:

```powershell
npx vercel deploy --prod --yes
```

Do not upload `.env` or set the native app's `INSIGHTOS_APP_URL` to this public sample: the native companion should keep using its local API. Do not put credentials in `VITE_*` variables.

Verification: request the production root and both PDF routes while signed out, run the bill → budget correction → affordable choice → practice review flow, and check keyboard navigation, mobile width and large text. The Playwright public-demo tests assert that this flow makes no `/api` calls.
