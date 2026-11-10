# Deployment and operations

## Runtime requirements

Node **24.22.1+ within Node 24**, persistent PostgreSQL, outbound HTTPS and native TLS gRPC/HTTP2, a stable HTTPS base URL, server-managed secrets, and a background worker. Business data and outbox state must not live on an ephemeral filesystem. The current [Walrus quick start](https://docs.wal.app/walrus-memory/getting-started/quick-start) requires this newer patch; the older 24.18.0 results in the verification history remain historical.

The connected Sites skill describes Cloudflare Workers with HTTP-based external connections and no raw TCP. This does not fit RecallDesk's installed native gRPC transport. No Site or chargeable resource was created. The README records repository/article publication separately from the still-pending application deployment. Docker Desktop is present on the host but not enabled for this WSL distro, so the image/Compose path is prepared but not locally executed.

## Isolated local live pilot

The 9 November task originally prohibited publication and Mainnet writes. On 10 November the user authorized the reviewed source/article release and a bounded one-then-ten synthetic memory phase after delegate authentication succeeds. Zero spending, no transfers and no automatic wallet transactions remain required. Keep the demo and its database intact.

`npm run pilot:setup` prepares `.local/live-pilot` with its own ignored `.env.local` and separate `recalldesk_live` PostgreSQL database. The source copy has its own locked dependency installation, Next build output and process environment. Rerunning setup refreshes source files while preserving the pilot's environment and database records. Do not copy root demo database records into it. Restrict the pilot directory and environment to their owner; the setup writes a cryptographically random auth secret without displaying it. Provider secrets must be entered directly in the local file after rotation.

Use port 3000 for the root demo and **3001 for the pilot**. With PostgreSQL running, prepare/build the pilot and start its processes in separate terminals:

```sh
npm run pilot:setup
npm run pilot:run -- install
npm run pilot:run -- db:migrate
npm run pilot:run -- build
npm run pilot:run -- start
```

```sh
npm run pilot:run -- worker
```

The wrapper binds the web process to `127.0.0.1:3001`; the pilot's `APP_BASE_URL` must match `http://localhost:3001`. `ALLOW_MAINNET_WRITES=false` remains mandatory; a running worker does not authorize writes. Leave `WORKER_TOKEN` blank for this standalone arrangement. Live mode disables demo entry and HTTP signup, so provision the merchant only after account ownership validation. Restart the pilot after changing its environment. Database data persists independently of the source copy and application processes.

The current workspace has merchant `5a151d00-8b4f-4060-82ea-5c3aea4528bf` and a controlled product. Its actual UUID and verified account owner are already saved in the pilot environment. The generated password was removed from that environment and retained only in the owner-readable, ignored `.local/live-pilot/.local/merchant-login.json` for local handoff. Save it in your password manager, then remove the handoff file. No new merchant or database reset is needed.

For this WSL workspace, the official Node 24.22.1 Linux archive was checksum-verified and extracted into `.local/runtime/node-v24.22.1-linux-x64`. To use it without changing the system installation, run `export PATH="$PWD/.local/runtime/node-v24.22.1-linux-x64/bin:$PATH"` from the project root before the commands above. Other hosts should install the documented Node version through their normal runtime manager.

Configure only the selected explanation provider: Gemini uses `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.8-flash` and `GEMINI_API_KEY`, with `OPENAI_API_KEY` empty. The model is documented with a free tier, but project access/billing must be checked separately. Preserve the original four attempts and four repair attempts. A third, separately authorized four-attempt grant binds both earlier ledgers by hash; metadata reads and inference evidence are reported separately. See [live verification](live-verification.md).

The host's port binding and local firewall determine whether other devices can reach the pilot. Use a loopback-only listener for the local live process; do not expose it through a tunnel or public ingress during this task.

The setup sets `LOCAL_PILOT_VERIFICATION=true`, which the wrapper requires. UI and CLI inference share the four-attempt ledger. The default `PILOT_FREE_TIER_CONFIRMED=false` and `PILOT_CREDENTIALS_ROTATED=false` prevent UI inference even if keys are later entered. Set these attestations only after checking free project access/billing and completing credential rotation. The reviewed pilot only permits Gemini 3.8 Flash; another provider/model is rejected without a request. Ordinary deployments outside this explicitly marked pilot retain normal Gemini/OpenAI selection.

A named `LLM_VERIFICATION_GRANT` also requires a private authorization manifest bound to the preserved original ledger hash; the name alone grants nothing. Each grant closes on first validated success or four requests. All three current grants are exhausted (12 requests total). Later grants hash-link all prior histories; do not reset them. `LLM_MAX_RETRIES=2` enables at most two application retries, each counted, with SDK retries disabled. Preserve all ledgers across source refreshes and restarts; neither is a deployment asset. The repaired Walrus private delegate belongs only in the pilot environment, and its fresh public key still needs owner-wallet registration.

## Plain Node deployment

1. Provision an authorized persistent PostgreSQL database and Node-compatible host.
2. Install the locked dependencies with `npm ci` and set server environment variables from `.env.example`. Keep secrets out of build artifacts. Use `APP_MODE=demo` with no sponsor keys for a public sample deployment; use a separate database and secrets for the live pilot.
3. Back up the database before schema changes. Run `npm run db:migrate` as one release job.
4. Run `npm run build`, then `npm start` as the web service.
5. Run `npm run worker` as a separately supervised process against the same database. Restart it automatically on failure.
6. Put TLS at the host's ingress/reverse proxy and set `APP_BASE_URL` to the exact external origin. Cookies become Secure for an HTTPS base URL.
7. Check `/api/health` for liveness. After authentication, `/api/readiness` reports database, worker heartbeat and provider readiness. Liveness does not imply sponsor readiness.
8. Verify demo entry/login, case creation, payment, recommendation, approval/attempt/outcome, completed memory, correction and fresh recall on the actual deployed URL.

For the live merchant, use `npm run merchant:create` from a secured server environment, then set the returned `LIVE_MERCHANT_ID`. It is not safe to share one environment delegate among unrelated live merchants; add a real per-merchant secret mapping before extending the pilot.

## Docker Compose

The Dockerfile includes the locked Node tools so migrations and workers use the same artifact. It runs as the unprivileged `node` user. PostgreSQL uses a named volume and is not exposed to the public network. The web container binds to local loopback; configure your TLS ingress separately.

Copy `.env.example` to `.env.local`. Set `POSTGRES_PASSWORD` as a strong random alphanumeric value in your shell or an ignored Compose `.env` (avoid URL-special characters unless correctly encoded). Configure the app base URL and mode in `.env.local`.

```sh
docker compose build
docker compose up -d
docker compose logs --tail 80 migrate web worker
```

Compose waits for PostgreSQL health and migration completion before starting the app/worker. Do not run `docker compose down -v` unless you intend to destroy the database volume. Routine restarts preserve it.

The local Docker path has not been executed because WSL Docker integration is unavailable. Enable integration or use a compatible host, then verify image build, migration, TLS, and full lifecycle before claiming deployment readiness.

## Scheduled worker alternative

If a long-running worker is unavailable, an authenticated scheduler may POST `/api/worker` with `Authorization: Bearer <WORKER_TOKEN>`. Use a random token of at least 32 characters from a secret manager. Each call processes at most one queued/polling job. Configure sufficient frequency and an execution timeout of at least 45 seconds. HTTP browser Origin checks do not apply to this separate bearer-authenticated worker path.

Never depend on a request ending after launching a fire-and-forget task. All work is durable and resumable.

## Failure recovery

- `queued`: committed locally; not accepted remotely.
- `submitting` / `retrying`: stable operation key retained; possible acceptance must not become a new business event.
- `accepted` / `processing`: job ID persisted; poll it again after restart.
- `completed`: validated completion receipt exists.
- `failed`: terminal provider/configuration diagnosis is needed.
- `uncertain`: retry budget exhausted; storage outcome may be unknown. This is not proof the remote write failed.

After diagnosing provider access/configuration, resume a single exact job with `npm run worker:resume -- <job-uuid> --confirm`. This preserves the logical event, payload and provider job ID. Do not insert another outcome or blindly change an idempotency key.

Back up PostgreSQL with the host's managed backups or `pg_dump`; test restoration in a separate database. Retain the event/authenticity ledger along with Walrus evidence. Expired demo workspaces can be cleaned by a separately reviewed maintenance process; reset itself only revokes the selected demo session and does not delete live or remote history.

## Publication review

Before any future publication: run checks, secret scan, inspect the Git diff/staged paths, document reuse terms, and review the blog/evidence. Repository/blog publication was performed under the November8 instruction. The 10 November confirmation authorizes reviewed source/article publication. Spending, transfers and automatic owner-wallet transactions remain prohibited. Do not publish `.env.local`, `.local`, test authentication storage states, raw provider responses, or unreviewed `artifacts/live` data. The checked event rules require public visibility, not a particular source license.

Smallest missing deployment requirement: an authorized Node-compatible target plus persistent PostgreSQL access and the intended public hostname. Live sponsor readiness additionally requires registering the existing fresh delegate, authenticated recall, completed storage and a genuine order-bound payment.
