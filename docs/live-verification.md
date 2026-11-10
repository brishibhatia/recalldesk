# Live verification: separate evidence, no fixture substitution

The original 8 November build had no verified live provider calls. The **9 November local pilot** adds Gemini and prepares read-only checks; use [the verification record](verification.md) for actual results rather than inferring success from the commands below. Mainnet memories remain **0** unless that evidence record explicitly records completed writes. No Mainnet write or payment transfer is authorized for this task.

## Isolated local pilot, zero spending

Keep the root demo configuration and database unchanged. The pilot uses an ignored source copy at `.local/live-pilot`, its own `.env.local`, the separate PostgreSQL database `recalldesk_live`, and local port **3001**. The existing local PostgreSQL server can host both databases; the pilot must never point at the demo database. Test suites use a separate disposable database, not the pilot's merchant records.

Credentials exposed in chat cannot be reused. Rotate the Gemini and Tatum keys through their account dashboards, revoke/replace the exposed Walrus delegate, and enter only replacements directly in `.local/live-pilot/.env.local`. The setup generates a fresh authentication secret locally without printing it. Use a replacement merchant password; remove `MERCHANT_PASSWORD` after successful provisioning. No key, password or token belongs in shell arguments, reports or screenshots.

Keep these controls in effect:

- `APP_MODE=live`, `APP_BASE_URL=http://localhost:3001`, separate live `DATABASE_URL`.
- `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.8-flash`, replacement `GEMINI_API_KEY`; `OPENAI_API_KEY` blank.
- `ALLOW_MAINNET_WRITES=false` throughout. Do not run `mainnet:seed`, register delegates onchain or transfer funds.
- `WORKER_TOKEN` blank for a standalone worker; `LIVE_TEST_DIGEST` blank until a genuine matching payment exists.
- Provider accounts must remain on verified free access with paid billing and automatic upgrades disabled. An API key or accessible model does not establish billing status.
- Each separately authorized verification grant permits **four small Gemini attempts, including failures and retries**. Historical grants are immutable. The 10 November follow-up explicitly authorizes bounded application retries; SDK retries remain disabled. Do not run the full eight-request evaluation under this allowance.
- `pilot:setup` enforces `LOCAL_PILOT_VERIFICATION=true`. The shared explanation adapter applies the same durable allowance to UI recommendations, smoke checks and evaluation. UI inference is blocked by default until `PILOT_FREE_TIER_CONFIRMED=true` and `PILOT_CREDENTIALS_ROTATED=true` are set locally after account review. These are operator attestations, not an API billing check. The smoke command's explicit confirmations apply only to that invocation and do not unlock UI inference.

Run the setup from the source root, with the existing local PostgreSQL server available:

```sh
npm run pilot:setup
npm run pilot:run -- install
```

The pilot environment is ignored by Git and restricted to its owner on operating systems supporting POSIX file permissions. Preserve an existing pilot environment; never print it to diagnose configuration. On Windows, also restrict access using the file's ACLs.

After replacement credentials and free-tier access have been confirmed, validate Tatum and the Walrus account before merchant provisioning. The account object must be a `MemWalAccount`; inspect its embedded owner and use that actual address for `MEMWAL_OWNER_ADDRESS`. An empty authenticated recall establishes delegate access only, not stored memories or learning. Do not derive the owner from the merchant payment recipient or delegate public key.

```sh
npm run pilot:run -- pilot:read-check -- --live --confirm-free-tier --confirm-rotated --save-owner
```

This reads Tatum service metadata and the configured account, then performs authenticated Walrus recall and selected-model metadata lookup. It prints only a redacted report, including the public owner address. `--save-owner` saves that owner after the authenticated account read and validation, independently of delegate recall. A failed recall never becomes verified delegate access. The report is saved under the pilot's ignored `artifacts/live/provider-preflight.json`. The command makes no inference, payment transfer or memory write.

After the ownership configuration is valid, migrate and provision the new controlled-product merchant, then retain its actual returned UUID as `LIVE_MERCHANT_ID`:

```sh
npm run pilot:run -- db:migrate
npm run pilot:run -- merchant:create -- --controlled-product
npm run pilot:run -- integrations:check -- --live
```

