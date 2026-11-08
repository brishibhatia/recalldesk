# Deployment and operations

## Runtime requirements

Node 24, persistent PostgreSQL, outbound HTTPS and native TLS gRPC/HTTP2, a stable HTTPS base URL, server-managed secrets, and a background worker. Business data and outbox state must not live on an ephemeral filesystem.

The connected Sites skill describes Cloudflare Workers with HTTP-based external connections and no raw TCP. This does not fit RecallDesk's installed native gRPC transport. No Site or chargeable resource was created. The README records repository/article publication separately from the still-pending application deployment. Docker Desktop is present on the host but not enabled for this WSL distro, so the image/Compose path is prepared but not locally executed.

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

Before publishing: run checks, secret scan, inspect the Git diff/staged paths, document reuse terms, and review the blog/evidence. The November8 instruction authorizes repository/blog publication; creating paid hosting still requires the missing target and budget. Do not publish `.env.local`, `.local`, test authentication storage states, raw provider responses, or unreviewed `artifacts/live` data. The checked event rules require public visibility, not a particular source license.

Smallest missing deployment requirement: an authorized Node-compatible target plus persistent PostgreSQL access and the intended public hostname. Live sponsor readiness additionally requires the dedicated merchant credentials and authorized Mainnet write destination.
