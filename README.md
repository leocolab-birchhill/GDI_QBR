# GDI QBR OS

An **email-first operating system for Quarterly Business Reviews (QBRs)**. Non-technical GDI Operations users drive the entire QBR lifecycle from their inbox: they email a shared mailbox, receive reminders, reply with rough notes, approve/revise drafted content, and receive a generated PowerPoint.

> **Core principle**
> - **Email** = primary user interface
> - **Database** = source of truth
> - **AI** = extractor, classifier, interviewer, rewriter, drafter
> - **PowerPoint renderer** = final formatting engine
> - **VP** = final approver

The app — not the AI — is the source of truth. AI output is always validated with Zod and stored alongside the raw operator input.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| Database | Prisma ORM — **SQLite** by default (`file:./dev.db`), Postgres-ready |
| Styling | Tailwind CSS + shadcn-style UI primitives |
| Validation | Zod (env + all AI outputs) |
| AI | OpenAI Node SDK (graceful **offline fallback** when no key) |
| PowerPoint | `pptxgenjs` — deterministic 7-slide renderer |
| Email | Provider abstraction (Mock first; Microsoft Graph skeleton) |
| Tests | Vitest |

---

## Quick start

```bash
# 1) Install dependencies
npm install

# 2) Configure environment (placeholders only in the template)
#   IMPORTANT: the Prisma CLI + seed only auto-load `.env` (NOT `.env.local`).
#   Use `.env` for DATABASE_URL; put app secrets in `.env.local` if you prefer.
cp env.example .env
#   then edit `.env` — set OPENAI_API_KEY to enable real AI (optional)

# 3) Create the database + apply migrations
#   (NODE_OPTIONS=--use-system-ca is only needed behind a TLS-inspecting proxy)
npx prisma migrate dev

# 4) Seed demo data (Leo/Bruno/Sarah/Marie + McGill University Q1 2026)
npm run db:seed

# 5) Run the app
npm run dev
# → http://localhost:3000
```

> The app runs **fully offline without an OpenAI key** — a deterministic
> heuristic layer (`src/lib/ai/fallbacks.ts`) covers classification, extraction,
> client-safe rewriting, missing-info questions, and VP summaries.

### House deck template (AI format example)

The AI drafter is grounded on the **real approved deck**. At runtime the app
opens the `.pptx` at `QBR_TEMPLATE_PATH` (default
`./templates/qbr_brand_template.pptx`), extracts a slide-by-slide transcript
(`src/lib/ppt/templateExtract.ts`), and injects it into the deck-drafting prompt
as the exact format example. To use a different reference deck, drop it in
`templates/` and point `QBR_TEMPLATE_PATH` at it — no code changes needed. If the
file is missing/unreadable the app falls back to the curated static reference
(`src/lib/ppt/templateReference.ts`).

> Note: OpenAI chat/responses models do **not** natively parse `.pptx` bytes
> (only PDFs/images are read directly), so the deck is parsed locally and its
> content is fed to the model as text. The final `.pptx` is still produced by the
> deterministic `pptxgenjs` renderer, so output is always exactly 7 client-facing
> slides. Generated decks are attached to the draft/final emails **and** exposed
> as a direct download link (workspace → Deck Versions, and the email simulator
> result panel).

### Corporate TLS proxy note (Cato/Zscaler/etc.)

If `prisma generate`/`migrate` fails with `self-signed certificate in certificate chain`, your network inspects TLS. Node 20.6+ can trust the OS store:

```bash
# macOS/Linux
NODE_OPTIONS=--use-system-ca npx prisma migrate dev
# Windows (PowerShell)
$env:NODE_OPTIONS="--use-system-ca"; npx prisma migrate dev
```

### Optional: Postgres instead of SQLite

```bash
docker compose up -d
# set DATABASE_URL=postgresql://qbr:qbr@localhost:5432/qbr?schema=public in .env.local
# change datasource provider to "postgresql" in prisma/schema.prisma
npx prisma migrate dev
```

---

## Demo flow (no email server required)

1. Open **`/api-test/email`** (Email Simulator).
2. Click the sample buttons in order and **Send** each:
   1. **Start QBR** → creates the QBR, replies with a missing-info checklist.
   2. **Monthly update** → extracts a priority candidate, an upcoming item, and H&S metrics; rewrites them into client-safe language.
   3. **Add metrics** → captures confirmed metrics (unknowns become **"To confirm"**).
   4. **Request draft** → generates `..._Draft_v1.pptx` and lists unconfirmed items.
3. Open the **QBR workspace** (link in the result, or `/dashboard`).
4. Click **Record VP Approval**, then **Finalize**.
   - Finalize is **blocked** without VP approval.
   - Finalize is **blocked** while required metrics are unconfirmed, unless override is enabled in **Settings** (or the Finalize call passes `allowOverride`).
