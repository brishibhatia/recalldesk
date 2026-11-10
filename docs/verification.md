# Verification record

## 2026-11-10 — provider repair, separate additional allowance

Preserved the original four-attempt ledger byte-for-byte, the live merchant `5a151d00-8b4f-4060-82ea-5c3aea4528bf`, both databases and prior evidence. The user authorized **four additional small Gemini attempts**, stopping after one validated response. No write, transfer, billing upgrade, deployment, publication, commit or push was authorized or performed.

**Walrus diagnosis and correction:** authenticated Tatum account inspection found the active Mainnet account still had one registered delegate, labelled “Web App”. The value in `MEMWAL_DELEGATE_KEY` was exactly that delegate's **public key**, mistakenly used as a private seed. The resulting derived key was absent from the account. The running pilot matched its private file, and NTP was synchronized; the managed relayer's Date header differed by less than one second, within the documented five-minute window. The failure is not explained by account ID, network or clock drift.

Generated a fresh cryptographic Ed25519 delegate entirely locally and saved its private key only in the ignored pilot `.env.local`, mode 0600. Cleared the invalid unused value in the root demo configuration. Restarted both environments and verified the pilot process loads the corrected file. The fresh **public key** requiring owner-wallet registration is:

```text
8bc7393a2cb6a487e4ed813425def0f73b3a88abd756cc53a53bacf7e47e4566
```

