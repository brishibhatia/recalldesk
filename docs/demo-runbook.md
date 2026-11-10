# RecallDesk demo runbook

This is a reproducible **2 minute 40 second sample demonstration**. The scenarios, payments, memory provider, and explanation adapter are simulated. PostgreSQL persistence, protected workbook access, authorization, ranking, corrections, and the durable worker are real application behavior. Do not describe this recording as a live Tatum or Walrus demonstration.

**10 November pilot status:** authenticated Tatum Mainnet service/account reads passed; a genuine order-bound payment is still unverified. The replacement Walrus delegate requires owner registration, authenticated recall has not passed, and completed Mainnet memories remain **0**. The original eight Gemini attempts produced no validated response; additional verification is a separate allowance. The [one-then-ten write procedure](mainnet-write-procedure.md) is authorized but remains conditional on authentication and first-event proof. The published recording is the historical **8 November sample**, not a live walkthrough. Consult [current verification](verification.md) before recording any new live claim.

## Prepare

Follow [README setup](../README.md#run-locally): start PostgreSQL, migrate and seed, start the application, and keep `npm run worker` running. Open `http://localhost:3000` at approximately 1440 × 1000. Select **Open sample workspace** to obtain a new isolated workspace. Do not reset a live workspace or remove existing live memories.

Keep the sample-data banner visible. Close any developer tools containing cookies or local environment values. The generated case/order IDs may differ between reviewer sessions; select cases by their titles below. Use only synthetic data in recordings intended for publication.

## Storyboard and narration

| Time | Action in the working application | What to explain |
| --- | --- | --- |
| 0:00–0:30 | With a pre-issued customer code, open `/support`, show **Access missing**, and create a request. Switch to its merchant case and select **Check payment**. | “The customer has a paid order but cannot open this controlled product. This receipt is simulated; the deterministic checks bind it to the order and buyer.” |
| 0:30–1:05 | Generate a recommendation and **Compare with memory disabled**. Approve, select **Restore controlled product access**, then return to `/support` and download the workbook. | “The same policy/payment produce a different choice because of recalled failures. The approved action now changes a real entitlement. The protected download works for this scoped customer.” |
| 1:05–1:35 | Record **Resolved**, inspect the new memory and wait for **completed**. Then **Reopen case** and wait for the failed correction itself to complete. | “A merchant outcome commits an event and outbox job. Accepted is not completed. Reopening supersedes the earlier success; it does not add two independent examples.” |
| 1:35–2:05 | Select **Open a comparable case**, reload, verify the same order idempotently and recommend again. Compare scores and inspect **Judge evidence**. | “The corrected relink failure changes its score from 0.80 to 8/11. Resend remains 0.80 and now wins. The newly recalled event explains this change. All storage shown here is simulated/local.” |
| 2:05–2:40 | Open **Payment sent to an old address**, select **Check payment**, and show `RECIPIENT_MISMATCH`. Open **Evaluation**, show its empty state, then select **Run evaluation**. | “Memory cannot override payment rules or current policy. This receipt is not accepted. On the fixed synthetic dataset, the measured decisions are 13 of 16 for baseline and 16 of 16 with memory, with no unsupported approvals. These results do not establish real-world accuracy.” |

The exact screen transitions may consume part of each time window. Keep the overall video between two and three minutes; do not hide a provider failure to meet the timing. If a memory remains queued, show that state and repair the worker before recording a completion claim.

## Optional follow-up demonstrations

- **Correction:** return to a resolved case and select **Reopen case**. In the timeline, show the original outcome as superseded and the linked failed correction. A fresh recommendation must exclude the old success; a changed ranking depends on the remaining evidence.
- **Current policy:** in **Integrations & policy**, save a version that disallows a formerly successful remedy. Request a new recommendation; that remedy must be excluded. Use a separate disposable sample workspace so the timed scenario remains reproducible.
- **Provider unavailable:** check **Can you check my transfer?**. `RPC_UNAVAILABLE` remains pending/unverified and cannot approve access.
- **Isolation:** open the entry page in an independent private browser session. Its new sample workspace has independent mutations. The API rejects another session's case ID.

## Recording and artifacts

`npm run demo:record` captures the real workflow to [artifacts/demo/recalldesk-demo.webm](../artifacts/demo/recalldesk-demo.webm). It creates an isolated demo workspace, authenticates the customer off-screen so no access code is exposed, and uses the actual scoped worker endpoint to complete jobs. Assertions stop the recording if a claimed state does not occur. The current completed capture was checked at approximately **2:40**, with frame inspections of the restored product, changed ranking and evaluation. [Recording metadata](../artifacts/demo/recording.json) records chapters and mode; the workflow timer includes encoding and is not the encoded media duration.

Existing [desktop/mobile screenshots](../artifacts/screenshots/) and [browser lifecycle test](../tests/browser/lifecycle.spec.ts) cover the working sample flow. An automated recording may use captions instead of voice; retain the sample-provider disclosures in either format. Review the finished file before uploading.

## Switching to a live demonstration

Use a separately configured live database and merchant-owned memory account. Follow [integration setup](integrations.md) and complete authorized authenticated reads, writes, and recall first. Replace sample narration only for operations actually verified. Synthetic text written to the real service must be called **synthetic case, real Mainnet storage**, with real completion timestamps and receipts.

For fresh-session evidence, log out and sign in again or open a new authorized browser context, then request a recommendation. Inspect the saved snapshot: it must identify `walrus-recall` and actual returned evidence IDs. A reload of locally simulated memory cannot satisfy this live requirement. The current build has **0 confirmed Mainnet memories**; see [the evidence ledger](mainnet-evidence.json).
