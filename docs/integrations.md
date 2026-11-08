# Integration setup and verified interfaces

Documentation and installed package types inspected on 2026-11-05; local integration tests continued on 2026-11-06. No live API credentials were present. “Implemented” and “tested against local contract fixtures” do not mean “verified live.”

## Locked versions

| Component | Installed version / interface |
| --- | --- |
| Node | 24.18.0 used locally; project targets Node 24 |
| Next / React | 16.4.5 / 19.3.1 |
| PostgreSQL tooling | `pg` 8.23.1, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 |
| Merchant auth | Better Auth 1.7.17, Drizzle PostgreSQL adapter |
| Sui SDK | `@mysten/sui` 2.39.0; `SuiGrpcClient`, exported `GrpcTypes` |
| Native gRPC transport | `@protobuf-ts/grpc-transport` 2.11.1 with `@grpc/grpc-js` 1.14.7 |
| Walrus Memory | `@mysten-incubation/memwal` 0.1.13 |
| LLM | OpenAI SDK 7.51.0, Responses `parse`, `zodTextFormat`, Zod 4.6.7 |

Exact transitive versions are in `package-lock.json`. Targeted dependency overrides upgrade esbuild under the legacy Drizzle loader and minimatch under the TypeScript lint parser; lint, migration, tests and build verify compatibility. This is not a security certification.

## Provision the first live merchant

Use a separate live database/environment. Keep `ALLOW_MAINNET_WRITES=false` until the destination and ownership are reviewed. Configure these in `.env.local` or server secrets, never chat:

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

Create the merchant account and dedicated delegate using the [official Mainnet dashboard](https://memory.walrus.xyz). RecallDesk does not create ownership objects, sign funding transfers, or ask for an owner wallet key.

`MemWal.create` receives `key`, `accountId`, `serverUrl`, `namespace`, `requestTimeoutMs`, `recallTimeoutMs`, and `preflightTimeoutMs`. Mainnet relayer: `https://relayer.memory.walrus.xyz`. The app restricts the single configured live merchant to the matching account/namespace.

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

## OpenAI structured explanations

Set `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, and `LLM_MODEL` to an available model supporting Responses structured outputs. No model identifier or entitlement is assumed. A readiness check checks model access without buying an inference; successful recommendations separately record live inference evidence.

The adapter uses `responses.parse` with `zodTextFormat`, `store:false`, a bounded output, 15-second request timeout and one transport retry. Output must retain the deterministic chosen remedy and policy, and cite only actual recalled IDs. Malformed, refused or invalid output produces an explicitly labeled deterministic safety explanation and visible provider error. It never claims sample inference is a successful live model response. No tool execution is delegated to model text.

Sources: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).

## Explicit live checks and showcase

```sh
npm run integrations:check -- --live
```

This makes read-only authenticated provider checks and persists redacted evidence. Never use demo status to infer live readiness.

After merchant ownership/destination review and explicit write authorization, set `ALLOW_MAINNET_WRITES=true` and run:

```sh
npm run mainnet:seed -- --confirm-account <exact-account-id> --confirm-namespace <exact-namespace> --count 20
```

The bounded showcase is idempotent by stable historical order references and logical events. It labels synthetic cases separately from real storage. The script queues at most 20 records, processes resumable jobs for up to three minutes, and exports only actual completed receipts into ignored `artifacts/live/mainnet-evidence.json`. Pending records are not counted. Review/redact this artifact before promoting evidence into a public repository.

Live Mainnet credentials/checks/writes/recall remain pending in this build. Follow the demo runbook using a fresh authorized live session after completion to prove persisted recall.

[Live verification](live-verification.md) gives the opt-in real wallet parser check, second-process recall client and bounded model evaluation. Those commands are prepared, not a claim of successful live execution.