5. Generated decks appear under **Deck Versions** (downloadable `.pptx`).
6. Trigger reminders/surveys/roll-forward from **`/api-test/jobs`** or the workspace buttons. Mock emails print to the **server console** and are logged under the **Emails** tab.

---

## End-to-end pipeline

```
inbound email ─► provider.parseInboundPayload()
              ─► classifyEmailIntent() + extractQbrDataFromEmail()  (Zod-validated)
              ─► store EmailMessage / Attachment (raw)
              ─► route by intent (orchestrator)
                   CREATE_QBR  → account + cycle + missing-info checklist
                   UPDATE/ADD_*→ rewriteClientSafe() → persist (raw + client-ready)
                   REQUEST_DRAFT → buildSlideContent() → generateQbrDeck() → DeckVersion
                   APPROVE/REVISE/FINALIZE → Approval + guardrails
              ─► reply email (templates) + AuditLog
```

---

## Project structure

```
prisma/
  schema.prisma            # all models (SQLite; Postgres-ready)
  seed.ts                  # demo users, account, QBR, sample data
src/
  lib/
    env.ts                 # Zod-validated env (only place OpenAI vars are read)
    constants.ts           # enum-like string contracts (statuses, intents, groups)
    db.ts  audit.ts  storage.ts  utils.ts
    ai/                    # classify / extract / rewrite / questions / slides / review / vp-summary
      schemas.ts           # Zod schemas for ALL AI output
      fallbacks.ts         # deterministic offline implementations
    email/
      providers/           # EmailProvider + Mock + MicrosoftGraph skeleton
      templates.ts         # text + HTML email templates
    ppt/generateQbrDeck.ts # deterministic 7-slide renderer
    jobs/                  # reminder engine (cron-ready)
    qbr/                   # service, orchestrator, slideContent, settings
  app/
    dashboard/  qbr/[id]/  admin/(settings|accounts|users)/  api-test/(email|jobs)/
    api/                   # email/inbound, qbr/*, admin/*, jobs/run, files/*
tests/                     # vitest: schemas, deck (7 slides), finalize guard, reminders
```

---

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/email/inbound` | Inbound webhook (normalized per active provider) |
| POST | `/api/qbr/start` | Programmatic QBR start |
| GET | `/api/qbr` | List QBRs (dashboard) |
| GET | `/api/qbr/[id]` | Full QBR with relations |
| POST | `/api/qbr/[id]/generate-draft` | Render a draft deck version |
| POST | `/api/qbr/[id]/approve` | Record VP approval |
| POST | `/api/qbr/[id]/revise` | Record revision + regenerate |
| POST | `/api/qbr/[id]/finalize` | Finalize (guardrailed) |
| POST | `/api/qbr/[id]/send-reminder` | Send a specific reminder |
| POST | `/api/qbr/[id]/survey/send` | Send post-QBR surveys |
| POST | `/api/jobs/run` | Run any reminder/roll-forward job |
| GET/POST | `/api/admin/settings` | Read/update admin settings |
| GET/POST | `/api/admin/accounts` `/api/admin/users` | Manage accounts & users |
| GET | `/api/files/[...path]` | Serve generated `.pptx` / attachments |

---

## Security & guardrails

- **Secrets only via env vars.** `env.example` holds placeholders; `.env`/`.env.local` are git-ignored and never committed.
- **VP approval required** before a deck can be finalized (`assertCanFinalize`).
- **Unconfirmed metrics block finalization** unless explicitly overridden.
- **Raw input and client-ready text are stored separately** on every item.
- **Never invent values** — unknown metrics become **"To confirm"**.
- **Audit log** for AI extraction, deck generation, reminders, approvals, revisions, finalization.
- Final client-facing decks are **never auto-emailed to clients**; sending is operator-driven and gated on VP approval.

---

## Tests

```bash
npm test
```

Covers: intent & extraction schema validation, missing-info generation, client-safe
rewriting, reminder/email generation, VP summary, deck generation produces a
`.pptx`, **deck has exactly 7 slides**, **internal slides never included**,
**unknown metrics become "To confirm"**, and **finalization blocked without VP approval**.

---

## Extending the email provider

Implement `EmailProvider` (`src/lib/email/providers/EmailProvider.ts`) and register
it in `getEmailProvider()`:

- `MockEmailProvider` — default; logs + records to DB (offline).
- `MicrosoftGraphEmailProvider` — **skeleton** wired to `MICROSOFT_*` env vars.
  TODO: OAuth token flow, `sendMail`, and inbox polling/subscriptions.
- TODO stubs noted for SendGrid / Mailgun / Postmark.

The app works without any real provider via `/api-test/email`.
