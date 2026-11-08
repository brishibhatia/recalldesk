# Live verification: separate evidence, no fixture substitution

These commands are implemented but have **not been run against live providers**. No credentials, genuine wallet transaction, or paid inference budget was supplied during the build. Mainnet memories remain **0**. Configure secrets in `.env.local` or your server secret manager; never paste them into chat.

## Actual wallet payment

Create a live order before paying, with the correct merchant recipient, canonical asset, amount and pre-associated buyer. Create its case, then run:

```sh
npm run payments:smoke -- --live --case <case-uuid> --digest <actual-digest> --wallet "actual wallet and version"
```

The script makes three authenticated Tatum reads of the real transaction: matching invoice, deliberately wrong recipient, and wrong buyer association. It records normalized responses in ignored `artifacts/live/payment-smoke.json`. An unsupported wallet transaction remains needs-review. The script neither transfers funds nor changes allocations. Use the case UI to persist the valid allocation; a different order attempting the same receipt must produce `PAYMENT_ALREADY_ALLOCATED`. Local concurrent/allocation tests do not establish this final live observation.

## Storage and process continuity

Follow [integration setup](integrations.md) to provision an owned account and dedicated delegate. For the controlled workbook pilot, provision with `npm run merchant:create -- --controlled-product`; regular live products default to external fulfillment. The flag applies when creating the merchant, and does not silently convert an existing merchant's product.

After the account is reviewed and bounded Mainnet writes are authorized, run the explicit showcase command, wait for actual completion, then run a separate process:

```sh
npm run recall:client -- --live --issue access --product-version studio-2.1
```

It performs genuine remote recall and exports redacted IDs to `artifacts/live/second-client-recall.json`. It depends on the same authorized delegate/account, namespace, SDK, and **PostgreSQL validation ledger**. It demonstrates process/session continuity, not independent reconstruction without the ledger. No web session or conversational context is read.

For the live learning milestone, record a new merchant outcome in the UI; wait until its own job is completed. Create a comparable case, generate a new recommendation and confirm that the exact logical event/storage reference appears in Judge evidence. Use Compare with memory disabled to replay the same current policy/payment with and without the retrieved examples. A score change counts as an observed change even when the winner remains the same. Export the evidence before and after; never substitute seeded history for the newly observed event.

## Separate live evaluation

Use four reviewed live cases whose actual recalled evidence covers: unseen wording, conflicting resolved/failed outcomes, fewer than two examples, and a recalled correction from a reopened case. Create a private manifest in ignored `.local/live-eval.json`:

```json
{
  "version": "pilot-reviewed-v1",
  "cases": [
    {"scenario": "unseen-wording", "caseId": "REPLACE_WITH_REAL_UUID", "expectedRemedy": "relink", "expectedEscalation": false, "requiredMemoryIds": [], "forbiddenMemoryIds": []},
    {"scenario": "conflicting-outcomes", "caseId": "REPLACE_WITH_REAL_UUID", "expectedRemedy": "resend", "expectedEscalation": false, "requiredMemoryIds": [], "forbiddenMemoryIds": []},
    {"scenario": "insufficient-evidence", "caseId": "REPLACE_WITH_REAL_UUID", "expectedRemedy": "refresh", "expectedEscalation": false, "requiredMemoryIds": [], "forbiddenMemoryIds": []},
    {"scenario": "reopened-case", "caseId": "REPLACE_WITH_REAL_UUID", "expectedRemedy": "resend", "expectedEscalation": false, "requiredMemoryIds": [], "forbiddenMemoryIds": []}
  ]
}
```

The shown expected remedies are **illustrative**, not assertions about any real account. Review the expected decision from policy/evidence before running. Set `requiredMemoryIds` to the actual event you want to prove was recalled; put the superseded success in `forbiddenMemoryIds`. Insufficient experience retains the baseline when payment/policy allow it; it does not automatically require escalation. Use `null` and `expectedEscalation:true` where payment/policy actually require review.

```sh
npm run evaluate:live -- --live --allow-inference --dataset .local/live-eval.json
```

This opts into at most **eight billable model requests**, one baseline/memory pair per scenario, with retries disabled. Expected labels never enter the model input or stored memory. The same payment and current policy are used for both paths. Fresh remote recall must satisfy the scenario prerequisites; otherwise the row is excluded with an explicit reason. Model fallbacks count as inference failures. Results report action correctness, citation validity, appropriate escalation, latency and failure status separately in ignored `artifacts/live/evaluation.json`.

This small live run remains separate from the 16-case deterministic fixture report. Action choice is still deterministic; these calls also measure whether the live model explains it with valid references. One trial is not a statistical or causal accuracy claim. Review/redact artifacts before publishing; never commit the private manifest, capability codes or secrets.
