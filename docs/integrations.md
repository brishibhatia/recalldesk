# Integration setup and verified interfaces

Documentation and installed package types inspected on 2026-11-05; local integration tests continued on 2026-11-06. No live API credentials were present. “Implemented” and “tested against local contract fixtures” do not mean “verified live.”

**9 November 2026 update:** Gemini support and an isolated local pilot are being verified without spending, transfers, deployments or Mainnet writes. Provider credentials exposed in chat require rotation in the providers' dashboards; their replacements belong only in the ignored pilot `.env.local`. The verification record distinguishes implementation, metadata access and actual inference.

**10 November observed results:** user confirmed replacements and free-tier access. Tatum authenticated Mainnet service/object reads succeeded. The account type matched `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5::account::MemWalAccount`; its embedded owner is `0x81fc044adde8ee092bbaffd2a68aa5972a3567b7ca057faaedf7788a978978e3`, distinct from the merchant recipient. Owner and actual merchant UUID are saved privately. Walrus authenticated recall returned **401**; no access or stored-memory claim is made. Gemini model metadata is accessible, but all **four** authorized inference attempts failed to produce a validated explanation. No more inference is authorized by the current allowance. See [redacted evidence](../artifacts/qa/pilot-20261110/readiness.json).

## Locked versions

**Provider repair follow-up:** authenticated account data confirms the configured delegate's derived public key is absent from `delegate_keys`; this explains the persistent 401. NTP is synchronized and the relayer date differs by less than a second. The new `npm run pilot:run -- walrus:diagnose -- --live` command prints public registration evidence only and retries authenticated recall only when the configured key is actually listed. See [Walrus authentication troubleshooting](https://docs.wal.app/walrus-memory/troubleshooting/overview).

The local cause was then confirmed: a public key had been entered into `MEMWAL_DELEGATE_KEY`. A fresh private delegate is now generated and stored locally; its correct registration public key is `8bc7393a2cb6a487e4ed813425def0f73b3a88abd756cc53a53bacf7e47e4566`. Do not register the discarded `a7b645…` derivative of the public seed. Owner-wallet registration remains pending; no onchain action was performed. The diagnosis command now recognizes this public/private-value mix-up explicitly.

