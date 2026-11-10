# Prepared Mainnet write procedure — not executed

The user authorized this bounded phase on 10 November: one synthetic experience, then a target total of ten only after confirmed completion and exact-event recall. Execution remains blocked by replacement delegate registration. The saved configuration keeps `ALLOW_MAINNET_WRITES=false`; no command in this document has been run against Mainnet. Zero spending, no automatic wallet transactions, and no billing upgrades remain mandatory.

The managed relayer documents payment of its own WAL storage fees and SUI gas, subject to shared-service limits. This does not authorize buying tokens, funding a wallet, or accepting a payment prompt. Stop if the service requests payment. [Managed relayer funding](https://docs.wal.app/walrus-memory/getting-started/choose-your-path).

## Destination and prerequisites

Use only the isolated pilot, whose source/database are separate from the demo:

- Merchant: `5a151d00-8b4f-4060-82ea-5c3aea4528bf`.
- Mainnet account: `0x63076527a35bb00a5456d744dab277573563b18fd256ef9722faf2395cd4ca13`.
- Verified embedded owner: `0x81fc044adde8ee092bbaffd2a68aa5972a3567b7ca057faaedf7788a978978e3`.
- Namespace: `recalldesk-live-v1`.
- Managed relayer: `https://relayer.memory.walrus.xyz`.
- PostgreSQL: `recalldesk_live`; environment: `.local/live-pilot/.env.local`.

Authorization is recorded in `artifacts/qa/submission-20261110/authorization.json` for **one synthetic experience first**, followed by a **target total of ten** only after completed storage and exact-event recall are proven. Confirm the replacement delegate is registered on this account and authenticated recall now succeeds. A public health response or confirmed owner does not prove delegate access. Complete the Gemini repair separately; this write script does not invoke model inference.

The corrected fresh delegate public key is `8bc7393a2cb6a487e4ed813425def0f73b3a88abd756cc53a53bacf7e47e4566`; its private key was generated and saved locally. The earlier configuration accidentally used a public value as its private seed. Never register the discarded `a7b645…` key derived from that public seed. Owner registration/revocation is a separate wallet action and has not been performed automatically.

Refresh the pilot's source from the reviewed working tree before this future phase, preserving its private environment and database. Run the existing authenticated integration check with writes still disabled. Stop the **pilot** standalone worker using Ctrl+C in its own terminal; leave the demo worker alone. Do not enable a scheduled HTTP worker. Keep normal operator actions quiet while reviewing this bounded run.

```sh
# From the project root; these checks are read-only remotely.
npm run pilot:run -- integrations:check -- --live
```

Do not proceed until the Walrus entry reports authenticated recall success. Inspect any existing jobs first. Failed/uncertain work requires diagnosis; do not delete events or create replacement logical IDs.

## Stage 1: one minimized synthetic experience

The `mainnet:seed` command now accepts target counts from 1 through 20. `--count` is a **target total**, not an additional quantity. Existing `HISTORY-NNN` records retain their IDs. Always specify the count: the historical default remains 20, and expansion is refused unless the first event already has a completed receipt and is returned by fresh remote recall.

The script uses the application's existing synthetic-history creation, local authenticity ledger and durable outbox. Each experience contains non-sensitive references and a minimized remedy/outcome summary. Its provenance is **synthetic-mainnet**: synthetic case content stored on real Mainnet, not an actual verified payment or customer resolution. Simulated event time and actual completion time are separate.

When authenticated recall passes, use a process-only flag. **Keep the saved `.env.local` value false.** The normal `pilot:run` wrapper intentionally refuses write-enabled commands, so this future command runs directly from the pilot directory.

Bash/WSL:

```sh
cd .local/live-pilot
ALLOW_MAINNET_WRITES=true npm run mainnet:seed -- --count 1 --confirm-account 0x63076527a35bb00a5456d744dab277573563b18fd256ef9722faf2395cd4ca13 --confirm-namespace recalldesk-live-v1
```

PowerShell, in the pilot directory:

```powershell
$recallWritesBefore = $env:ALLOW_MAINNET_WRITES
try {
  $env:ALLOW_MAINNET_WRITES = "true"
  npm run mainnet:seed -- --count 1 --confirm-account 0x63076527a35bb00a5456d744dab277573563b18fd256ef9722faf2395cd4ca13 --confirm-namespace recalldesk-live-v1
} finally {
  if ($null -eq $recallWritesBefore) {
    Remove-Item Env:ALLOW_MAINNET_WRITES -ErrorAction SilentlyContinue
  } else {
    $env:ALLOW_MAINNET_WRITES = $recallWritesBefore
  }
}
```

The bounded invocation processes only its selected logical-event IDs. It stops on any recorded provider error, including payment-required; HTTP 402 is terminal in the worker. It does not drain unrelated merchant jobs. Its approximately three-minute loop can end with pending work; that is not successful storage. Pending jobs retain their provider job IDs and idempotency keys. Diagnose a failed/uncertain submission before any explicitly authorized resumption.

Review the private redacted report at `artifacts/live/mainnet-evidence-count-1.json` in the pilot. Each invocation also saves a timestamped report so later checks do not erase earlier evidence. Require all of:

1. `confirmedCount` is 1 and `targetCompleted` is true.
2. The event has a real provider job ID, blob ID, completion time and matching owner/namespace/Mainnet receipt.
3. `recallSucceeded` and `firstRecalled` are true, with the exact logical event ID in `recalledLogicalEventIds`.

An accepted/running job, a local event or an HTTP acceptance does not count. Completion is the SDK/relayer job-done signal, not independent cryptographic proof. The script exits nonzero when completion or required recall is absent.

## Stage 2: recall in a fresh process

With the environment file still write-disabled, start a separate process from the pilot directory:

```sh
npm run recall:client -- --live --issue access --product-version studio-2.1
```

Inspect `artifacts/live/second-client-recall.json`. Require `provider: "walrus-recall"` and the **same logical event ID and storage reference** as the completed first event. An empty successful recall proves access only and is insufficient here. Save a redacted copy as first-event evidence before another recall command replaces the latest report.

The client validates real returned text against the original PostgreSQL ledger, content hash, merchant scope, completion blob and correction state. It demonstrates process continuity with those dependencies; it is not an independent reconstruction without the ledger. [Documented write-confirm-recall flow](https://docs.wal.app/walrus-memory/getting-started/quick-start).

## Stage 3: expand to ten distinct completed records

Only after the first event and fresh-process recall are verified, and authorization includes the remaining nine, repeat the Stage 1 command with **`--count 10`**. In Bash:

```sh
ALLOW_MAINNET_WRITES=true npm run mainnet:seed -- --count 10 --confirm-account 0x63076527a35bb00a5456d744dab277573563b18fd256ef9722faf2395cd4ca13 --confirm-namespace recalldesk-live-v1
```

For PowerShell, use the same `try/finally` block with the count changed to 10. This retains the first record and creates at most nine missing `HISTORY-NNN` experiences. Before queueing more, the command itself requires the first completed event to appear in another actual Walrus recall. It cannot accept a locally fabricated evidence file as that proof.

Require `confirmedCount: 10`, `targetCompleted: true`, ten different logical event IDs, matching real receipts, and successful fresh-process recall. The first ten synthetic examples include failed refresh outcomes and successful relinks. Preserve `mainnet-evidence-count-1.json`, `mainnet-evidence-count-10.json` and both fresh-recall exports. Pending, failed and retry duplicates never contribute to the completed count. Review reports for secrets before copying them into public artifacts; do not publish raw provider payloads.

The seed script does not prove the genuine customer journey. A later actual order/payment must be independently verified through Tatum, followed by an approved controlled-product restore, customer download and observed merchant outcome. That new event must complete and be recalled in a later comparable case before claiming live adaptation from a genuine resolution.

## Finish with writes disabled

The saved configuration remains false throughout this procedure. After each one-off command, ensure the shell override has ended and restart the pilot worker through the normal write-disabled wrapper from the source root:

```sh
npm run pilot:run -- worker
```

Do not expand beyond the authorized target, enable billing, register wallet delegates automatically, transfer funds, publish evidence or deploy as an implicit part of this procedure. If the managed service requests payment or the authorization stops at the canary, stop and preserve the evidence already obtained.
