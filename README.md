# RecallDesk

**Payment-aware support that remembers what actually helped.**

RecallDesk is a support workspace for merchants selling digital access or services through direct Sui payments. It checks a customer's payment, recalls relevant case experience, applies current merchant policy, and recommends the next eligible remedy. A merchant approves the action and confirms its outcome. Later cases can use that experience, with visible evidence explaining **what changed because of memory**.

Built for **Total Recall — Track 2: Smart Agents for Real Life**. This repository is a working local application, not a claim of hackathon submission or live Mainnet readiness.

![RecallDesk case workspace](artifacts/screenshots/desktop-case.png)

## Current status

| Area | Status |
| --- | --- |
| Local application | Next.js UI, Node backend, persistent PostgreSQL database |
| Case lifecycle | Case creation → payment check → recall → recommendation → approval → attempted action → confirmed outcome → queued memory |
| Learning | Deterministic ranking, cited evidence, policy filtering, reopened-outcome supersession |
| Controlled fulfillment | Approved access remedy grants a real, idempotent entitlement to a protected workbook; customer can download it |
| Judge evidence | Payment, recall, policy, scores, write status and evaluation in one scoped view; redacted JSON export |
| Demo | Isolated reviewer workspaces; synthetic cases and simulated payment/memory/model providers |
| Live adapters | Tatum native Sui gRPC, official Walrus Memory SDK, OpenAI structured outputs implemented |
| Live verification | Pending credentials and an authorized merchant-owned memory account |
| Confirmed Mainnet memories | **0**; no Mainnet writes have been performed during this build |
| Deployment/publication | Node/Docker artifacts prepared; no public deployment or repository published |

See [verification](docs/verification.md) for current test results and [submission checklist](docs/submission-checklist.md) for the separate live requirements.

## Run locally

Use **Node.js 24** and npm. All package versions are locked in `package-lock.json`. Commands work in Bash and PowerShell unless a platform-specific alternative is stated.

```sh
npm ci
```

Keep these three terminals open:

**Terminal 1 — local PostgreSQL**

```sh
npm run db:local
```

This starts actual PostgreSQL on `127.0.0.1:55432`, with persistent local data in the ignored `.local/postgres` directory. It is a development convenience, not a production database service. No Docker installation or API keys are needed for the demo.

**Terminal 2 — database setup and application**

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

**Terminal 3 — durable memory worker**

```sh
npm run worker
```

