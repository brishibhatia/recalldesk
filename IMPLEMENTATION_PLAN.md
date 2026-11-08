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

## Design decisions

- Next.js App Router, TypeScript, Node 24, PostgreSQL + Drizzle, Better Auth merchant sessions.
- Every demo browser receives an isolated database workspace and hashed, expiring session capability. Live mode disables demo entry and fixtures.
- Deterministic payment/ranking services own decisions. The LLM only explains an already selected eligible action.
- Live Tatum Sui gRPC and official MemWal SDK adapters remain explicit and fail closed.
- PostgreSQL transactional outbox with leases; uncertain write acceptance requires reconciliation, never a blind resend.
- Controlled product fulfillment is authorized and implemented. Outside fulfillment, refunds, Mainnet transfers and external messages remain excluded. Publication was requested in the November 8 steering.

## External readiness (initial)

- Tatum / Walrus / LLM credentials: checking only task-specific configured variables, never values.
- Mainnet write authorization/account: not supplied. No live writes planned without it.
- Deployment: connected Sites runtime lacks raw TCP; Node-compatible hosting and persistent PostgreSQL required.
- Public repository/blog/submission: publication not authorized; prepare artifacts locally.

See docs/verification.md for commands and measured outcomes; docs/submission-checklist.md for external requirements.
