# Submission checklist

**Event page rechecked 10 November 2026; separate Walrus rules last checked 8 November. Implementation and live submission readiness are separate.** RecallDesk targets Track 2, Smart Agents for Real Life, with a visible learning loop relevant to Best Walrus Memory. This is a target, not an eligibility or prize claim.

## Current official sources

The [official Tatum entry point](https://tatum.io/hackathon/total-recall) leads to the [current event site](https://recall-tatum-walrus.vercel.app/). It lists Mainnet Walrus integration, 10+ stored memories, relevant Tatum reads, a published explanatory blog, a working demo, and public repository. Its deadline is **10 November 2026 at 17:00 UTC / 22:30 Asia/Kolkata**. The 10 November recheck occurred before that deadline; confirm the current time before submitting. The earlier 8 November check is preserved in [verification](verification.md). Scoring is integration 30%, technical quality 30%, creativity 20%, presentation 20%. AI Builder is optional; its award requires a product built primarily with that tool. The separate agent-payment award concerns x402 or MPP settled on Sui. Neither bonus is claimed here. [Source: event site](https://recall-tatum-walrus.vercel.app/).

The [Walrus event rules](https://thewalrussessions.wal.app/tatum-total-recall), retrieved again on 8 November through direct HTTPS after the browser fetch timed out, agree on the deadline and core deliverables, require a 2–3 minute video, and list submission identifiers. They retain two material discrepancies: the introduction describes a feedback/forms platform, while their track section and current event site include everyday agents; their third special award remains “Mystery Bounty,” while the event site specifies agent payments. Organizer clarification is pending. No organizer message has been sent. Do not silently infer eligibility from the inconsistent wording. [Source: event rules](https://thewalrussessions.wal.app/tatum-total-recall).

The published requirement is a **public repository**. The checked pages do not specify an open-source license. Public visibility and permission to reuse the source are separate: the team may choose a license, but this checklist does not treat an OSS license as an organizer-mandated condition.

## Requirement-to-evidence map

| Requirement | Actual artifact or evidence | Status / smallest remaining step |
| --- | --- | --- |
| Working product and meaningful learning | [README](../README.md), case workspace, [learning design](learning.md), [evaluation report](../artifacts/evaluation/latest.json) | Local sample application implemented; inspect [verification](verification.md) for actual checks |
| Tatum onchain data | [Adapter](../src/server/providers/tatum.ts), deterministic verifier, [authenticated pilot evidence](../artifacts/qa/pilot-20261110/provider-preflight.json) | **Authenticated Mainnet service/account reads passed.** Genuine order-bound payment verification remains pending; preserve its redacted evidence when available |
| Walrus Memory integrated with Mainnet writes | [Adapter](../src/server/providers/memory.ts), [durable worker](../src/server/worker.ts), [delegate diagnosis](../artifacts/qa/provider-repair-20261110/walrus-diagnosis.json) | **Blocked on owner registration of the corrected replacement delegate.** Account and owner are verified; authenticated recall has not passed. Saved writes remain disabled |
| At least 10 Mainnet memories | [Evidence ledger](mainnet-evidence.json), [bounded write procedure](mainnet-write-procedure.md) | **0 confirmed.** One-then-ten synthetic writes are authorized, conditional on successful authentication and the first completed write/recall. No writes have run; count unique completed logical events only |
| Useful sample experience | 20 structured sample history events in [fixtures](../src/server/fixtures.ts) | Prepared; simulated storage does not satisfy Mainnet requirements |
| Live continuity | Recommendation snapshot records recall source and evidence | **Pending.** After completion, sign in afresh and obtain a recommendation using actual Walrus recall evidence |
| Reachable working demonstration | [Deployment artifacts](deployment.md), [runbook](demo-runbook.md), [screenshots](../artifacts/screenshots/) | **Public deployment pending.** Supply an authorized compatible Node/gRPC host and persistent PostgreSQL, then verify a complete deployed lifecycle |
| Public repository | [brishibhatia/recalldesk](https://github.com/brishibhatia/recalldesk), source, lockfile, migrations, [notice](../NOTICE.md) | **8 November release published and confirmed public.** Gemini/provider-repair changes are local pending reviewed release publication. Source reuse rights remain separate from visibility |
| Published explanatory blog | [Published article and walkthrough](https://brishibhatia.github.io/recalldesk/), [article source](blog-draft.md) | **8 November article published.** The 10 November source revision awaits publication. Both must retain synthetic/live distinctions; the static article is not the hosted support backend |
| Real 2–3 minute demo video | [Actual recording in the public repository](https://github.com/brishibhatia/recalldesk/blob/main/artifacts/demo/recalldesk-demo.webm), [runbook](demo-runbook.md) | **8 November recording published:** 2:40.16, synthetic/sample providers clearly labeled. A live integration recording remains pending actual live evidence |
| Submission form and identifiers | List below | **Pending user-owned details and submission authorization.** Never put private delegate material in the form |
| Current rules and contradictions | Event page checked 2026-11-10; separate Walrus rules checked 2026-11-08 | Confirm current submission form and account identifiers; unresolved wording remains recorded |

The latest completed provider-repair verification is recorded in [the evidence summary](../artifacts/qa/provider-repair-20261110/verification.json): **116/116 tests**, lint, type checks, source/pilot builds, desktop/mobile merchant sign-in and a clean scoped secret scan. Gemini metadata access passed, but the original four attempts plus four repair attempts produced **zero validated responses**. Two repair requests timed out and two returned HTTP 503. The final separately authorized four attempts also failed (three HTTP 503 responses, one timeout): **12 total, zero validated responses**. Bounded retries are implemented and measured; [latest verification](../artifacts/qa/submission-20261110/verification.json) records **138 passing tests**. [Historical inference evidence](../artifacts/qa/provider-repair-20261110/gemini-diagnosis.json).

## Submission details to prepare privately

The rules list email, Discord handle, LinkedIn, referral source, first-Web3-project answer, Tatum ID, Sui address, Sui account ID, `MEMWAL_AGENT_ID`, project description, video, GitHub repository, and experience feedback for Walrus and Tatum AI Builder. Use truthful “not used” feedback for AI Builder. The event site identifies `MEMWAL_AGENT_ID` as the **public** delegate key shown in the Memory dashboard. Do not provide the private delegate key, seed phrase, API key, or session token. [Form requirements](https://thewalrussessions.wal.app/tatum-total-recall); [public agent identifier guidance](https://recall-tatum-walrus.vercel.app/).

No personal account identifier is fabricated or committed here. The team must also review the organizer's participation terms and confirm its own eligibility; the app cannot establish those facts.

## Final release review

- [x] All local acceptance checks reconciled in [verification](verification.md), with failures and environment limitations preserved.
- [ ] Live Tatum receipt successfully checked in the deployed configuration.
- [ ] Ten or more distinct Mainnet events completed; reviewed evidence has actual account, job, blob references where returned, and timestamps.
- [ ] Fresh-session live recommendation cites the actual recalled evidence.
- [ ] Production credentials remain server-side; public demo cannot write to live tenants or Mainnet.
- [ ] Deployed login/demo, database, worker, and full case lifecycle verified.
- [x] 8 November repository made public after scoped secret scan; reuse/license decision recorded separately.
- [x] 8 November blog reviewed and published with accurate synthetic integration and measurement claims.
- [x] 8 November sample video inspected, between two and three minutes, labeled honestly, and uploaded to the public project repository.
- [ ] Current provider-repair release and revised article published after final review; live video updated only with actual completed evidence.
- [ ] Current rule wording and account identifiers checked; submission explicitly authorized and completed by deadline.

An accepted provider job, successful build, local recording, or draft blog does not satisfy the corresponding completed-storage, deployment, published-video, or published-blog requirement. If the deadline passes before these steps, continue the product work and describe the event as past.