Use the [Walrus dashboard](https://memory.walrus.xyz) with owner `0x81fc044adde8ee092bbaffd2a68aa5972a3567b7ca057faaedf7788a978978e3` and account `0x63076527a35bb00a5456d744dab277573563b18fd256ef9722faf2395cd4ca13`. Revoke the exposed old delegate. **Never register the previously reported `a7b645…` key:** it was derived from a public value. If already added, revoke it. Stop if payment is requested. No registration/revocation transaction was performed here. The new diagnosis command detects this misconfiguration and suppresses the unsafe derived key instead of suggesting its registration. Current recall is **blocked pending registration**; no authenticated recall success is claimed. [Current diagnosis](../artifacts/qa/provider-repair-20261110/walrus-diagnosis.json), [local correction](../artifacts/qa/provider-repair-20261110/walrus-local-fix.json), [process environment comparison](../artifacts/qa/provider-repair-20261110/process-environment.json).

**Gemini diagnosis before new calls:** older reports cannot recover HTTP statuses that were never retained. Offline capture against the installed SDK showed a default `/v1/interactions` route; current official examples use `/v1beta/interactions`. Pinned v1beta, selected documented low thinking, retained the full authoritative Zod/remedy/policy/citation checks and 1,000-token output cap. Instrumented only HTTP status, byte counts and timing, never raw headers/bodies/credentials. SDK stream-backed request bodies are now materialized without changing JSON/authentication so Node sends finite Content-Length. Local HTTP tests verify the route, body and actual cancellation. Metadata access and OPTIONS reachability do not establish project inference entitlement or available free quota. [Recorded diagnosis and sources](../artifacts/qa/provider-repair-20261110/gemini-diagnosis.json).

The new manifest names `provider-repair-20261110`, fixes the provider/model and four-attempt limit, binds the preserved original ledger hash and closes after a validated success. Missing/changed manifests or history fail closed. Paired evaluation refuses this grant. Each request reserves before sending and saves a separate redacted report; automatic retries and continuation remain disabled.

| Additional attempt | Actual result | Total elapsed | HTTP response headers |
| --- | --- | --- | --- |
| 1 | TIMEOUT; labeled fallback | 60,065 ms | None received |
| 2, finite request body | TIMEOUT; labeled fallback | 60,063 ms | None received |
| 3, two-evidence input | HTTP **503**, SDK `InternalServerError`; labeled fallback | 1,548 ms | After 1,448 ms |
| 4, same bounded input | HTTP **503**, SDK `InternalServerError`; labeled fallback | 1,778 ms | After 1,578 ms |

The last two requests allowed a maximum 120 seconds but returned the actual server failure promptly. Each report records exactly one transport request. **Original attempts 4 + repair attempts 4 = 8 total; zero validated responses; no remaining allowance.** No fallback is counted as inference success. The project dashboard's inference/free-quota eligibility remains unverified; no paid alternative was enabled. [Original ledger copy](../artifacts/qa/provider-repair-20261110/original-inference-ledger.json), [separate repair ledger](../artifacts/qa/provider-repair-20261110/repair-inference-ledger.json), [attempt 1](../artifacts/qa/provider-repair-20261110/gemini-attempt-1.json), [attempt 2](../artifacts/qa/provider-repair-20261110/gemini-attempt-2.json), [attempt 3](../artifacts/qa/provider-repair-20261110/gemini-attempt-3.json), [attempt 4](../artifacts/qa/provider-repair-20261110/gemini-attempt-4.json).

**Verification:** 116/116 tests passed in the isolated test database, lint/type checks passed, and root/pilot production builds passed on Node 24.22.1. The new worker tests use mocked providers and cover exact event filtering, an empty allowlist and terminal HTTP 402 handling. An initial database-test run found the local PostgreSQL process stopped; restarting the existing persistent instance without resetting data resolved it, and the full run passed. Browser sign-in and current merchant selection passed at 1440px and 390px, with zero page errors, axe violations or horizontal overflow; anonymous workspace access returned 401 and live demo entry 403. Scoped secret scanning and server trace checks are clean. [Tests](../artifacts/qa/provider-repair-20261110/tests.json), [browser report](../artifacts/qa/provider-repair-20261110/browser.json), [repair summary](../artifacts/qa/provider-repair-20261110/verification.json).

Prepared [the exact bounded Mainnet write procedure](mainnet-write-procedure.md), including a one-record target, completed receipt and exact-event remote recall before expansion to ten. The command now processes only selected logical events, stops on provider errors/payment-required, and preserves pending jobs. **It was not executed.** The saved write flag remains false; live memory events/jobs and confirmed Mainnet memories remain **0**. The historical synthetic 13/16 → 16/16 benchmark and published November8 article/video remain unchanged.

## 2026-11-10 Asia/Kolkata — authenticated checks and provisioned local merchant

After the user's explicit rotation/free-tier confirmation, used replacement values from the private pilot environment. No provider dashboard changes or billing upgrades were performed. Those confirmations are user attestations, not an independent audit of account settings.

The actual merchant is **`5a151d00-8b4f-4060-82ea-5c3aea4528bf`**, saved as `LIVE_MERCHANT_ID` in `.local/live-pilot/.env.local`. Migration and `merchant:create -- --controlled-product` succeeded against **recalldesk_live**. A second provisioning call returned the same UUID; the product is `controlled`. The database contains one merchant/product and **zero orders, cases, memory events and jobs**. No synthetic payment was inserted into the live database. The generated provisioning password was removed from the environment and retained only in an ignored mode-0600 local handoff file for the user's password manager. The demo database was not reset or migrated by these pilot commands.

| Check | Observed result |
| --- | --- |
| Authenticated Tatum TLS gRPC | Mainnet service read and account object read passed; this does not verify an order payment |
| Walrus account | Expected Mainnet `MemWalAccount` type; embedded owner **`0x81fc044adde8ee092bbaffd2a68aa5972a3567b7ca057faaedf7788a978978e3`**, saved as `MEMWAL_OWNER_ADDRESS`; differs from the payment recipient |
| Authenticated Walrus recall | **HTTP 401 / AUTH_REJECTED** with the configured account and namespace; replacement delegate access remains unresolved; zero writes |
| Gemini metadata | Authenticated `gemini-3.8-flash` model lookup passed; metadata is not inference or billing proof |
| Gemini synthetic inference | **4/4 attempts consumed; zero validated responses**. Attempt 1: 15-second timeout. Attempt 2: redacted provider failure. Attempt 3: process stopped when the SDK did not settle after its deadline; no response recorded. Attempt 4, after transport fix: bounded timeout at 30,017 ms. No automatic retries or continuation; no further inference/evaluation run |
| `integrations:check -- --live` | Intentionally exits nonzero: Tatum live, Walrus failed, Gemini metadata configured, PostgreSQL connected, worker running, Mainnet count 0, live recommendation inference null, writes disabled |
| Unit/database/provider suite | **99/99 passed** in isolated `recalldesk_test_gemini`; includes real SDK cancellation against a local HTTP server for stalled headers/partial bodies, safe diagnostics and all earlier policy/payment/tenant tests |
| Lint / type checks | Passed |
| Root and pilot production builds | Both passed with Node **24.22.1** |
| Actual pilot browser | Merchant login passed; correct live workspace; desktop 1440px/mobile 390px; zero page errors, axe violations or horizontal page overflows; anonymous workspace 401 and demo entry 403 |
| Local runtime | Demo `http://localhost:3000` and pilot `http://localhost:3001` returned HTTP 200; pilot restarted after saving UUID, owner and replacement credentials |
| Secret scan / Git | No detected findings in source/artifacts/browser bundles or server file traces. Root/pilot environments and private password handoff are ignored; pilot secrets/handoff mode 0600. No commit, push, publication or deployment |

The live check exposed a timeout reliability issue in the SDK path. The adapter now attaches its abort signal directly to the SDK's HTTP fetch and bounds SDK response processing. Local HTTP tests verify the connection closes during a stalled response body as well as before headers. The fourth real attempt then returned the honest timeout fallback within the configured limit. No failed attempt is counted as successful Gemini inference, and the durable budget remains exhausted.

The official Node **24.22.1** archive was downloaded from nodejs.org, checked against its published SHA-256, and extracted under ignored `.local/runtime`; the system runtime was not replaced. This meets the current [Walrus quick-start prerequisite](https://docs.wal.app/walrus-memory/getting-started/quick-start), which is newer than the Node version used in historical checks below.

Evidence: [current readiness](../artifacts/qa/pilot-20261110/readiness.json), [account/delegate report](../artifacts/qa/pilot-20261110/provider-preflight.json), [integration status](../artifacts/qa/pilot-20261110/integrations.json), [tests](../artifacts/qa/pilot-20261110/tests.json), [browser report](../artifacts/qa/pilot-20261110/browser.json), [desktop screenshot](../artifacts/qa/pilot-20261110/desktop-settings.png), [mobile screenshot](../artifacts/qa/pilot-20261110/mobile-settings.png), [attempt 1](../artifacts/qa/pilot-20261110/gemini-attempt-1.json), [attempt 2](../artifacts/qa/pilot-20261110/gemini-attempt-2.json), [attempt 3](../artifacts/qa/pilot-20261110/gemini-attempt-3.json), [attempt 4](../artifacts/qa/pilot-20261110/gemini-attempt-4.json). Screenshots were inspected visually. An initial browser locator expected the exact heading “Case inbox”; the real empty inbox includes its count. Correcting that locator to include the count made the check pass; no application change was needed.

**Still pending:** working delegate/account authorization, separately authorized additional Gemini verification, genuine matching payment and allocation checks, separately authorized Mainnet writes and fresh remote learning, public application hosting. Confirmed Mainnet memories remain **0**. The historical synthetic **13/16 → 16/16** benchmark is unchanged and is not a Gemini result. No money, transfers, memory writes or onchain delegate operations were used. The current local Gemini additions remain unpublished.

## 2026-11-10 Asia/Kolkata — configuration follow-up

Checked saved `.env.local` files at the project root and `.local/live-pilot`, their adjacent environment templates, and task-specific inherited variables without displaying values. The three provider keys remain blank in this workspace. `npm run pilot:run -- integrations:check -- --live` returned `configuration_incomplete`, naming `GEMINI_API_KEY`, `TATUM_API_KEY`, `MEMWAL_DELEGATE_KEY` and the still-unverified/generated `MEMWAL_OWNER_ADDRESS` and `LIVE_MERCHANT_ID`. No authenticated provider call or inference was made. Rotation and free-tier confirmation flags remain false. A path-only clarification was requested because the user's saved edits are not visible in either intended file.

Restarted the existing PostgreSQL server, demo web process, pilot web process and pilot worker without resetting data or changing environment values. HTTP health checks returned 200 at `http://localhost:3000` (demo) and `http://localhost:3001` (live). The pilot database still contains zero merchants and zero memory jobs; its worker heartbeat is current. Mainnet writes remain disabled and inference reservations remain zero. [Redacted readiness report](../artifacts/qa/pilot-20261110/readiness.json).

README now distinguishes the published 8 November release from local unpublished Gemini changes, identifies the exact pilot environment path and uses pilot wrappers for current live commands. No application code changed in this follow-up; the 9 November test/build results below remain historical evidence, not newly rerun claims. No publication, deployment, commit, push, spending, transfer or Mainnet write occurred.

**Later saved-file check (23:16 UTC / 04:46 IST):** the root `.env.local` changed and the three provider keys are now present. Copied only provider/public merchant settings into `.local/live-pilot/.env.local`, preserving its separate database, generated authentication secret and generated provisioning password. Both files remain ignored and mode 0600. The copied public addresses passed format validation; the supplied owner value was deliberately not copied because ownership must be read from the real account object. The pilot database connects and still contains zero merchants and jobs. Secret scan remains clean. Rotation and free-tier attestations remain false, so no authenticated call or inference was made pending that required confirmation. This supersedes the earlier missing-key observation, without turning key presence into provider verification.

## 2026-11-09 — Gemini and isolated local pilot

Implemented selected Gemini/OpenAI explanations with `@google/genai` **3.0.0**, current Interactions structured JSON output, shared Zod/decision validation, actual response model IDs, a cancellable timeout and disabled automatic retries/continuation. Authenticated model metadata checks are separate from inference and billing eligibility. Provider status, merchant/model-scoped inference evidence and live evaluation no longer assume OpenAI. Demo mode initializes neither model SDK.

The isolated pilot source is `.local/live-pilot`, with a separate dependency installation/build, `.env.local` restricted to mode **0600**, database **recalldesk_live**, loopback web listener at **http://localhost:3001**, and a standalone worker. Fresh random authentication and provisioning-password secrets were generated locally without displaying them. Public recipient/account values passed Sui address-format validation; onchain account ownership is **unverified**. Root `.env.local` remains unchanged. Demo business-table counts were compared before/after and remain unchanged: [isolation evidence](../artifacts/qa/gemini-20261109/isolation.json).

| Check | Observed result |
| --- | --- |
| `npm run pilot:setup` and `npm run pilot:run -- install` | Separate local database connected; locked installation succeeded; no demo data copied/reset |
| `npm run pilot:run -- db:migrate` | Existing three migrations applied to the separate pilot database |
| Full Vitest run using `.local/gemini-test.env` | **93/93 passed** after final review (initial run: 82/82); all database tests used `recalldesk_test_gemini`; no live provider calls: [JSON report](../artifacts/qa/gemini-20261109/tests.json) |
| `npm run lint` / `npm run typecheck` | Passed |
| `npm run build` / `npm run pilot:run -- build` | Both production builds passed |
| Production browser suite at port 3002 | **6/6 passed** with the isolated test database; customer intake, fulfillment, correction, evidence and cross-tenant/origin denials |
| Actual pilot browser checks | Desktop 1440px and mobile 390px: HTTP 200, live mode, no sample-entry button, anonymous workspace HTTP 401, demo mutation HTTP 403, zero page errors/overflow/axe violations: [report](../artifacts/qa/gemini-20261109/pilot-browser.json) |
| `npm run scan:secrets` | Zero findings, including source, artifacts and both available browser builds; configured secret values compared without disclosure |
| `npm run pilot:run -- integrations:check -- --live` | **Configuration incomplete**, not a provider success. Reports missing variables safely; no inference or memory writes |

Focused tests cover selection without an OpenAI key, demo isolation despite configured keys, input minimization, valid output, invalid JSON/schema/citations/remedy/policy, refusal, empty/oversized output, credential echo, HTTP 400/401/403/404/429/503, network failures, actual abort signals and no retry. Readiness tests cover active provider/model/merchant filters, canonical metadata aliases, stale configuration, and exclusion of fallback/error records. Durable budget tests cover four-attempt exhaustion, concurrency and failure on corrupt records/stale locks.

Final review found and fixed two additional issues: the first budget implementation covered CLI checks but could be bypassed by a later UI recommendation; the shared explanation boundary now enforces the same allowance for both. UI inference requires local free-tier/rotation attestations, the reviewed model and disabled writes. Ten mocked tests cover those gates, shared attempt consumption, rejection of a fifth request and demo/ordinary-app behavior. Invalid provider/model configuration also now retains a specific readiness error instead of being hidden by stale-check filtering. One additional readiness test covers missing configuration. No actual inference allowance was consumed by these tests.

Moving the budget guard into the server revealed broad Next.js filesystem tracing of local runtime files. The final build excludes `.env*`, `.local/**/*` and raw live artifacts from every server trace, and marks the ledger as runtime bookkeeping. Both final builds passed without that warning. The expanded scan checked **2,500 server dependency references** as well as source/browser bundles and found **zero private-runtime references or secret findings**. A direct gate check in the actual pilot environment returned `VERIFICATION_REQUIRED`, `deterministic-safety-fallback`, zero requests and unchanged zero budget reservations.

Two issues found during verification were fixed: the nested pilot initially inherited the parent Turbopack root; `next.config.ts` now anchors module resolution to the current project. Browser tests initially hardcoded port 3000; they now derive the origin from the active application. Final browser runs use only the test database. The demo's historical screenshots/reports were preserved. Actual pilot screenshots were visually inspected: [desktop](../artifacts/qa/gemini-20261109/pilot-desktop.png), [mobile](../artifacts/qa/gemini-20261109/pilot-mobile.png).

**Actual external results:** Tatum authenticated read **not performed**, Walrus account/delegate recall **not performed**, Gemini metadata/inference **not performed**. Replacement keys are absent and provider free-tier status has not been verified. The exposed values from chat were not copied or used. Provider-key rotation and delegate revocation/replacement require the account dashboards and remain pending; no onchain registration was attempted.

Missing pilot variables: `GEMINI_API_KEY`, `TATUM_API_KEY`, `MEMWAL_DELEGATE_KEY`, `MEMWAL_OWNER_ADDRESS`, `LIVE_MERCHANT_ID`. The latter two must come from the real account owner read and successful provisioning, respectively. Merchant count is **0**; no UUID is invented. A new local provisioning password is already saved privately; remove it only after successful creation. `WORKER_TOKEN` and `LIVE_TEST_DIGEST` remain blank.

**Gemini inference attempts: 0 / 4. Mainnet write attempts: 0. Confirmed Mainnet memories: 0.** `ALLOW_MAINNET_WRITES=false` throughout the local pilot. No payment transfer, spending, publication, deployment, commit or push occurred. The larger live evaluation remains unrun; its current shared four-attempt cap cannot cover all four paired scenarios. The historical synthetic 13/16 → 16/16 result remains separate. [Machine-readable verification summary](../artifacts/qa/gemini-20261109/verification.json).

Reproduce the isolated unit/database suite with `node --env-file=.local/gemini-test.env node_modules/vitest/vitest.mjs run` after migrating that test database. For browser tests set `PLAYWRIGHT_BASE_URL=http://localhost:3002` and start the app/worker with that test environment; the WSL library workaround below still applies. Use [live verification](live-verification.md) for the read-only owner/delegate check and bounded synthetic Gemini smoke command after rotation/free-tier confirmation.

## 2026-11-05 — foundations

- Empty dedicated workspace confirmed. No parent AGENTS.md or existing repository found.
- Node v24.18.0, npm 11.18.0 available.
- Docker Desktop binary exists but WSL integration is unavailable. A real local PostgreSQL fallback will be provided.
- Official event page and rules checked; deadline remains 2026-11-10 17:00 UTC.
- Sites skill inspected: Cloudflare Worker hosting is incompatible with the required raw TCP gRPC backend. No Site created or published.
- No live integration, Mainnet storage, deployment, or evaluation success asserted yet.

## 2026-11-08 — local implementation and production verification

Environment: Node 24.18.0, npm 11.18.0, real PostgreSQL 18.6 through `embedded-postgres`, Next.js 16.4.5. Checks below used synthetic demo data and local contract doubles; no private credentials or funds were used.

| Check | Observed result |
| --- | --- |
| `npm run db:migrate` | All three versioned migrations applied; subsequent run clean |
| `npm run db:seed` twice | Idempotent template; interactive demo clones remain independent |
| `npm test` | **44/44 passed**, three files: deterministic payment/ranking, PostgreSQL lifecycle/authorization/fulfillment, mocked live boundaries |
| `npm run lint` | Passed; incidental unused-variable warnings subsequently removed |
| `npm run typecheck` | Passed; runs installed `next typegen` before `tsc` for clean-checkout route types |
| `npm run build` | Production compilation, type checks and route generation passed |
| Production `npm start` | Actual Node server at `http://localhost:3000`; health and backend exercised |
| `npm run test:e2e` against production | **6/6 passed**, 1440px desktop and 390px mobile; full customer/merchant lifecycle and access denial |
| `npm run test:a11y` against production | **16 screens, zero detected violations, zero horizontal page overflows**, WCAG A/AA axe checks; not certification |
| `npm run evaluate` | 14 learning / 16 held-out synthetic cases; baseline13/16, memory16/16, failed repetitions3→0, invalid citations0, unsupported approvals0 |
| `npm audit --omit=optional` | Zero reported vulnerabilities at check time |
| `npm run scan:secrets` | No detected secret-pattern findings in scoped source/publication artifacts |

Evidence: [raw accessibility report](../artifacts/qa/accessibility.json), [measured evaluation](../artifacts/evaluation/latest.json), [dataset](../artifacts/evaluation/dataset-v1.json), [browser screenshots](../artifacts/screenshots/), [QA screenshots](../artifacts/qa/).

The browser workflow verifies customer code sign-in, request creation, revisit after reload, customer follow-up, missing product access, merchant payment/recommendation/comparison/approval, actual entitlement grant, protected download, confirmed outcome, memory evidence, reopening and a fresh browser context. Invalid-recipient and unavailable-provider screens were captured. Cross-origin mutations and another session's object reference were rejected. No console page errors were observed in the lifecycle tests.

The database learning test introduces a **new** failed outcome, verifies that queued/accepted events do not contribute, completes it through the actual worker, then checks a new comparable case in a fresh operator session. Relink falls from0.8 to8/11; resend wins at0.8 and the new logical event is cited. Entitlement tests verify duplicate/concurrent execution, one grant/receipt, and wrong customer/merchant denial. These are demo persistence checks, not Mainnet claims.

Visual inspection used actual Chromium screenshots of the desktop case/comparison, mobile evidence, inbox and customer product states. Contrast failures from the first axe run were fixed; scrollable tables gained keyboard focus. Small muted labels were enlarged before the final production inspection.

### Browser environment

This WSL image lacked Chromium's NSS/NSPR/ALSA shared libraries. They were extracted under ignored `.local/browser-libs`, without modifying system packages. Browser commands here used:

```sh
LD_LIBRARY_PATH=/home/rishibhatia/documents/track2/.local/browser-libs/usr/lib/x86_64-linux-gnu npm run test:e2e
LD_LIBRARY_PATH=/home/rishibhatia/documents/track2/.local/browser-libs/usr/lib/x86_64-linux-gnu npm run test:a11y
```

On a normal supported host use `npx playwright install --with-deps chromium`; Windows only needs the standard Playwright Chromium installation. The local library directory is not committed or deployed.

### Live and external limits

- Tatum: adapter/types/decoder tested locally; actual authenticated Mainnet order receipt, wallet-format acceptance and live replay checks **pending**.
- Walrus: SDK adapter/job state contracts tested with local doubles; **0** completed real Mainnet memories. Account/delegate, remote recall and new-outcome live learning **pending**.
- OpenAI: structured-output adapter and output validation implemented; no live model invocation or live evaluation claimed. The separate live runner is opt-in and budget bounded.
- Second client: real remote read command prepared, still depends on the PostgreSQL integrity ledger; not ledger-free portability.
- Public application deployment: **pending** compatible host/database/worker connection and spending limit. Sites raw-TCP restriction prevents native gRPC hosting there.
- Docker/Compose: artifacts prepared; runtime build not executed because WSL Docker integration is unavailable.
- Submission account identifiers and organizer clarification: not fabricated; actual form not submitted.

See [submission checklist](submission-checklist.md) and [Mainnet evidence](mainnet-evidence.json). A passing local build or static article is not evidence of a hosted live backend.

### Clean checkout and recording

A staged source export without `node_modules`, `.next`, `.env.local` or local database files was installed with `npm ci`. It generated route types, migrated a separate PostgreSQL database, seeded and built successfully. It was then moved to `/tmp/recalldesk-clean-checkout-20261108` and built again outside the original workspace to avoid parent-lockfile resolution. npm emitted deprecated tooling/install-script notices but completed with zero reported audit vulnerabilities. Local database startup uses explicit embedded-Postgres symlink rehydration.

The actual demo recording is [recalldesk-demo.webm](../artifacts/demo/recalldesk-demo.webm), approximately2:40 at1440×1000, with no voice audio. It shows the customer product restore, completed simulated outcome, superseded success, a new case selecting resend from the corrected evidence, invalid recipient, and actual fixture evaluation. The first recording attempt failed an assertion because the script observed the previous completed event before the correction committed; the script now waits for the exact failed outcome. Incomplete captures are ignored and not publication artifacts.

Final media metadata: **160.16 seconds**, 1440×1000 VP9, 25fps. The final capture includes visible on-screen sample-provider captions. Screenshot frames were inspected, including the actual19-example decision with resend0.80 and relink0.73. The new checkout's server on port3002 returned health200, demo entry200 and a persisted26-case workspace (six active cases plus20 historical cases).

### Public publication

The repository was created and pushed to [github.com/brishibhatia/recalldesk](https://github.com/brishibhatia/recalldesk); GitHub confirmed `PUBLIC` visibility and a populated repository. Only project source, synthetic reports/screenshots and the inspected recording were included. No private environment files, runtime database, raw live artifacts or incomplete captures were published.

The first article workflow failed at Pages configuration because it ran before Pages was enabled on the new repository. Pages has since been configured for workflow deployment. Final article reachability and independent CI outcome are recorded below after verification; no backend deployment is inferred from the static publication.

- [Independent GitHub CI run](https://github.com/brishibhatia/recalldesk/actions/runs/42504077100): **passed**, including fresh npm install, PostgreSQL migrations/seed, lint, route type generation, unit/database tests, evaluation, scan, build, six browser tests and accessibility checks.
- [Article deployment](https://github.com/brishibhatia/recalldesk/actions/runs/42504200065): **passed** after Pages configuration. Published at [brishibhatia.github.io/recalldesk](https://brishibhatia.github.io/recalldesk/).
- The actual [video file](https://brishibhatia.github.io/recalldesk/recalldesk-demo.webm) is served by that static site. Its [local media inspection](../artifacts/demo/media-inspection.json) ties the measured duration to the file hash.
- The separate article's automated mobile accessibility check also passed with zero detected violations and no page overflow: [report](../artifacts/qa/blog-accessibility.json).
- A fresh unauthenticated Chromium context loaded the published article with HTTP200 and the actual video metadata (160.16seconds, 1440×1000): [public reachability report](../artifacts/qa/publication.json).

## 10 November final submission follow-up

User authorization now includes reviewed source/article publication, four more small Gemini attempts and a gated one-then-ten synthetic Mainnet phase. No spending, transfers or automatic owner-wallet registration are permitted. The replacement delegate remains absent from the account; no writes were attempted and the completed count remains zero.

- Added the official `Api-Revision: 2026-05-20` header and tested actual installed-SDK transmission.
- Added hash-linked prior grants; the original eight attempts remain unchanged.
- Added user-requested bounded backoff, Retry-After handling, per-request reservations, permanent-error stopping and redacted attempt history. SDK retries remain disabled.
- The new four requests returned three HTTP 503 responses and one timeout. The retry run honored a 30-second provider delay and a four-second backoff. **12 total attempts, zero validated responses; allowance closed.**
- Current unit/database/provider suite: **138/138 passed** against `recalldesk_test_gemini`; lint and type checks passed. Production build/publication results are recorded in the final report after completion.

[Final evidence](../artifacts/qa/submission-20261110/verification.json), [tests](../artifacts/qa/submission-20261110/tests.json), [first attempt](../artifacts/qa/submission-20261110/gemini-attempt-1.json), [three-attempt retry run](../artifacts/qa/submission-20261110/gemini-attempt-4.json). The 13/16 → 16/16 synthetic benchmark is unchanged and is not a Gemini evaluation.