Provisioning is idempotent. For an existing merchant, inspect whether its product is already controlled; the creation flag does not change an existing product. Only successful provisioning permits removal of the provisioning password variable. Start the pilot and worker with the documented [local deployment arrangement](deployment.md#isolated-local-live-pilot); keep writes disabled even while the worker runs.

## Small Gemini verification

**10 November repair result:** both allowances are exhausted: original **4/4**, separately authorized repair **4/4**, **8 total and zero validated explanations**. Repair failures were two timeouts and two actual HTTP 503 / `InternalServerError` responses. Do not run additional inference or delete either ledger. Model metadata is accessible; inference entitlement and remaining provider quota are not established by that read. The command below documents the workflow for a separately authorized future verification allowance, not an instruction to retry now.

The server-only `LLM_VERIFICATION_GRANT=provider-repair-20261110` selects `.local/llm-verification-grants/provider-repair-20261110.authorization.json` and a separate `.attempts.json` inside the pilot. The manifest fixes four attempts, provider/model, authorization time, the SHA-256 of the unchanged original ledger and `stopAfterSuccess:true`. A name alone cannot create an allowance. Corrupt/missing records or a changed original ledger fail closed. UI and CLI share the active ledger; a validated response closes it immediately. Paired live evaluation refuses this repair grant. Each smoke attempt writes its own redacted report without overwriting previous evidence.

An authenticated metadata read checks the configured model without generating text. Actual structured-output verification is separate:

```sh
npm run pilot:run -- llm:smoke -- --live --confirm-free-tier --confirm-rotated
```

Only pass the confirmations after checking that the credentials are replacements and the project has free access with billing disabled. This check uses synthetic decision evidence and counts the attempted inference against the persistent four-attempt allowance before sending it. It records the actual provider/model, validation outcome, latency and redacted failure category. It does not create a verified payment, grant product access, or write a Walrus memory. A successful result is **live Gemini inference on synthetic input**, not proof of a live support lifecycle. Do not reset the allowance to repeat a failed request.

## Actual wallet payment

This section describes a future payment verification session. The current task does not authorize a transfer, token purchase or gas spending. Keep `LIVE_TEST_DIGEST` empty while no genuine matching transaction is supplied.

Create a live order before paying, with the correct merchant recipient, canonical asset, amount and pre-associated buyer. Create its case, then run:

```sh
npm run payments:smoke -- --live --case <case-uuid> --digest <actual-digest> --wallet "actual wallet and version"
```

The script makes three authenticated Tatum reads of the real transaction: matching invoice, deliberately wrong recipient, and wrong buyer association. It records normalized responses in ignored `artifacts/live/payment-smoke.json`. An unsupported wallet transaction remains needs-review. The script neither transfers funds nor changes allocations. Use the case UI to persist the valid allocation; a different order attempting the same receipt must produce `PAYMENT_ALREADY_ALLOCATED`. Local concurrent/allocation tests do not establish this final live observation.

## Storage and process continuity

The next bounded write phase is fully described in [Mainnet write procedure](mainnet-write-procedure.md). It remains unexecuted and requires separate authorization after delegate recall works. The current saved flag is still false.

Follow [integration setup](integrations.md) to provision an owned account and dedicated delegate. For the controlled workbook pilot, provision with `npm run merchant:create -- --controlled-product`; regular live products default to external fulfillment. The flag applies when creating the merchant, and does not silently convert an existing merchant's product.

Read-only recall may be checked with the replacement delegate while writes remain disabled. For a future learning demonstration, account review and separate bounded Mainnet write authorization are required before running any showcase write. After actual completion, run a separate process:

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
npm run pilot:run -- evaluate:live -- --live --allow-inference --confirm-free-tier --confirm-rotated --dataset .local/live-eval.json
```

The full dataset would need **eight model requests**, one baseline/memory pair per scenario. The runner now enforces the shared **four-attempt** verification allowance and only starts a scenario when two attempts remain; additional scenarios are explicitly unmeasured. The allowance lives in the pilot's `.local/llm-verification-budget.json` and is shared with `llm:smoke` and UI recommendations. Reservations persist across restarts; a crash may consume a reservation, but never grants an extra request. Do not reset the file to repeat failures. A complete four-scenario run remains pending a separately authorized budget change.

The runner identifies the selected provider and actual response model; it does not assume OpenAI. Expected labels never enter the model input or stored memory. The same payment and current policy are used for both paths. Fresh remote recall must satisfy the scenario prerequisites; otherwise the row is excluded with an explicit reason. Model fallbacks count as inference failures. Results report action correctness, citation validity, appropriate escalation, latency and failure status separately in ignored `artifacts/live/evaluation.json`.

This small live run remains separate from the 16-case deterministic fixture report. Action choice is still deterministic; these calls also measure whether the live model explains it with valid references. One trial is not a statistical or causal accuracy claim. Review/redact artifacts before publishing; never commit the private manifest, capability codes or secrets.

## Final 10 November follow-up

The user authorized a third four-attempt grant, `submission-repair-20261110`. Its manifest additionally binds each earlier named grant's exact authorization and attempt files through `priorGrants` hashes. It preserves eight prior attempts and cannot reset them. All four new attempts are consumed: three HTTP 503 responses and one timeout; **12 total, zero validated responses**. The latest allowance is closed.

The user also requested bounded retries. `LLM_MAX_RETRIES=0|1|2` controls application retries (default zero when absent); each retry separately reserves its attempt, with no SDK retries. Transient 500/502/503/504, network errors and timeouts may retry. A 429 retries only when the provider supplies `Retry-After`; payment/free-tier restrictions, authentication, model, schema, citation, remedy and policy errors stop immediately. Waits use 2/4-second exponential backoff or the longer provider delay, capped at 30 seconds; longer required waits stop the run. The overall explanation deadline is three minutes and each request has a cancellable timeout. Results retain per-attempt redacted timing/status and the final fallback remains visibly labeled.

For a separately authorized future grant only, the CLI supports `--retries 2` in addition to its existing confirmations. It refuses the run unless three attempts remain. The actual latest run honored a 30-second Retry-After and then a four-second backoff. No further inference is authorized by the consumed grant. See [measured reports](../artifacts/qa/submission-20261110/verification.json).
