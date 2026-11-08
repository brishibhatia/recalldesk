# Verification record

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
