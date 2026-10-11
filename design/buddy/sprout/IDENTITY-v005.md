# Sprout display identity

The visible frontend identity is **Sprout**. The browser title is “Sprout — Your desktop companion”; the compact header uses one plain wordmark. Workspace/public headings, transcript speaker labels, accessible names, frontend greetings/help, native window/tray/menu/dialog labels and launcher messages use the same name. `Start Sprout UI.cmd` is an additional launcher; the existing launcher remains usable.

This is a display change. It does not migrate data, replace the voice provider, change capabilities or rename hosted domains.

## Remaining-name classification

The source search covers `src`, `index.html`, `electron`, the launcher scripts and the retained launcher alias. Remaining matches are classified below rather than globally replaced.

| Remaining name                                                                            | Reason retained                                                                                                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `window.insightos`, `insightos:*` IPC, desktop headers and `insightos_session` cookie     | Existing Electron/session contracts.                                                                                        |
| `insightos.*` localStorage keys                                                           | Preserve preferences, drafts/session behavior and last project.                                                             |
| `INSIGHTOS_*` environment/configuration keys                                              | Existing deployment, connection and launcher contracts. Technical configuration fields still show their real key names.     |
| Package/repository names, GitHub/Vercel URLs, existing launcher filename                  | Existing development/deployment identity and compatibility. A new local launcher alias does not rename installed shortcuts. |
| `.insight-signal`, `.bill-insight`, `.insight-card` and `insight-core-v1`                 | Internal selectors or genuine legacy asset identifiers, not visible product branding.                                       |
| “We’ll find the insight” and local `insight` variables                                    | Ordinary English analysis terminology, not the old product name.                                                            |
| Sample PDF filenames/content, historical documents, old proof images and source citations | Historical evidence remains truthful.                                                                                       |

## Backend-owned surfaces left for the backend owner

The remaining backend identity strings include startup/unlock errors in `server/app.ts` and `server/start.ts`, file-change copy in `server/computer/controller.ts`, workbook metadata in `server/computer/finance-files.ts`, presentation cover/author strings in `server/computer/presentation.ts`, provider/planner/goal identity and generated Python-template comments. These can still appear in backend-generated output or exceptional server responses. They were not changed in this UI refinement.

The public sample's frontend-generated download is `sprout-sample-plan.json`. This does not rename server-generated files. Existing local fixtures verify the new frontend greeting and download while preserving their behavior; native window/tray checks are recorded in the v005 delivery report.
