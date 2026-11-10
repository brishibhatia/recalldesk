# RecallDesk implementation plan

Specification received 2026-11-05. Implementation readiness and live/submission readiness are separate.

## Milestones

- [x] 1. Inspect current docs/types; lock compatible dependencies; PostgreSQL schema and authentication.
- [x] 2. Complete persisted case → payment → recall → recommendation → approval → outcome → outbox vertical slice.
- [x] 3. Corrections, policy enforcement, tenant isolation, payment allocation, durable jobs and provenance.
- [x] 4. Versioned held-out evaluation, consequential tests, production build and desktop/mobile browser QA.
- [x] 5. Deployment artifact, exact setup, blog/runbook, evidence and acceptance reconciliation. External live readiness remains below.

## November 8 focused improvements

- [x] Controlled workbook with real order-scoped entitlement, protected download and idempotent fulfillment execution.
- [x] Customer creates/revisits own ticket, adds information, and opens restored product; other-order access denied.
- [x] New merchant failure changes a fresh comparable case only after its outbox event completes; 44 automated tests pass.
- [x] Memory-disabled comparison replays identical policy/payment; judge evidence exports explicitly redacted projections.
- [x] Separate opt-in real-wallet smoke, bounded live-model evaluation, and second-process remote recall clients prepared.
- [x] Six production browser tests and sixteen desktop/mobile automated accessibility screens pass.
- [ ] Actual wallet receipt shape and live Tatum allocation checks: credentials and genuine order/payment missing.
- [ ] Ten completed Mainnet memories and new-outcome live recall: merchant account/delegate configuration missing.
- [ ] Persistent public app/database/worker: Node-compatible hosting connection and budget missing.
- [ ] Submission identifiers, organizer wording clarification and actual form submission: user-owned inputs pending.

## 9 November — Gemini and isolated zero-spend pilot

- [x] Add official Gemini structured explanations while retaining selected OpenAI support and keyless demo behavior.
- [x] Validate remedy, policy and recalled IDs; bound input/output; cancel timeouts; disable inference retries and automatic continuation; redact errors.
- [x] Update readiness, evidence and evaluation for the actual selected provider/model and exclude fallback/error records.
- [x] Prepare separate local pilot source, database, dependency installation, private environment, web listener and write-disabled worker.
- [x] Generate fresh local authentication and merchant-password secrets; preserve the root demo environment/data.
- [x] Add a durable four-attempt verification allowance shared by UI/CLI with free-tier/rotation gates and read-only account/delegate discovery; no live calls made without replacement credentials.
- [x] Pass 93 tests (initial 82 expanded after review), six browser tests, lint, type checking, both production builds and scoped secret scan.
- [x] User confirmed credential replacement/revocation and free-tier access; replacement values loaded privately from local configuration. This is an operator attestation, not an independent dashboard audit.
- [x] Authenticate Tatum Mainnet, verify the embedded Walrus owner, provision the controlled merchant and save its actual UUID; repeated provisioning returns the same merchant.
- [ ] Authenticate Walrus recall: actual managed-relayer request returns HTTP 401; delegate/account access needs correction outside this no-onchain-change task.
- [ ] Validate live Gemini structured output: 4/4 authorized attempts consumed, zero validated responses. Metadata access passed; inference failures are recorded. No further calls authorized.
- [x] Expand to 99 passing tests, including actual SDK connection cancellation against a local HTTP server; retain all earlier verification evidence.

## 10 November — provider repair

- [x] Compare locally derived public delegate key with authenticated Mainnet account delegates; confirm active account, correct environment/network and synchronized clock.
- [x] Correct public-key-as-private-seed configuration: generate a fresh private delegate locally, remove invalid root value, restart pilot, and block unsafe registration advice in diagnostics.
- [ ] Owner registers replacement public key on the exact account and revokes the exposed delegate; configured key is absent, so authenticated recall is still blocked.
- [x] Diagnose original Gemini failures before new calls; pin documented v1beta Interactions route, low thinking, bounded payload and redacted HTTP timing/status diagnostics.
- [x] Preserve original ledger and implement an explicit separate four-attempt grant, bound to the prior ledger hash and closed after a validated response.
- [ ] Obtain a validated Gemini explanation: repair used four attempts (two timeouts, two HTTP 503 failures); zero successes. Both allowances are now exhausted.
- [x] Pass 116 automated tests, including grant preservation/caps and bounded Mainnet worker behavior with fully mocked providers.
- [x] Prepare one-event → completed receipt → exact remote recall → ten-event write procedure, without executing it or changing the saved write flag.

No Mainnet writes, transfers, hosting purchases, deployment, publication, commit or push are authorized for this phase. Historical results remain below and in `docs/verification.md`.

## Design decisions

- Next.js App Router, TypeScript, Node 24, PostgreSQL + Drizzle, Better Auth merchant sessions.
- Every demo browser receives an isolated database workspace and hashed, expiring session capability. Live mode disables demo entry and fixtures.
- Deterministic payment/ranking services own decisions. The LLM only explains an already selected eligible action.
- Live Tatum Sui gRPC and official MemWal SDK adapters remain explicit and fail closed.
- PostgreSQL transactional outbox with leases; uncertain write acceptance requires reconciliation, never a blind resend.
- Controlled product fulfillment is authorized and implemented. Outside fulfillment, refunds, Mainnet transfers and external messages remain excluded. Publication was requested in the November 8 steering.

## External readiness (initial)

- Tatum / Walrus / LLM credentials: task-specific presence checks found none configured; never printed values.
- Mainnet write authorization/account: not supplied. No live writes planned without it.
- Deployment: connected Sites runtime lacks raw TCP; Node-compatible hosting and persistent PostgreSQL required.
- Public repository: `https://github.com/brishibhatia/recalldesk`; article/video: `https://brishibhatia.github.io/recalldesk/`. Both published under the November8 request. Actual submission remains pending account identifiers and authorization.

See docs/verification.md for commands and measured outcomes; docs/submission-checklist.md for external requirements.

### 10 November final follow-up

- [x] Preserve eight previous inference attempts and add one explicitly authorized four-request grant with hash-linked history.
- [x] Verify API revision header and implement user-requested bounded, budgeted backoff with Retry-After.
- [x] Run new allowance: three HTTP 503s and one timeout; 12 total attempts, zero valid inference; no additional requests authorized.
- [x] Run 138 passing local unit/database/provider tests; keep synthetic benchmark distinct.
- [ ] Register fresh delegate with owner wallet, then authenticate recall; this remains an external action.
- [ ] Execute authorized one-then-ten Mainnet procedure only after that gate passes.
- [ ] Supply a genuine order-bound payment and persistent compatible public hosting.

Final results and publication links: `artifacts/qa/submission-20261110/verification.json`.
