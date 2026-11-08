# Learning and evaluation

## Logical experience

`memorySchema` in `src/core/types.ts` validates schema version, stable logical event ID, merchant/case/attempt IDs, case reference, issue and product version, remedy, merchant-confirmed resolved/failed outcome, policy version/effective time, observed time, event creation time, redacted payment reference, correction link, and provenance.

Retrieval-friendly summary text precedes a `RECALLDESK_JSON` marker and validated JSON. Actual storage time belongs to the completed outbox receipt, rather than being fabricated before upload. Synthetic showcase event times are separate from their real event creation and Mainnet completion times. No customer name, raw token, private key, or full conversation is stored in these memories.

## Eligibility then ranking

1. Require a verified payment and a matching current product version.
2. Filter remedies by current merchant policy and supported issue type.
3. Validate each recalled event's schema, merchant scope, content hash and completed source reference. Exclude future policy versions, wrong products/issues, superseded events and duplicates of an attempt.
4. Estimate each eligible remedy using `(successes + 1) / (successes + failures + 2)`.
5. Sort descending by score. Fixed priority resolves ties: refresh, relink, resend, legacy reset (only if allowed).
6. Fewer than two compatible attempts retains the policy baseline. Counts and the subset limitation are shown in the workspace.

Scores are a transparent heuristic, not calibrated confidence or causal evidence. A query can recall a subset. Incomplete recall or provider failure is shown explicitly, and the safe policy baseline remains available. No local-only fallback is labeled as fresh Walrus recall.

## Corrections and current policy

Reopening a resolved attempt changes that attempt's latest outcome to failed and appends a new event referencing the superseded success. History remains inspectable. The previous success is excluded even when semantic recall returns only the old text. At most one outcome per attempt contributes to ranking.

Policy is always loaded from PostgreSQL, never inferred from semantic search. A new policy version invalidates an older approval proposal and can remove previously successful remedies. Customer requests cannot edit policy or mint trusted outcomes.

## Reproducible experiment

Run `npm run evaluate`. Source: `src/evaluation/dataset.ts`; exported dataset and report: `artifacts/evaluation/`. The workspace dashboard runs the same function and persists the result for that workspace, starting with an honest empty state.

Dataset `recalldesk-heldout-v1` has 14 training examples and 16 held-out decisions. Expected labels are used by the scorer, never included in recommendation inputs. Baseline and memory-enabled variants share policy, payment evidence, structured sample explanation adapter and safety rules. The intended difference is access to training experience.

The measured deterministic result was baseline 13/16 correct, memory-enabled 16/16, repeated failed remedies 3→0, unsupported payment approvals 0, invalid citations 0. The exact dataset hash, timestamp, compute latency, configuration and per-case decisions are generated in JSON. One deterministic trial is sufficient for reproducibility; this does not measure OpenAI variability or network latency. Model-dependent quality testing remains pending an authorized configured model and budget.

The separate `evaluate:live` runner is documented in [live verification](live-verification.md). Four reviewed scenarios use real Walrus recall and paired model explanations, at most eight requests with retries disabled. Required evidence prerequisites, action correctness, citations, escalation and inference failures remain separate. No live run has been claimed or blended into fixture results.

For an interactive new-feedback example, initial relink has seven successes and one failure (8/10); resend has three successes (4/5). A newly confirmed relink failure becomes eligible only after completion and yields 8/11, so resend wins. Resolve-then-reopen contributes the same one failure after superseding the earlier success. The database test checks the score before acceptance, before completion, and in a fresh operator session after completion; it requires the exact new event in the evidence.

Cases include compatible access failures, delivery/session isolation, wrong recipient/coin/payer/network, integer precision, failed execution, RPC unavailability, unsupported shape, newer policy, incompatible product version and correction filtering. PostgreSQL tests separately cover replay/allocation races, tenant/customer attacks, idempotent commands, leases and completion semantics.

## Fresh-session continuity

The browser test opens a new browser context with the same authorized session, reloads the persisted case and requests a fresh recommendation. It has no prior React state or conversational context. This proves demo persistence. Live continuity requires the same test with the merchant's authorized live session and a recommendation whose `recallSource` is `walrus-recall`, with actual returned evidence IDs. It remains pending until the live configuration is supplied.