Open **[http://localhost:3000](http://localhost:3000)** and select **Open sample workspace**. Each entry creates an isolated reviewer workspace; the idempotent seed template is not shared interactive state.

For an existing PostgreSQL server, copy `.env.example` to `.env.local` and set `DATABASE_URL`. Next.js and the command scripts load `.env.local`. Do not commit it.

```powershell
# PowerShell
Copy-Item .env.example .env.local
```

```sh
# Bash
cp .env.example .env.local
```

For a production-mode local preview, stop `npm run dev`, then run:

```sh
npm run build
npm start
```

The database and worker must remain running. After a terminal/session interruption, restart all three processes; stored records remain in PostgreSQL.

## Try the learning loop

1. Open **Paid, but my studio is still locked** in the inbox.
2. Select **Check payment**. The demo clearly labels its simulated Tatum result.
3. Select **Generate recommendation**. Compare the baseline browser refresh with the learned account relink; open a recalled case citation.
4. Select **Approve action**, then **Restore controlled product access**. Approval and execution are separate steps. This grants an actual local entitlement to the protected workbook.
5. Record **Resolved** or **Failed**. Open **Learning timeline** to watch the worker progress from queued/accepted to completed.
6. Reopen a resolved case. Its earlier success remains inspectable but is superseded for ranking.
7. Reload or open the same authorized session in a fresh browser context and generate a fresh recommendation. No conversation state is needed.
8. Try the wrong-recipient or unavailable-provider case. Neither becomes a verified payment.

The controlled product changes real application state. It does not change an outside merchant account, send mail, or transfer funds. Live pilot provisioning can explicitly enable the same workbook with `npm run merchant:create -- --controlled-product`; other live products retain external fulfillment.

For the full customer journey, issue an order-scoped code in **Integrations & policy**, open `/support`, and use the code. The customer can create and revisit a ticket, add information, and download the product after an approved restore. A code for another order cannot claim this payment or download. Codes are shown once and stored as hashes.

Select **Compare with memory disabled** to replay the same payment and current policy with and without the recommendation's evidence. Select **Judge evidence** to inspect and export the redacted record. See the [2–3 minute runbook](docs/demo-runbook.md).

## How memory changes the decision

Current policy, product version, issue type, and payment state first determine the eligible remedies. For each eligible remedy:

```text
score = (confirmed successes + 1) / (confirmed successes + confirmed failures + 2)
```

Ranking uses compatible, authentic, non-superseded examples returned by the selected memory provider. A fixed priority breaks ties. Fewer than two eligible examples retains the policy baseline. Scores are heuristic estimates from retrieved examples, **not calibrated confidence percentages**.

The sample history contains failed browser refreshes and successful account relinks. The workspace shows the before/after recommendation, counts, and supporting source IDs. Current policy can exclude a historically successful remedy. A reopened attempt contributes one corrected outcome, not two independent examples.

To introduce new feedback, record a failed relink (or resolve then reopen it), wait for its memory to complete, and select **Open a comparable case**. On the initial sample history, relink moves from 8/10 to 8/11 while resend stays at 4/5, so the later case selects resend. A new success instead raises relink's score without forcing a winner change. The new logical event must appear in the later case's recalled evidence.

In live mode, retrieval must actually go through Walrus recall. The local event ledger validates returned content and supersession; it does not substitute local rows for missing remote evidence. See [learning](docs/learning.md).

## Architecture

```text
Browser (merchant session / scoped customer capability)
  → Next.js Node API: authorization, validation, current policy
  → deterministic Tatum payment verification + PostgreSQL allocation
  → Walrus recall → source validation → eligible-remedy ranking
  → structured LLM explanation → server validation
  → merchant approval → attempted action → confirmed outcome
  → PostgreSQL event + transactional outbox
  → leased worker → Walrus accepted job → completed storage
```

PostgreSQL is authoritative for users, tenants, orders, payment allocations, policies, workflow, corrections, and outbox bookkeeping. Walrus stores the durable experience used for live recall. The model cannot change payment state, policy, permissions, or storage completion.

| Directory | Responsibility |
| --- | --- |
| `src/app`, `src/components` | Responsive screens and API routes |
| `src/core` | Payment rules, schemas, ranking, explanation validation |
| `src/server` | Authentication, scoped case services, fixtures, readiness, worker |
| `src/server/providers` | Tatum gRPC, Walrus Memory, structured LLM adapters |
| `src/db`, `drizzle` | Typed relational schema and versioned SQL migrations |
| `src/evaluation` | Fixed learning/held-out dataset and measured runner |
| `tests` | Unit, database, provider-contract and browser coverage |
| `scripts` | Setup, workers, evaluation, live checks, explicit showcase writes |
| `docs`, `artifacts` | Technical handoff, reports, screenshots and demo materials |

See [architecture and trust boundaries](docs/architecture.md).

## Demo versus live

**Demo:** `APP_MODE=demo` (default). No provider keys required. Synthetic merchant/order/payment/history data; sample recommendation adapter; memory persists in PostgreSQL under an explicitly simulated provider. Session reset revokes only that demo session and creates a new clone on re-entry. It does not erase remote data.

**Live:** `APP_MODE=live`. HTTP signup and demo entry are disabled. Provision the pilot merchant with `npm run merchant:create`. Configure Tatum, the merchant-owned Walrus account/delegate, and an accessible structured-output model in the server environment. Run explicit integration checks. Provider errors remain visible; no live error silently enables fixtures.

Live payment support is deliberately narrow: one exact direct payment, a pre-associated payer, and a supported `SplitCoins → TransferObjects` transaction. Batches, partial payments, swaps, sponsored/ambiguous transfers, and unbound buyers require review. A digest alone is not buyer authentication.

Only completed real Mainnet writes count as Mainnet memories. An accepted job does not. The first pilot maps one live merchant to one merchant-owned account and dedicated delegate. Namespace separation is not cryptographic tenant isolation.

**Never paste private keys into chat.** Configure secrets locally or in your host's secret manager. The full variable list and setup are in [.env.example](.env.example) and [integration instructions](docs/integrations.md).

## Commands and verification

```sh
npm run lint
npm run typecheck
npm test                         # Requires migrated PostgreSQL; no live provider calls
npm run evaluate                 # Generates artifacts/evaluation/*.json
npm run build
npm run scan:secrets
npx playwright install chromium
npm run test:e2e                  # Requires the running app + database + worker
npm run test:a11y                 # Same running app; automated accessibility checks
npm run demo:record               # Captures the real 2:40 sample workflow, with captions
```

On Linux, Chromium may require system libraries (`npx playwright install-deps chromium`). This build's WSL environment used an ignored local library directory; [verification](docs/verification.md) documents that workaround. Windows users install the Chromium browser normally.

The first measured evaluation used **16 held-out synthetic cases** and **14 separate learning examples**: baseline **13/16**, memory-enabled **16/16**, with **0 unsupported approvals** and **0 invalid citations**. These are deterministic fixture results, not real-world accuracy or live-model quality. The dashboard remains empty until a run is requested in that workspace.

- [Generated evaluation report](artifacts/evaluation/latest.json)
- [Exported versioned dataset](artifacts/evaluation/dataset-v1.json)
- [Desktop and mobile screenshots](artifacts/screenshots/)
- [Actual 2:40 sample recording](artifacts/demo/recalldesk-demo.webm)
- [Detailed verification record](docs/verification.md)
- [Opt-in live payment, model evaluation and second-client checks](docs/live-verification.md)

Other operational commands:

```sh
npm run db:generate
npm run demo:reset -- <demo-workspace-uuid>
npm run worker -- --once
npm run worker:resume -- <job-uuid> --confirm
npm run integrations:check -- --live
npm run payments:smoke -- --live --case <case-uuid> --digest <actual-digest> --wallet "wallet and version"
npm run recall:client -- --live
npm run evaluate:live -- --live --allow-inference --dataset .local/live-eval.json
npm run mainnet:seed -- --confirm-account <account-id> --confirm-namespace <namespace> --count 20
```

The last command is an explicit live write operation. It requires live configuration, successful authenticated checks, and `ALLOW_MAINNET_WRITES=true`. It is never part of tests, seeding, or CI. Review the destination and obtain authorization before running it.

## Deployment and remaining external work

Use a Node 24 host with outbound native gRPC/HTTP2, persistent PostgreSQL, and a separate long-running worker (or authenticated scheduled worker calls). A [Dockerfile](Dockerfile), [Compose configuration](compose.yaml), and [deployment procedure](docs/deployment.md) are included. The connected Sites runtime uses Cloudflare Workers without the required raw TCP path, so it was not used to claim a working backend deployment.

Live readiness still requires configured credentials, successful authenticated Tatum reads, at least ten completed Mainnet memories, and live recall in a fresh session. Public application hosting and submission identifiers remain separate delivery steps. No static blog or repository link is presented as a deployed support backend.

## Documentation

- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [Architecture](docs/architecture.md)
- [Learning and evaluation](docs/learning.md)
- [Integrations](docs/integrations.md)
- [Deployment](docs/deployment.md)
- [Demo runbook](docs/demo-runbook.md)
- [Blog draft](docs/blog-draft.md), also available at `/blog`
- [Submission checklist](docs/submission-checklist.md)
- [Verification](docs/verification.md)
- [Mainnet evidence status](docs/mainnet-evidence.json)

## Privacy, limitations, and license

Only minimized structured experience belongs in memory. The standard Walrus relayer processes plaintext before encryption. Corrections and delegate revocation do not promise erasure of old blobs or information already read. External fulfillment, email and refunds remain merchant operations. The controlled workbook is the only built-in entitlement target. The assistant drafts and recommends; it does not autonomously transfer funds.

**Application source: all rights reserved; no general reuse license granted.** Public visibility and permission to reuse are separate. The checked event rules require a public repository, but do not explicitly require an open-source license. Third-party dependency and asset licenses remain applicable; see [NOTICE.md](NOTICE.md). The team may adopt a separate reuse license later.