Gemini now explicitly uses **v1beta Interactions**, matching the [current structured-output examples](https://ai.google.dev/gemini-api/docs/structured-output), and `thinking_level: "low"` for the documented Flash model. The installed SDK's default route was v1. Request transport retains the SDK's JSON/authentication but materializes its bounded body for Content-Length framing and attaches cancellation. The four additional attempts ended with two timeouts and two HTTP 503 responses; no validated inference or free-quota claim is made. [Diagnosis and safe statuses](../artifacts/qa/provider-repair-20261110/gemini-diagnosis.json).

| Component | Installed version / interface |
| --- | --- |
| Node | 24.22.1 for current pilot/builds; older 24.18.0 retained in historical reports |
| Next / React | 16.4.5 / 19.3.1 |
| PostgreSQL tooling | `pg` 8.23.1, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 |
| Merchant auth | Better Auth 1.7.17, Drizzle PostgreSQL adapter |
| Sui SDK | `@mysten/sui` 2.39.0; `SuiGrpcClient`, exported `GrpcTypes` |
| Native gRPC transport | `@protobuf-ts/grpc-transport` 2.11.1 with `@grpc/grpc-js` 1.14.7 |
| Walrus Memory | `@mysten-incubation/memwal` 0.1.13 |
| Gemini explanations | Official `@google/genai` 3.0.0; JSON Schema structured output, authoritative Zod validation |
| OpenAI explanations | OpenAI SDK 7.51.0, Responses `parse`, `zodTextFormat`, Zod 4.6.7 |

Exact transitive versions are in `package-lock.json`. Targeted dependency overrides upgrade esbuild under the legacy Drizzle loader and minimatch under the TypeScript lint parser; lint, migration, tests and build verify compatibility. This is not a security certification.

## Provision the first live merchant

Use a separate live database/environment. The current local pilot must keep `ALLOW_MAINNET_WRITES=false`; reviewing the destination alone does not authorize writes. Configure these in the pilot `.env.local` or server secrets, never chat:

```text
APP_MODE=live
APP_BASE_URL=https://your-actual-host
DATABASE_URL=<persistent PostgreSQL URL>
BETTER_AUTH_SECRET=<random secret, 32+ characters>
MERCHANT_NAME=<merchant name>
MERCHANT_EMAIL=<operator login>
MERCHANT_PASSWORD=<strong provisioning password>
MERCHANT_PAYMENT_ADDRESS=<merchant Sui recipient>
MEMWAL_ACCOUNT_ID=<merchant-owned MemWalAccount object>
MEMWAL_OWNER_ADDRESS=<owner address expected in that account>
MEMWAL_DELEGATE_KEY=<dedicated delegate, never owner wallet key>
MEMWAL_NAMESPACE=recalldesk-live-v1
MEMWAL_RELAYER_URL=https://relayer.memory.walrus.xyz
ALLOW_MAINNET_WRITES=false
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.8-flash
GEMINI_API_KEY=<replacement key entered locally>
OPENAI_API_KEY=
```

Run `npm run db:migrate`, then `npm run merchant:create`. For a new controlled workbook pilot, explicitly pass `-- --controlled-product`; otherwise fulfillment remains external. Put the returned non-secret merchant UUID in `LIVE_MERCHANT_ID`. Remove provisioning password variables after creation. The command is idempotent by operator/merchant membership. Browser signup remains disabled. Password reset and outbound email are not configured; the pilot operator manages provisioning locally.

The product/initial policy uses Studio Plus `studio-2.1`. Update the policy through settings for the pilot, and create orders with the merchant's actual product/order context. This first implementation is a single-product pilot; adding arbitrary products requires an explicit product-management extension.

## Tatum — authenticated read-only Sui gRPC

- Endpoint pinned to `sui-mainnet-grpc.gateway.tatum.io:443` with TLS.
- `TATUM_API_KEY` is passed as `x-api-key` metadata.
- `SUI_NETWORK=mainnet`; other live networks are intentionally unsupported.
- Read `LedgerService/GetServiceInfo` and require `chain=mainnet`.
- Read `LedgerService/GetTransaction` with paths `digest`, `transaction`, `effects.status`, `checkpoint`, `timestamp`, `balance_changes`.
- The installed SDK exposes camelCase TS fields (`readMask`, `balanceChanges`) and protobuf `bigint` checkpoint/timestamp fields. Do not copy old JSON-RPC shapes into this adapter.
- Coin metadata decimals are read through the installed SDK's gRPC-backed `getCoinMetadata`.

The supported transaction is exactly two commands: `SplitCoins` for one amount followed by `TransferObjects` of that split result to one pure address input. The amount is decoded as a BCS u64; positive balance changes must agree exactly. The sender owns gas, all debits belong to that sender, and there is exactly one credit. Arbitrary Move calls, batches, sponsored transfers, swaps and other structures require review.

The deterministic verifier checks network, successful execution plus checkpoint, recipient, canonical coin type, exact integer base units, metadata decimals, pre-associated payer/customer binding, creation/expiry time, and transactional allocation. `NOT_FOUND` can mean unknown or pruned history; if the provider does not distinguish those, the app reports `NOT_FOUND_OR_PRUNED`, not a false certainty. Timeout, rate limit, authentication rejection and unavailability are separate pending reasons.

Readiness checks prove authenticated gateway access, not a paid order. A real transaction matching a real order must be checked in the case workspace for actual payment evidence.

Sources: [Tatum gRPC guide](https://docs.tatum.io/reference/sui-grpc), [migration guide](https://docs.tatum.io/docs/sui-migration-guide-from-json-rpc-to-grpc), [Sui API](https://docs.sui.io/references/sui-api), [transaction lifecycle](https://docs.sui.io/develop/transactions/transaction-lifecycle). The installed protobuf definitions under `node_modules/@mysten/sui/src/grpc/proto/sui/rpc/v2/` were inspected directly.

## Walrus — ownership, submission, completion, recall

Manage the merchant account and dedicated delegate using the [official Mainnet dashboard](https://memory.walrus.xyz). RecallDesk does not create ownership objects, sign funding transfers, or ask for an owner wallet key. The current task does not authorize onchain account/delegate registration: revoke the exposed delegate and obtain a replacement through the dashboard only after checking the applicable transaction and cost requirements. Do not reuse the exposed delegate for verification.

`MemWal.create` receives `key`, `accountId`, `serverUrl`, `namespace`, `requestTimeoutMs`, `recallTimeoutMs`, and `preflightTimeoutMs`. Mainnet relayer: `https://relayer.memory.walrus.xyz`. The app restricts the single configured live merchant to the matching account/namespace.

The application environment variable is **`MEMWAL_RELAYER_URL`**, even though the SDK parameter is `serverUrl`. `MEMWAL_SERVER_URL` is not an application setting. The account object ID, embedded owner address, delegate public key, delegate private key and local merchant UUID have different purposes and must not be substituted for each other. Read the account through Tatum, validate its type, and use its actual embedded owner as `MEMWAL_OWNER_ADDRESS`; the merchant's payment recipient is not proof of ownership.

Readiness checks retrieve the account through Sui, validate its `::account::MemWalAccount` type and `owner` field against `MEMWAL_OWNER_ADDRESS`, then perform authenticated `recall`. The account is a shared object: its embedded `owner` field matters, not simply the object's ownership envelope. The current [official contract source](https://github.com/MystenLabs/MemWal/blob/dev/services/contract/sources/account.move) was checked for this distinction. `health()` is public/unsigned and is never treated as proof of valid delegate access.

Worker sequence:

1. Local event and outbox commit together.
2. `remember(text, namespace, {idempotencyKey, dedupe:true})` accepts the unchanged logical event; persist `job_id`.
3. On later runs, `getRememberStatus(jobId)` preserves intermediate pending/running/uploaded states.
4. For `done`, use the supported `waitForRememberJob` completion helper and validate owner/namespace/blob reference before marking completed.
5. Persist the real completion receipt and actual timestamp. Only these live jobs count toward the Mainnet requirement.

`recall({query, namespace, limit:50})` returns plaintext, `blob_id`, semantic distance, and optional actual `created_at`. The adapter retains returned text/blob IDs, parses the strict schema, checks the committed content hash and scope, and applies local corrections. It does not invent a `verify()` method or claim independent onchain reconstruction. The SDK's deduplication features reduce delivery duplication; absolute distributed exactly-once delivery is not claimed.

The standard relayer sees plaintext before encrypting it. Namespace isolation is application-enforced; delegates operate across an account's namespaces. Revocation has limitations for old/already-accessed data. No remote deletion/erasure promise is made.

Sources: [overview](https://docs.wal.app/walrus-memory/sdk/overview), [quick start](https://docs.wal.app/walrus-memory/getting-started/quick-start), [SDK usage](https://docs.wal.app/walrus-memory/sdk/usage/memwal), [agent loop](https://docs.wal.app/walrus-memory/sdk/agent-storage-loop), [production readiness](https://docs.wal.app/walrus-memory/sdk/production-readiness), [multi-tenant ownership caveat](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant), [unsigned health](https://docs.wal.app/walrus-memory/security/health-check-unsigned).

## Selected explanation provider: Gemini or OpenAI

`LLM_PROVIDER` explicitly selects `gemini` or `openai`. Only the selected provider is instantiated. Gemini requires `GEMINI_API_KEY`, not `OPENAI_API_KEY`; OpenAI retains its existing key and structured-output support. Unsupported provider names produce an actionable configuration failure. Demo mode always returns the deterministic sample explanation without initializing either remote client, including when provider keys exist in the process environment.

For the local zero-spend pilot use:

```text
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.8-flash
GEMINI_API_KEY=<replacement key entered directly in the ignored pilot environment>
OPENAI_API_KEY=
```

The official [model catalog](https://ai.google.dev/gemini-api/docs/models), [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output), and [pricing page](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash), read on 9 November 2026, document this model and a free tier for standard text input/output. **That published price is not proof that a particular project is on the free tier.** Keep paid billing and automatic upgrades disabled, verify the project's free access in AI Studio, and use synthetic/redacted inputs: free-tier content may be used to improve Google's products. Some projects require verification before free access; see [API-key setup](https://ai.google.dev/gemini-api/docs/api-key). An inaccessible model or exhausted quota remains a visible failure; RecallDesk does not switch silently to a paid model.

Both adapters explain a decision already selected by the server. The input contains bounded customer context and minimized decision evidence. Gemini receives JSON Schema derived from the shared explanation schema; the returned JSON must pass that authoritative Zod schema and `validateExplanation`. The exact remedy and current policy must remain unchanged, and citations must identify supplied recalled logical events. The model has no tools, search, grounding, uploads or payment/fulfillment authority.

The pinned Google SDK uses `interactions.create` with a JSON `response_format`, `store:false`, `automatic_continuation:false`, a 1,000-token output limit and per-request `retries:{strategy:"none"}`. Its low-level HTTP attempt limit is one. Metadata readiness uses `models.get`; no inference is needed for that check. Inputs are limited to 24 KB, customer context to 2,000 characters, and returned explanations to 16 KB. Raw recalled text, buyer identities and transaction records are omitted from model input.

In the marked local pilot (`LOCAL_PILOT_VERIFICATION=true`), the shared adapter also requires reviewed free-tier/replacement-credential attestations, Gemini 3.8 Flash and disabled Mainnet writes. It reserves one durable attempt before each UI or CLI request, with a total cap of four. Configuration failures and exhausted allowances produce visible fallback errors without sending a request. Outside this local verification arrangement, both selected providers remain supported.

Requests have bounded output and a cancellable timeout. Gemini's SDK receives an application-controlled fetch with the abort signal attached to the actual connection, plus a bound on SDK response processing. Local HTTP tests exercise stalled headers, partial bodies, exact API path and preservation of the finite JSON body. The ordinary timeout is 15 seconds; the original smoke allows 30 seconds; explicitly authorized repair checks used 60 seconds or a minimal two-evidence input with a 120-second maximum. Output remains capped at 1,000 tokens. SDK retries are disabled. User-enabled application backoff can retry timeouts within the recorded allowance; see the final follow-up below. Refusals, empty output, malformed JSON/schema, invalid citations, changed decisions, access errors, rejected structured requests, quota limits, network errors and timeouts produce a labeled deterministic safety fallback. Provider exception text and credentials are not returned; diagnostics retain only allowlisted categories/statuses, byte counts, path and timing. Only a fully validated response is recorded as `gemini:<actual-model-id>` or `openai:<actual-model-id>` with no provider error.

Readiness uses authenticated model metadata reads, not generation. It separates credentials present, model accessible and successful structured inference. Metadata access does not prove free billing, output validity or a completed support case. Successful inference evidence is scoped to the active merchant, provider and model; fallback/error rows do not count. The separate synthetic smoke report does not fabricate a paid application case.

OpenAI remains available with `LLM_PROVIDER=openai`, `OPENAI_API_KEY` and a model supporting Responses structured outputs. It is not part of this zero-spend pilot. Sources: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).

## Explicit live checks and showcase

```sh
npm run integrations:check -- --live
```

This makes read-only authenticated provider checks and persists redacted evidence. Never use demo status to infer live readiness.

The following showcase procedure is for a **future, separately authorized** write session. It is prohibited during the current zero-spend, read-only verification task. After merchant ownership/destination review, service/cost checks and explicit write authorization, set `ALLOW_MAINNET_WRITES=true` and run:

```sh
npm run mainnet:seed -- --confirm-account <exact-account-id> --confirm-namespace <exact-namespace> --count 20
```

The bounded showcase is idempotent by stable historical order references and logical events. It labels synthetic cases separately from real storage. The script queues at most 20 records, processes resumable jobs for up to three minutes, and exports only actual completed receipts into ignored `artifacts/live/mainnet-evidence.json`. Pending records are not counted. Review/redact this artifact before promoting evidence into a public repository.

Live Mainnet credentials/checks/writes/recall remain pending in this build. Follow the demo runbook using a fresh authorized live session after completion to prove persisted recall.

[Live verification](live-verification.md) gives the opt-in real wallet parser check, second-process recall client and bounded model evaluation. Those commands are prepared, not a claim of successful live execution.

## Final 10 November request compatibility and retries

The Interactions structured-output REST example also specifies `Api-Revision: 2026-05-20`. The adapter now sets that header through the official SDK's `httpOptions.headers`; a real local HTTP test verifies its transmission. This correction did not resolve the upstream failure. The third allowance returned three 503 responses and one timeout: twelve total attempts, zero validated inference.

The user's follow-up authorizes application backoff through `LLM_MAX_RETRIES=0|1|2`; SDK retries remain disabled. Every attempt is reserved durably before transport. Temporary failures retry with bounded waits, including Retry-After, while invalid credentials, business output or unavailable free access stop. See [retry details and evidence](live-verification.md#final-10-november-follow-up).
