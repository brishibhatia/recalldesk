"use client";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDot,
  FlaskConical,
  Inbox,
  Layers,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
  ChartNoAxesCombined,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { remedies, type Mode, type RemedyId } from "@/core/types";
import type { workspace, caseDetails } from "@/server/services";
import type { readiness } from "@/server/readiness";
import type { compareCase, evidenceReport } from "@/server/evidence";
import type { productAccess } from "@/server/fulfillment";
import type { evaluate } from "@/evaluation/runner";
import type { memories, jobs, evaluations } from "@/db/schema";

type JSONData<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? JSONData<U>[]
    : T extends object
      ? { [K in keyof T]: JSONData<T[K]> }
      : T;
type Workspace = JSONData<Awaited<ReturnType<typeof workspace>>>;
type Detail = JSONData<
  Extract<Awaited<ReturnType<typeof caseDetails>>, { order: unknown }>
>;
type Ready = JSONData<Awaited<ReturnType<typeof readiness>>>;
type MemoryRow = JSONData<{
  event: typeof memories.$inferSelect;
  job: typeof jobs.$inferSelect;
}>;
type EvalRun = JSONData<typeof evaluations.$inferSelect>;
type Report = ReturnType<typeof evaluate>;
type EvidenceReport = JSONData<Awaited<ReturnType<typeof evidenceReport>>>;
type Comparison = JSONData<Awaited<ReturnType<typeof compareCase>>>;
type ProductAccess = JSONData<Awaited<ReturnType<typeof productAccess>>>;
type CustomerDetail = JSONData<
  Extract<
    Awaited<ReturnType<typeof caseDetails>>,
    { ticket: { title: string }; order?: never }
  >
>;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
}
function useRemote<T>(path: string, version = 0, pollMs = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const fetchData = () =>
      api<T>(path)
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
          }
        })
        .catch((err) => {
          if (active) setError(err.message);
        });
    void fetchData();
    const timer = pollMs ? setInterval(fetchData, pollMs) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, version, pollMs]);
  return { data, error };
}
const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not yet";
const label = (value: string) => value.replaceAll("_", " ");
function Badge({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <span className={`badge ${value}`}>
      <span />
      {children ?? label(value)}
    </span>
  );
}
function Empty({
  title,
  children,
  icon = <Layers size={26} />,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="error-box" role="alert">
      <TriangleAlert size={17} />
      <span>{children}</span>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={20} /> Loading workspace…
    </div>
  );
}
function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Layers size={22} />
      </span>
      recall<span className="brand-light">desk</span>
      <span className="brand-dot">.</span>
    </span>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    element?.showModal();
  }, [element]);
  return (
    <dialog ref={setElement} className="modal" onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
type Run = (
  action: string,
  data?: Record<string, unknown>,
  caseId?: string,
  revision?: number,
) => Promise<Record<string, unknown> | null>;

export function RecallDesk({ mode }: { mode: Mode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [version, setVersion] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<"case" | "order" | null>(null);
  const isWorkspace = pathname.startsWith("/workspace"),
    isSupport = pathname === "/support";
  const { data: ws, error: loadError } = useRemote<Workspace>(
    isWorkspace ? "workspace" : "health",
    version,
  );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const execute = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try {
      const result = await fn();
      refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  };
  const run: Run = async (action, data = {}, caseId, revision) =>
    (await execute(action, () =>
      api<Record<string, unknown>>("action", {
        action,
        data,
        caseId,
        revision,
        commandId: crypto.randomUUID(),
      }),
    )) as Record<string, unknown> | null;
  async function enter() {
    await execute("entry", async () => {
      await api("demo", {});
      router.push("/workspace");
    });
  }
  if (isSupport) return <Support mode={mode} />;
  if (pathname === "/blog")
    return (
      <div className="public-blog">
        <Link href="/">
          <Logo />
        </Link>
        <Blog />
      </div>
    );
  if (!isWorkspace)
    return (
      <Entry
        mode={mode}
        enter={enter}
        busy={!!busy}
        error={error}
        signIn={async (email, password) => {
          await execute("signin", async () => {
            await api("auth/sign-in/email", { email, password });
            router.push("/workspace");
          });
        }}
      />
    );
  const section = pathname.split("/")[2] ?? "inbox",
    caseId = section === "cases" ? pathname.split("/")[3] : null;
  const nav = [
    { path: "/workspace", title: "Case inbox", icon: Inbox, key: "inbox" },
    {
      path: "/workspace/memory",
      title: "Learning timeline",
      icon: Layers,
      key: "memory",
    },
    {
      path: "/workspace/evaluation",
      title: "Evaluation",
      icon: ChartNoAxesCombined,
      key: "evaluation",
    },
    {
      path: "/workspace/evidence",
      title: "Judge evidence",
      icon: ShieldCheck,
      key: "evidence",
    },
    {
      path: "/workspace/settings",
      title: "Integrations & policy",
      icon: Settings2,
      key: "settings",
    },
    {
      path: "/workspace/blog",
      title: "Field notes",
      icon: BookOpen,
      key: "blog",
    },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="logo-link" href="/">
          <Logo />
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">F</span>
          <div>
            <strong>{ws?.merchant?.name ?? "Workspace"}</strong>
            <small>
              {mode === "demo" ? "Sample merchant" : "Merchant workspace"}
            </small>
          </div>
          <MoreHorizontal size={16} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              href={item.path}
              key={item.key}
              className={`nav-item ${section === item.key || (caseId && item.key === "inbox") ? "active" : ""}`}
            >
              <item.icon size={18} />
              <span>{item.title}</span>
              {item.key === "inbox" && ws?.cases && (
                <small>
                  {
                    ws.cases.filter(
                      (c) => !["resolved", "closed"].includes(c.ticket.status),
                    ).length
                  }
                </small>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-spark">
            <Sparkles size={16} />
          </span>
          <strong>Every outcome counts.</strong>
          <p>The next case starts with what the last one taught you.</p>
          <Link href="/workspace/memory">
            Explore the learning loop <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <span className="operator-avatar">YO</span>
          <div>
            <strong>You</strong>
            <small>
              {mode === "demo" ? "Demo operator" : "Merchant operator"}
            </small>
          </div>
          <button
            title="Leave workspace"
            aria-label="Leave workspace"
            className="icon-button"
            onClick={() =>
              execute("signout", async () => {
                await api(mode === "live" ? "auth/sign-out" : "signout", {});
                router.push("/");
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div>
            <span className="mobile-logo">
              <Layers size={21} />
            </span>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {caseId
                ? "Case workspace"
                : (nav.find((n) => n.key === section)?.title ?? "Case inbox")}
            </strong>
          </div>
          <Link href="/workspace/settings" className="top-status">
            <span className="status-dot" />
            {mode === "demo" ? "Demo mode" : "Live mode"}
            <ChevronRight size={14} />
          </Link>
        </header>
        <div className={`mode-banner ${mode}`}>
          <FlaskConical size={15} />
          <span>
            {mode === "demo" ? (
              <>
                <strong>Sample workspace</strong> · Synthetic cases and
                simulated providers. Your changes are isolated to this session.
              </>
            ) : (
              <>
                <strong>Live workspace</strong> · Provider failures remain
                visible. Mainnet writes require configured authorization.
              </>
            )}
          </span>
          {mode === "demo" && (
            <button
              onClick={() =>
                execute("reset", async () => {
                  await api("demo/reset", {});
                  router.push("/");
                })
              }
              disabled={!!busy}
            >
              Reset session <RefreshCw size={12} />
            </button>
          )}
        </div>
        <main className="content" id="main-content">
          {error && (
            <div className="global-error">
              <ErrorBox>{error}</ErrorBox>
              <button
                aria-label="Dismiss error"
                className="icon-button"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loadError ? (
            <Empty
              title="Your workspace is not open"
              icon={<LockKeyhole size={26} />}
            >
              {loadError} <Link href="/">Return to sign in</Link>
            </Empty>
          ) : !ws?.merchant ? (
            <Loading />
          ) : caseId ? (
            <CaseWorkspace
              key={caseId}
              id={caseId}
              mode={mode}
              version={version}
              run={run}
              busy={busy}
              refresh={refresh}
            />
          ) : section === "memory" ? (
            <MemoryExplorer version={version} />
          ) : section === "evidence" ? (
            <JudgeEvidence ws={ws} version={version} />
          ) : section === "evaluation" ? (
            <Evaluation
              version={version}
              busy={busy}
              run={() => execute("evaluation", () => api("evaluate", {}))}
            />
          ) : section === "settings" ? (
            <Settings
              ws={ws}
              version={version}
              busy={busy}
              run={run}
              check={() => execute("checks", () => api("checks", {}))}
              openOrder={() => setModal("order")}
            />
          ) : section === "blog" ? (
            <Blog />
          ) : (
            <CaseInbox ws={ws} onNew={() => setModal("case")} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            RecallDesk <span className="muted">/</span> Support that remembers.
          </span>
          <span>Human approval. Traceable experience.</span>
        </footer>
      </div>
      {modal && ws?.merchant && (
        <Modal
          title={modal === "case" ? "Open a new case" : "Create an order"}
          onClose={() => setModal(null)}
        >
          {modal === "case" ? (
            <CaseForm
              ws={ws}
              busy={!!busy}
              submit={async (data) => {
                const result = await run("create_case", data);
                if (result) {
                  setModal(null);
                  router.push(`/workspace/cases/${result.id}`);
                }
              }}
            />
          ) : (
            <OrderForm
              mode={mode}
              busy={!!busy}
              submit={async (data) => {
                if (await run("create_order", data)) {
                  setModal(null);
                  setToast("Order created. You can now open its case.");
                }
              }}
            />
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Entry({
  mode,
  enter,
  busy,
  error,
  signIn,
}: {
  mode: Mode;
  enter: () => void;
  busy: boolean;
  error: string;
  signIn: (email: string, password: string) => void;
}) {
  return (
    <div className="entry">
      <header>
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/blog">
          How the memory works <ArrowUpRight size={15} />
        </Link>
      </header>
      <main className="entry-grid">
        <div>
          <span className="eyebrow">
            <span className="status-dot" /> BUILT FOR THE NEXT CONVERSATION
          </span>
          <h1>
            Good support
            <br />
            shouldn’t start
            <br />
            from <span>zero.</span>
          </h1>
          <p className="entry-description">
            RecallDesk checks Sui payments, remembers attempted fixes, and helps
            your team choose what to try next. Every recommendation traces back
            to merchant-confirmed experience.
          </p>
          {error && <ErrorBox>{error}</ErrorBox>}
          {mode === "demo" ? (
            <>
              <button
                className="button primary large"
                onClick={enter}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Inbox size={18} />
                )}{" "}
                Open sample workspace <ArrowRight size={18} />
              </button>
              <p className="entry-caption">
                No account or wallet needed. Synthetic data. Your own session.
              </p>
            </>
          ) : (
            <form
              className="form login-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                signIn(String(f.get("email")), String(f.get("password")));
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                />
              </label>
              <button className="button primary" disabled={busy}>
                Sign in to your workspace <ArrowRight size={17} />
              </button>
              <small>
                Merchant accounts are provisioned by your workspace
                administrator.
              </small>
            </form>
          )}
          <div className="entry-trust">
            <ShieldCheck size={16} /> Payment-aware <span>·</span>
            <Layers size={16} /> Memory-backed <span>·</span> Human-approved
          </div>
        </div>
        <div className="entry-preview">
          <div className="preview-top">
            <span className="three-dots">● ● ●</span>
            <span>AN EXAMPLE OF THE LEARNING LOOP</span>
          </div>
          <div className="preview-case">
            <span className="eyebrow">RETURNING ISSUE / PRODUCT ACCESS</span>
            <h2>“I paid, but I’m still locked out.”</h2>
            <Badge value="sample">Illustrative sample</Badge>
          </div>
          <div className="preview-step">
            <span className="step-icon">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Start with the payment</strong>
              <p>Check the recipient, asset, amount and buyer.</p>
            </div>
            <Check size={17} />
          </div>
          <div className="preview-step">
            <span className="step-icon">
              <Layers size={20} />
            </span>
            <div>
              <strong>Remember what didn’t work</strong>
              <p>Refreshing failed in comparable cases.</p>
            </div>
            <ArrowDown size={17} />
          </div>
          <div className="preview-learning">
            <span>
              <Sparkles size={17} /> What changed because of memory?
            </span>
            <div>
              <s>Refresh the browser</s>
              <ArrowRight size={19} />
              <strong>Relink product access</strong>
            </div>
            <p>
              Relevant outcomes inform the next action. Your team makes the
              decision.
            </p>
          </div>
          <div className="preview-bottom">
            <span className="avatar-stack">
              <i>M</i>
              <i>N</i>
              <i>S</i>
            </span>
            <span>Less repeating. More resolving.</span>
          </div>
        </div>
      </main>
      <footer>
        <span>Built for Total Recall · Track 2</span>
        <Link href="/support">
          Customer support <ArrowRight size={14} />
        </Link>
        <span>Tatum × Walrus Memory</span>
      </footer>
    </div>
  );
}

function CaseInbox({ ws, onNew }: { ws: Workspace; onNew: () => void }) {
  const params = useSearchParams(),
    router = useRouter();
  const search = params.get("q") ?? "",
    status = params.get("status") ?? "active",
    issue = params.get("issue") ?? "all";
  function filter(key: string, value: string) {
    const p = new URLSearchParams(params);
    p.set(key, value);
    router.replace(`/workspace?${p.toString()}`, { scroll: false });
  }
  const active = ws.cases.filter(
    (c) => !["resolved", "closed"].includes(c.ticket.status),
  );
  const filtered = ws.cases.filter(
    (c) =>
      (status === "all" || status === "active"
        ? !["resolved", "closed"].includes(c.ticket.status) || status === "all"
        : c.ticket.status === status) &&
      (issue === "all" || c.ticket.issue === issue) &&
      `${c.ticket.title} ${c.ticket.reference} ${c.orderReference} ${c.customer}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR SUPPORT DESK</span>
          <h1>
            Case inbox<span className="heading-count">{active.length}</span>
          </h1>
          <p>A little context makes the next conversation better.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} /> New case
        </button>
      </div>
      <div className="stats-strip">
        <div>
          <span className="stat-icon amber">
            <Inbox size={18} />
          </span>
          <span>
            <strong>{active.length}</strong>
            <small>Need attention</small>
          </span>
        </div>
        <div>
          <span className="stat-icon teal">
            <CheckCheck size={18} />
          </span>
          <span>
            <strong>
              {ws.cases.filter((c) => c.ticket.status === "resolved").length}
            </strong>
            <small>Resolved cases</small>
          </span>
        </div>
        <div>
          <span className="stat-icon violet">
            <Layers size={18} />
          </span>
          <span>
            <strong>Traceable</strong>
            <small>Every learning decision</small>
          </span>
        </div>
        <div className="stats-note">
          Today’s decisions,
          <br />
          <strong>tomorrow’s experience.</strong>
        </div>
      </div>
      <section className="panel inbox-panel">
        <div className="inbox-toolbar">
          <div className="tabs" aria-label="Case status">
            {[
              ["active", "Active cases"],
              ["resolved", "Resolved"],
              ["all", "All cases"],
            ].map(([key, text]) => (
              <button
                key={key}
                className={status === key ? "selected" : ""}
                onClick={() => filter("status", key)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="filters">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search cases"
                placeholder="Search cases…"
                value={search}
                onChange={(e) => filter("q", e.target.value)}
              />
            </label>
            <select
              aria-label="Filter issue type"
              value={issue}
              onChange={(e) => filter("issue", e.target.value)}
            >
              <option value="all">All issues</option>
              <option value="access">Product access</option>
              <option value="delivery">Link delivery</option>
              <option value="session">Session</option>
            </select>
          </div>
        </div>
        {filtered.length ? (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Decision results table"
          >
            <table className="case-table">
              <thead>
                <tr>
                  <th>Case / customer</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Priority</th>
                  <th>Updated</th>
                  <th aria-label="Open case" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ ticket, customer, orderReference }) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link
                        href={`/workspace/cases/${ticket.id}?back=${encodeURIComponent(params.toString())}`}
                      >
                        <span className="case-cell">
                          <span className={`case-symbol ${ticket.issue}`}>
                            <MessageSquare size={17} />
                          </span>
                          <span>
                            <strong>{ticket.title}</strong>
                            <small>
                              {ticket.reference} <span>·</span> {customer}
                            </small>
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badge value={ticket.status} />
                    </td>
                    <td>
                      <span className="mono small">{orderReference}</span>
                    </td>
                    <td>
                      <span className={`priority ${ticket.priority}`}>
                        <span>▰</span> {ticket.priority}
                      </span>
                    </td>
                    <td className="muted small">{date(ticket.updatedAt)}</td>
                    <td>
                      <Link
                        aria-label={`Open ${ticket.reference}`}
                        href={`/workspace/cases/${ticket.id}?back=${encodeURIComponent(params.toString())}`}
                      >
                        <ChevronRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No cases in this view" icon={<Inbox size={26} />}>
            Try another filter, or open a case to start the learning loop.
          </Empty>
        )}
        <div className="table-footer">
          <span>
            {filtered.length} case{filtered.length === 1 ? "" : "s"} in this
            view
          </span>
          <span>
            <LockKeyhole size={12} /> Only your workspace
          </span>
        </div>
      </section>
      <div className="quiet-callout">
        <span className="stat-icon teal">
          <Sparkles size={19} />
        </span>
        <div>
          <strong>Start with “Paid, but my studio is still locked.”</strong>
          <p>
            Check its sample payment, then see how past failed fixes change the
            recommendation.
          </p>
        </div>
        <ArrowUpRight size={19} />
      </div>
    </>
  );
}

function CaseForm({
  ws,
  busy,
  submit,
}: {
  ws: Workspace;
  busy: boolean;
  submit: (data: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit(Object.fromEntries(f));
      }}
    >
      <label>
        Order reference
        <select name="orderId" required>
          {ws.orders
            .filter((o) => !o.reference.startsWith("HISTORY"))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.reference}
              </option>
            ))}
        </select>
      </label>
      {!ws.orders.length && (
        <p>Create an order in Integrations & policy first.</p>
      )}
      <label>
        Case title
        <input
          name="title"
          placeholder="Paid, but I can’t access the product"
          minLength={3}
          maxLength={160}
          required
        />
      </label>
      <label>
        Issue type
        <select name="issue">
          <option value="access">Product access</option>
          <option value="delivery">Access link delivery</option>
          <option value="session">Browser session</option>
        </select>
      </label>
      <label>
        Customer message
        <textarea
          name="message"
          rows={4}
          maxLength={4000}
          placeholder="What happened, and what have they tried?"
          required
        />
      </label>
      {ws.merchant.mode === "demo" && (
        <label>
          Sample payment scenario
          <select name="scenario">
            <option value="valid">Matching direct payment</option>
            <option value="wrong-recipient">Wrong recipient</option>
            <option value="wrong-asset">Wrong asset</option>
            <option value="wrong-buyer">Wrong buyer</option>
            <option value="unavailable">Provider unavailable</option>
            <option value="unknown">Unknown receipt</option>
            <option value="failed">Execution failed</option>
          </select>
        </label>
      )}
      <button className="button primary" disabled={busy || !ws.orders.length}>
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Plus size={16} />
        )}{" "}
        Create case
      </button>
    </form>
  );
}
function OrderForm({
  mode,
  busy,
  submit,
}: {
  mode: Mode;
  busy: boolean;
  submit: (data: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({
          ...Object.fromEntries(f),
          decimals: Number(f.get("decimals")),
          expectedPayer: f.get("expectedPayer") || null,
        });
      }}
    >
      <p>
        Bind the buyer before payment. An order without a known payer requires
        review.
      </p>
      <label>
        Order reference
        <input
          name="reference"
          required
          pattern="[A-Za-z0-9_-]+"
          placeholder="ST-2049"
        />
      </label>
      <label>
        Customer display name
        <input name="customer" required maxLength={80} />
      </label>
      <label>
        Pre-associated payer address
        <input
          name="expectedPayer"
          placeholder="0x…"
          defaultValue={mode === "demo" ? "0xb0b" : ""}
        />
      </label>
      <label>
        Canonical coin type
        <input name="coinType" required defaultValue="0x2::sui::SUI" />
      </label>
      <div className="form-row">
        <label>
          Exact amount in base units
          <input
            name="amount"
            required
            pattern="[1-9][0-9]*"
            defaultValue="2500000000"
          />
        </label>
        <label>
          Asset decimals
          <input
            name="decimals"
            type="number"
            min={0}
            max={30}
            required
            defaultValue={9}
          />
        </label>
      </div>
      <p className="helper">
        The recipient comes from your merchant configuration. Exact payment
        required within 24 hours. Live decimals are checked against Tatum
        metadata.
      </p>
      <button className="button primary" disabled={busy}>
        Create order
      </button>
    </form>
  );
}

function CaseWorkspace({
  id,
  mode,
  version,
  run,
  busy,
  refresh,
}: {
  id: string;
  mode: Mode;
  version: number;
  run: Run;
  busy: string;
  refresh: () => void;
}) {
  const { data: detail, error } = useRemote<Detail>(`cases/${id}`, version),
    params = useSearchParams(),
    router = useRouter();
  const [digest, setDigest] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null),
    [comparisonError, setComparisonError] = useState(""),
    [comparing, setComparing] = useState(false);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!detail) return <Loading />;
  const { ticket, order, customer, product, policy } = detail,
    rec = detail.recommendations[0],
    attempt = detail.attempts[0],
    payment = ticket.payment;
  const act = (action: string, data: Record<string, unknown> = {}) =>
    run(action, data, id, ticket.revision);
  const pending = !!busy,
    current =
      rec?.caseRevision === ticket.revision &&
      rec?.decision.policyVersion === policy.version;
  return (
    <>
      <Link
        className="back-link"
        href={`/workspace?${params.get("back") ?? ""}`}
      >
        <ArrowLeft size={15} /> Back to inbox
      </Link>
      <div className="page-heading case-heading">
        <div>
          <div className="case-kicker">
            <span className="mono">{ticket.reference}</span>
            <span>·</span>
            <span>{label(ticket.issue)}</span>
            <Badge value={ticket.status} />
          </div>
          <h1>{ticket.title}</h1>
          <p>
            <span className="inline-avatar">
              {customer.label
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>{" "}
            {customer.label} <span>·</span> {product.name} <span>·</span>{" "}
            {order.reference}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => act("escalate")}
        >
          <ArrowUpRight size={16} /> Escalate
        </button>
      </div>
      <div className="case-layout">
        <div className="case-main">
          <section className="memory-impact">
            <div className="section-title">
              <span className="accent-icon">
                <Sparkles size={19} />
              </span>
              <h2>What changed because of memory?</h2>
              <span className="pill">THE LEARNING MOMENT</span>
            </div>
            {rec ? (
              <>
                <div className="comparison">
                  <div>
                    <span className="eyebrow">WITHOUT EXPERIENCE</span>
                    <strong
                      className={
                        rec.decision.chosen !== rec.decision.baseline
                          ? "demoted"
                          : ""
                      }
                    >
                      {rec.decision.baseline
                        ? remedies[rec.decision.baseline].label
                        : "Review payment / policy"}
                    </strong>
                    <small>Current policy baseline</small>
                  </div>
                  <span className="comparison-arrow">
                    <ArrowRight size={21} />
                  </span>
                  <div>
                    <span className="eyebrow">WITH RECALLED EXPERIENCE</span>
                    <strong>
                      {rec.decision.chosen
                        ? remedies[rec.decision.chosen].label
                        : "Review payment / policy"}
                    </strong>
                    <small>
                      {rec.decision.evidence.length} eligible confirmed attempts
                      recalled
                    </small>
                  </div>
                </div>
                <p>{rec.explanation.memoryDifference}</p>
                <div className="evidence-actions">
                  <button
                    className="button secondary"
                    disabled={pending || comparing || !current}
                    onClick={async () => {
                      setComparing(true);
                      setComparisonError("");
                      try {
                        setComparison(
                          await api<Comparison>(`cases/${id}/comparison`),
                        );
                      } catch (error) {
                        setComparisonError((error as Error).message);
                      } finally {
                        setComparing(false);
                      }
                    }}
                  >
                    Compare with memory disabled
                  </button>
                  <Link
                    className="text-link"
                    href={`/workspace/evidence?case=${id}`}
                  >
                    Inspect decision evidence <ArrowUpRight size={13} />
                  </Link>
                </div>
                {comparisonError && <ErrorBox>{comparisonError}</ErrorBox>}
                {comparison && comparison.recommendationId === rec.id && (
                  <div
                    className="comparison-results"
                    tabIndex={0}
                    role="region"
                    aria-label="Recommendation comparison table"
                  >
                    <p>{comparison.scope}</p>
                    <table>
                      <caption>
                        Same payment, policy v{comparison.policyVersion}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Eligible remedy</th>
                          <th scope="col">Memory disabled</th>
                          <th scope="col">Memory enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.memory.scores.map((score) => (
                          <tr key={score.remedy}>
                            <th scope="row">{remedies[score.remedy].label}</th>
                            <td>0.50 · 0 examples</td>
                            <td>
                              {score.score.toFixed(2)} · {score.successes}{" "}
                              resolved / {score.failures} failed
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p>{comparison.difference}</p>
                    <small>
                      Scores are smoothed estimates, not calibrated confidence.
                      A tie uses the same fixed remedy priority.
                    </small>
                  </div>
                )}
                <div className="source-line">
                  <Layers size={13} />
                  {rec.recallSource === "walrus-recall"
                    ? "Fresh Walrus recall"
                    : rec.recallSource === "sample-memory"
                      ? "Sample memory provider · persisted in PostgreSQL"
                      : "No fresh provider evidence"}
                  <span>·</span>
                  {date(rec.createdAt)}
                </div>
              </>
            ) : (
              <div className="impact-empty">
                <p>
                  First, verify the payment. Then retrieve prior experience to
                  compare the default fix with the learned choice.
                </p>
                <span>
                  <ShieldCheck size={15} /> Check payment{" "}
                  <ArrowRight size={14} /> <Layers size={15} /> Recall outcomes{" "}
                  <ArrowRight size={14} /> Choose next action
                </span>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <Sparkles size={17} /> Recommended next step
              </h2>
              <button
                className="text-button"
                disabled={pending}
                onClick={() => act("recommend")}
              >
                <RefreshCw size={14} />
                {busy === "recommend"
                  ? "Recalling…"
                  : rec
                    ? "Fresh recommendation"
                    : "Generate recommendation"}
              </button>
            </div>
            {rec ? (
              <div className="recommendation-content">
                {rec.providerError && <ErrorBox>{rec.providerError}</ErrorBox>}
                <div className="recommendation-title">
                  <span className="remedy-icon">
                    <Link2 size={23} />
                  </span>
                  <div>
                    <h3>
                      {rec.decision.chosen
                        ? remedies[rec.decision.chosen].label
                        : "More evidence needed"}
                    </h3>
                    <p>
                      Policy v{rec.decision.policyVersion} <span>·</span>{" "}
                      {rec.provider === "sample-template-v1"
                        ? "Sample recommendation adapter"
                        : rec.provider}
                    </p>
                  </div>
                  {current ? (
                    <Badge value="eligible">Current</Badge>
                  ) : (
                    <Badge value="pending">Refresh needed</Badge>
                  )}
                </div>
                <p>{rec.explanation.operatorExplanation}</p>
                {rec.decision.scores.length > 0 && (
                  <div className="score-list">
                    {rec.decision.scores.map((score) => (
                      <div key={score.remedy}>
                        <div>
                          <span>{remedies[score.remedy].label}</span>
                          <small>
                            {score.successes} resolved · {score.failures} failed
                          </small>
                        </div>
                        <div className="score-track">
                          <span style={{ width: `${score.score * 100}%` }} />
                        </div>
                        <strong>{score.score.toFixed(2)}</strong>
                      </div>
                    ))}
                    <p className="helper">
                      Smoothed estimate = (resolved + 1) / (resolved + failed +
                      2). This is a heuristic, not a confidence percentage.
                    </p>
                  </div>
                )}
                <div className="citations">
                  <span>Recalled evidence</span>
                  {rec.decision.evidence.length ? (
                    rec.decision.evidence.slice(0, 8).map((e) => (
                      <Link
                        href={`/workspace/memory?event=${e.event.logicalEventId}`}
                        key={e.event.logicalEventId}
                      >
                        <Layers size={12} />
                        {e.event.caseRef}
                        <ArrowUpRight size={11} />
                      </Link>
                    ))
                  ) : (
                    <small>No eligible recalled evidence.</small>
                  )}
                  {rec.decision.evidence.length > 8 && (
                    <Link href="/workspace/memory">
                      +{rec.decision.evidence.length - 8} more
                    </Link>
                  )}
                </div>
                <details className="draft">
                  <summary>
                    Customer response draft <span>Review before sending</span>
                  </summary>
                  <p>{rec.explanation.customerDraft}</p>
                  <small>This draft is not sent automatically.</small>
                </details>
                <div className="action-row">
                  <button
                    className="button primary"
                    disabled={
                      pending ||
                      !current ||
                      !rec.decision.chosen ||
                      !!(attempt && !attempt.outcome)
                    }
                    onClick={() => act("approve", { recommendationId: rec.id })}
                  >
                    <Check size={16} /> Approve action
                  </button>
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() => act("reject")}
                  >
                    Reject suggestion
                  </button>
                  <button
                    className="text-button"
                    disabled={pending}
                    onClick={() => act("request_evidence")}
                  >
                    Request more evidence
                  </button>
                </div>
              </div>
            ) : (
              <Empty
                title="Ready when the evidence is"
                icon={<Sparkles size={26} />}
              >
                Generate a recommendation to retrieve relevant experience and
                apply your current policy.
              </Empty>
            )}
          </section>
          <section className="panel conversation">
            <div className="panel-heading">
              <h2>
                <MessageSquare size={17} /> Conversation & activity
              </h2>
              <span className="muted small">
                {detail.messages.length} message
                {detail.messages.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="messages">
              {detail.messages.map((m) => (
                <div className={`message ${m.role}`} key={m.id}>
                  <span className="message-avatar">
                    {m.role === "customer" ? customer.label[0] : "Y"}
                  </span>
                  <div>
                    <div className="message-meta">
                      <strong>
                        {m.role === "customer"
                          ? customer.label
                          : "Operator note"}
                      </strong>
                      <span>{date(m.createdAt)}</span>
                    </div>
                    <p>{m.body}</p>
                    {m.role === "customer" && (
                      <small>
                        Customer content does not authorize policy changes or
                        outcomes.
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form
              className="note-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                if (await act("message", { body: f.get("body") })) form.reset();
              }}
            >
              <textarea
                name="body"
                placeholder="Add an internal note…"
                aria-label="Internal note"
                maxLength={4000}
                required
                rows={2}
              />
              <button className="button secondary" disabled={pending}>
                Add note <ArrowRight size={14} />
              </button>
            </form>
          </section>
        </div>
        <aside className="case-aside">
          <section className="panel payment-panel">
            <div className="panel-heading">
              <h2>
                <ShieldCheck size={17} /> Payment evidence
              </h2>
            </div>
            <div className="panel-body">
              <Badge value={payment?.state ?? "pending"}>
                {payment ? label(payment.state) : "Not checked"}
              </Badge>
              <p>
                {payment?.message ??
                  "Check the supplied receipt against the order before approving an access action."}
              </p>
              <dl>
                <div>
                  <dt>Expected amount</dt>
                  <dd>
                    {order.amount} <small>base units</small>
                  </dd>
                </div>
                <div>
                  <dt>Asset</dt>
                  <dd className="mono break">{order.coinType}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd className="mono break">{order.recipient}</dd>
                </div>
                <div>
                  <dt>Buyer association</dt>
                  <dd>
                    {order.expectedPayer
                      ? "Pre-associated payer"
                      : "Needs review"}
                  </dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>
                    {order.network === "sample"
                      ? "Simulated network"
                      : order.network}
                  </dd>
                </div>
              </dl>
              <label className="field-label">
                Transaction digest
                <input
                  aria-label="Transaction digest"
                  value={
                    digest ||
                    (mode === "demo"
                      ? `sample:${order.reference}`
                      : (payment?.digest ?? ""))
                  }
                  onChange={(e) => setDigest(e.target.value)}
                  placeholder="Paste the Sui transaction digest"
                />
              </label>
              <button
                className="button secondary full"
                disabled={pending}
                onClick={() =>
                  act("verify", {
                    digest:
                      digest ||
                      (mode === "demo"
                        ? `sample:${order.reference}`
                        : (payment?.digest ?? "")),
                  })
                }
              >
                {busy === "verify" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ShieldCheck size={16} />
                )}{" "}
                Check payment
              </button>
              {payment && (
                <div className="payment-source">
                  <span className="mono">{payment.code}</span>
                  <small>
                    {payment.provider === "sample-tatum"
                      ? "Simulated Tatum response"
                      : "Tatum Sui gRPC"}{" "}
                    · {date(payment.checkedAt)}
                  </small>
                  {payment.provider === "tatum-grpc" &&
                    payment.state === "verified" &&
                    /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(payment.digest) && (
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://suiscan.xyz/mainnet/tx/${encodeURIComponent(payment.digest)}`}
                      >
                        View verified transaction <ExternalLink size={12} />
                      </a>
                    )}
                </div>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <CheckCheck size={17} /> Action & outcome
              </h2>
            </div>
            <div className="panel-body">
              {attempt ? (
                <>
                  <div className="attempt-steps">
                    <div className="done">
                      <Check size={14} />
                      <span>
                        <strong>Approved</strong>
                        <small>
                          {remedies[attempt.remedy as RemedyId]?.label ??
                            attempt.remedy}
                        </small>
                      </span>
                    </div>
                    <div className={attempt.attemptedAt ? "done" : ""}>
                      {attempt.attemptedAt ? (
                        <Check size={14} />
                      ) : (
                        <CircleDot size={14} />
                      )}
                      <span>
                        <strong>
                          {attempt.attemptedAt
                            ? "Attempt recorded"
                            : "Awaiting attempt"}
                        </strong>
                        <small>
                          {attempt.attemptedAt
                            ? date(attempt.attemptedAt)
                            : "Approval does not execute an action"}
                        </small>
                      </span>
                    </div>
                    <div className={attempt.outcome ? "done" : ""}>
                      {attempt.outcome ? (
                        <Check size={14} />
                      ) : (
                        <CircleDot size={14} />
                      )}
                      <span>
                        <strong>
                          {attempt.outcome
                            ? label(attempt.outcome)
                            : "Outcome not confirmed"}
                        </strong>
                        <small>Only merchant confirmation teaches memory</small>
                      </span>
                    </div>
                  </div>
                  {!attempt.attemptedAt ? (
                    <button
                      className="button primary full"
                      disabled={pending}
                      onClick={() => act("attempt")}
                    >
                      {detail.productAccess?.supported &&
                      ["relink", "resend"].includes(attempt.remedy)
                        ? "Restore controlled product access"
                        : mode === "demo"
                          ? "Run sample action"
                          : "Confirm action was attempted"}
                    </button>
                  ) : !attempt.outcome ? (
                    <div className="outcome-controls">
                      <button
                        className="button primary"
                        disabled={pending}
                        onClick={() => act("outcome", { outcome: "resolved" })}
                      >
                        <Check size={15} /> Resolved
                      </button>
                      <button
                        className="button secondary"
                        disabled={pending}
                        onClick={() => act("outcome", { outcome: "failed" })}
                      >
                        <X size={15} /> Failed
                      </button>
                    </div>
                  ) : attempt.outcome === "resolved" ? (
                    <button
                      className="button secondary full"
                      disabled={pending}
                      onClick={() => act("reopen")}
                    >
                      <RefreshCw size={14} /> Reopen case
                    </button>
                  ) : (
                    <p className="helper">
                      The failed outcome is queued for memory. Generate a fresh
                      recommendation to choose the next attempt.
                    </p>
                  )}
                  {attempt.fulfillment && (
                    <p className="helper">{attempt.fulfillment}</p>
                  )}
                  {detail.productAccess?.supported && (
                    <p className="helper">
                      Controlled product:{" "}
                      {detail.productAccess.active
                        ? "access is active"
                        : "access is missing"}
                      . The customer can check their protected download on the
                      support page. The merchant still confirms whether this
                      resolved the issue.
                    </p>
                  )}
                  <Link className="text-link" href="/workspace/memory">
                    Inspect outcome & write status <ArrowRight size={13} />
                  </Link>
                  {attempt.outcome && (
                    <button
                      className="button secondary full"
                      disabled={pending}
                      onClick={async () => {
                        const created = await run("create_case", {
                          orderId: order.id,
                          title: `Follow-up: ${ticket.title}`.slice(0, 160),
                          issue: ticket.issue,
                          message:
                            "Comparable follow-up request for the same paid order. Review newly confirmed outcomes before choosing the next remedy.",
                        });
                        if (created?.id)
                          router.push(`/workspace/cases/${created.id}`);
                      }}
                    >
                      Open a comparable case
                    </button>
                  )}
                </>
              ) : (
                <p className="muted">
                  No action approved yet. Review a recommendation, then record
                  what was attempted and how it went.
                </p>
              )}
            </div>
          </section>
          <section className="policy-card">
            <div>
              <ShieldCheck size={16} />
              <h3>Current policy</h3>
              <span>v{policy.version}</span>
            </div>
            <p>{policy.config.summary}</p>
            <small>
              Effective {date(policy.effectiveAt)}
              <br />
              Product version: {policy.config.productVersion}
            </small>
            <Link href="/workspace/settings">
              Review policy <ArrowUpRight size={13} />
            </Link>
          </section>
          <button className="text-button refresh-workspace" onClick={refresh}>
            <RefreshCw size={13} /> Refresh persisted state
          </button>
        </aside>
      </div>
    </>
  );
}

function MemoryExplorer({ version }: { version: number }) {
  const { data, error } = useRemote<MemoryRow[]>("memories", version, 5000),
    params = useSearchParams();
  const [filter, setFilter] = useState("all"),
    [remedy, setRemedy] = useState("all"),
    [issue, setIssue] = useState("all");
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <Loading />;
  const selected = params.get("event"),
    rows = data.filter(
      (r) =>
        (!selected || r.event.id === selected) &&
        (filter === "all" || r.job.status === filter) &&
        (remedy === "all" || r.event.payload.remedy === remedy) &&
        (issue === "all" || r.event.payload.issue === issue),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EXPERIENCE, WITH A PAPER TRAIL</span>
          <h1>Learning timeline</h1>
          <p>What was tried. What happened. What the next case can learn.</p>
        </div>
        <span className="count-chip">
          <Layers size={16} />
          {data.length} logical memories
        </span>
      </div>
      <div className="memory-explainer">
        <Layers size={21} />
        <p>
          Only completed writes can be recalled. Corrections keep the original
          history visible and remove its contribution to future rankings. Sample
          records do not count as Mainnet storage.
        </p>
      </div>
      <div className="memory-toolbar">
        <div className="filters">
          <select
            aria-label="Filter write status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All write statuses</option>
            {[
              "queued",
              "accepted",
              "processing",
              "completed",
              "retrying",
              "failed",
              "uncertain",
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter remedy"
            value={remedy}
            onChange={(e) => setRemedy(e.target.value)}
          >
            <option value="all">All remedies</option>
            {Object.entries(remedies).map(([id, r]) => (
              <option value={id} key={id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter memory issue"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
          >
            <option value="all">All issues</option>
            <option value="access">Access</option>
            <option value="delivery">Delivery</option>
            <option value="session">Session</option>
          </select>
        </div>
        {selected && (
          <Link className="text-link" href="/workspace/memory">
            Clear evidence selection <X size={13} />
          </Link>
        )}
      </div>
      {rows.length ? (
        <div className="timeline">
          {rows.map(({ event, job }) => (
            <article
              className={`memory-card ${event.supersededBy ? "superseded" : ""}`}
              key={event.id}
              id={event.id}
            >
              <span className={`timeline-dot ${event.payload.outcome}`}>
                <Layers size={16} />
              </span>
              <div className="memory-card-heading">
                <div>
                  <Link href={`/workspace/cases/${event.caseId}`}>
                    {event.payload.caseRef} <ArrowUpRight size={12} />
                  </Link>
                  <span>·</span>
                  <span>{event.payload.productVersion}</span>
                  <span>·</span>
                  <span>Policy v{event.payload.policyVersion}</span>
                </div>
                <Badge value={job.status} />
              </div>
              <h3>
                {remedies[event.payload.remedy].label}
                <Badge
                  value={
                    event.supersededBy ? "superseded" : event.payload.outcome
                  }
                />
              </h3>
              <p>
                {event.supersededBy
                  ? "This outcome was corrected. It is preserved for the audit trail and excluded from ranking."
                  : event.payload.outcome === "resolved"
                    ? "The merchant confirmed this attempt resolved the issue."
                    : "The merchant confirmed this attempt did not resolve the issue. Future matching cases can avoid repeating it."}
              </p>
              {event.payload.supersedesEventId && (
                <p className="correction">
                  <RefreshCw size={13} /> Corrects an earlier outcome from the
                  same attempt.
                </p>
              )}
              <div className="memory-meta">
                <span>
                  {event.payload.provenance === "synthetic-demo"
                    ? "Synthetic case · sample storage"
                    : event.payload.provenance === "synthetic-mainnet"
                      ? "Synthetic case · real Mainnet storage only when completed"
                      : "Live case"}
                </span>
                <span>Observed {date(event.payload.observedAt)}</span>
                <span>Completed {date(job.completedAt)}</span>
              </div>
              {job.error && <ErrorBox>{job.error}</ErrorBox>}
              <details
                className="developer-details"
                open={selected === event.id}
              >
                <summary>Evidence & developer details</summary>
                <dl>
                  <div>
                    <dt>Logical event</dt>
                    <dd>{event.id}</dd>
                  </div>
                  <div>
                    <dt>Job status</dt>
                    <dd>{job.status}</dd>
                  </div>
                  <div>
                    <dt>Provider job</dt>
                    <dd>{job.providerJobId ?? "Not accepted yet"}</dd>
                  </div>
                  <div>
                    <dt>Blob reference</dt>
                    <dd>{job.providerMemoryId ?? "Not completed yet"}</dd>
                  </div>
                  <div>
                    <dt>Source attempt</dt>
                    <dd>{event.attemptId}</dd>
                  </div>
                  <div>
                    <dt>Superseded by</dt>
                    <dd>{event.supersededBy ?? "Current outcome"}</dd>
                  </div>
                </dl>
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No memories in this view">
          Confirm a case outcome to queue a memory, or change your filters.
        </Empty>
      )}
    </>
  );
}

function JudgeEvidence({ ws, version }: { ws: Workspace; version: number }) {
  const router = useRouter(),
    params = useSearchParams();
  const caseId = params.get("case") ?? ws.cases[0]?.ticket.id;
  const { data, error } = useRemote<EvidenceReport>(
    caseId ? `evidence?case=${encodeURIComponent(caseId)}` : "health",
    version,
    5000,
  );
  if (!caseId)
    return (
      <Empty title="No evidence yet">
        Create a case to inspect its payment, recall and outcome evidence.
      </Empty>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE CASE, TRACEABLE DECISIONS</span>
          <h1>Judge evidence</h1>
          <p>Inspect provider provenance and export a redacted record.</p>
        </div>
        <a
          className="button secondary"
          href={`/api/evidence?case=${encodeURIComponent(caseId)}&download=1`}
        >
          <ArrowDown size={16} /> Export redacted JSON
        </a>
      </div>
      <label className="evidence-case-picker">
        Case
        <select
          value={caseId}
          onChange={(e) =>
            router.replace(`/workspace/evidence?case=${e.target.value}`)
          }
        >
          {ws.cases.map(({ ticket }) => (
            <option key={ticket.id} value={ticket.id}>
              {ticket.reference} · {ticket.title}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <ErrorBox>{error}</ErrorBox>
      ) : !data?.case ? (
        <Loading />
      ) : (
        <>
          <div className="memory-explainer">
            <ShieldCheck size={22} />
            <p>
              {data.labels.join(" · ")}. This view reads the same stored
              evidence used by the workspace.
            </p>
          </div>
          <div className="evidence-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>Payment</h2>
                {data.payment && <Badge value={data.payment.state} />}
              </div>
              <div className="panel-body">
                {data.payment ? (
                  <>
                    <dl>
                      <div>
                        <dt>Provider / network</dt>
                        <dd>
                          {data.payment.provider} / {data.payment.network}
                        </dd>
                      </div>
                      <div>
                        <dt>Verified or checked at</dt>
                        <dd>{date(data.payment.checkedAt)}</dd>
                      </div>
                      <div>
                        <dt>Transaction reference</dt>
                        <dd className="mono break">{data.payment.digest}</dd>
                      </div>
                      <div>
                        <dt>Result</dt>
                        <dd>{data.payment.code}</dd>
                      </div>
                    </dl>
                    <p>{data.payment.checkNote}</p>
                    <ul>
                      {data.payment.passedChecks.map((check) => (
                        <li key={check}>{check}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>No payment check recorded.</p>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Recall & decision</h2>
              </div>
              <div className="panel-body">
                {data.decision && data.recall ? (
                  <>
                    <dl>
                      <div>
                        <dt>Recall source</dt>
                        <dd>{data.recall.source}</dd>
                      </div>
                      <div>
                        <dt>Snapshot time</dt>
                        <dd>{date(data.recall.snapshotAt)}</dd>
                      </div>
                      <div>
                        <dt>Current / recorded policy</dt>
                        <dd>
                          v{data.decision.currentPolicyVersion} / v
                          {data.decision.recordedPolicyVersion}
                        </dd>
                      </div>
                      <div>
                        <dt>Snapshot</dt>
                        <dd>
                          {data.decision.current
                            ? "Current"
                            : "Refresh required"}
                        </dd>
                      </div>
                      <div>
                        <dt>Selected remedy</dt>
                        <dd>
                          {data.decision.selected
                            ? remedies[data.decision.selected].label
                            : "Escalate / obtain evidence"}
                        </dd>
                      </div>
                      <div>
                        <dt>Explanation provider</dt>
                        <dd>{data.decision.explanationProvider}</dd>
                      </div>
                    </dl>
                    <p>{data.decision.explanation.memoryDifference}</p>
                    {data.decision.providerError && (
                      <ErrorBox>{data.decision.providerError}</ErrorBox>
                    )}
                    <ul>
                      {data.decision.scores.map((score) => (
                        <li key={score.remedy}>
                          {remedies[score.remedy].label}:{" "}
                          {score.score.toFixed(2)} ({score.successes} resolved,{" "}
                          {score.failures} failed)
                        </li>
                      ))}
                    </ul>
                    <p className="helper">{data.recall.limitation}</p>
                  </>
                ) : (
                  <p>No recommendation recorded.</p>
                )}
                <Link className="text-link" href={`/workspace/cases/${caseId}`}>
                  Open case workspace <ArrowRight size={14} />
                </Link>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>Memory writes & citations</h2>
              <span>
                {data.memoryWrites.filter((w) => w.realMainnetCompleted).length}{" "}
                completed Mainnet records in this view
              </span>
            </div>
            <div className="panel-body">
              {data.memoryWrites.length ? (
                data.memoryWrites.map((write) => (
                  <details
                    className="evidence-record"
                    key={write.logicalEventId}
                  >
                    <summary>
                      {write.sourceCase} · {remedies[write.remedy].label} ·{" "}
                      {write.outcome} · {write.status}
                      {write.usedInDecision ? " · used in decision" : ""}
                    </summary>
                    <dl>
                      <div>
                        <dt>Logical event</dt>
                        <dd className="mono break">{write.logicalEventId}</dd>
                      </div>
                      <div>
                        <dt>Provenance</dt>
                        <dd>{write.provenance}</dd>
                      </div>
                      <div>
                        <dt>Completion time</dt>
                        <dd>{date(write.completedAt)}</dd>
                      </div>
                      <div>
                        <dt>Provider job</dt>
                        <dd className="mono break">
                          {write.providerJobId ?? "Pending acceptance"}
                        </dd>
                      </div>
                      <div>
                        <dt>Storage reference</dt>
                        <dd className="mono break">
                          {write.storageReference ?? "Pending completion"}
                        </dd>
                      </div>
                      <div>
                        <dt>Correction</dt>
                        <dd>
                          {write.supersededBy
                            ? "Superseded; excluded from future ranking"
                            : "Current outcome"}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      className="text-link"
                      href={`/workspace/memory?event=${write.logicalEventId}`}
                    >
                      Inspect memory
                    </Link>
                  </details>
                ))
              ) : (
                <p>No outcome or recalled memory is linked to this case yet.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Evaluation</h2>
              <Link className="text-link" href="/workspace/evaluation">
                Run or inspect evaluation <ArrowRight size={14} />
              </Link>
            </div>
            <div className="panel-body">
              {data.evaluation ? (
                <>
                  <p>
                    Dataset {data.evaluation.datasetVersion} ·{" "}
                    {date(data.evaluation.createdAt)}
                  </p>
                  <details>
                    <summary>
                      Measured results, provider mode and failures
                    </summary>
                    <pre>{JSON.stringify(data.evaluation.report, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p>No evaluation has been run in this workspace.</p>
              )}
              <p className="helper">{data.redaction}</p>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Evaluation({
  version,
  busy,
  run,
}: {
  version: number;
  busy: string;
  run: () => Promise<unknown>;
}) {
  const { data, error } = useRemote<EvalRun[]>("evaluations", version);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  const report = data?.[0]?.report as Report | undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE THE DIFFERENCE MEASURABLE</span>
          <h1>Evaluation</h1>
          <p>
            The same policy and payment rules. One difference: prior experience.
          </p>
        </div>
        <button className="button primary" onClick={run} disabled={!!busy}>
          {busy === "evaluation" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <FlaskConical size={16} />
          )}{" "}
          Run evaluation
        </button>
      </div>
      {!data ? (
        <Loading />
      ) : !report ? (
        <section className="panel">
          <Empty
            title="No evaluation has been run"
            icon={<ChartNoAxesCombined size={30} />}
          >
            Run the versioned held-out dataset to measure baseline and
            memory-enabled decisions. Results will appear here with their
            evidence.
          </Empty>
        </section>
      ) : (
        <>
          <div className="eval-banner">
            <FlaskConical size={18} />
            <span>
              Synthetic evaluation · {report.heldoutCount} held-out cases ·{" "}
              {report.trials} deterministic trial · {report.model}
            </span>
          </div>
          <div className="evaluation-stats">
            <div className="panel">
              <small>Correct action / escalation</small>
              <div>
                <span>
                  {report.baselineCorrect}
                  <small>/{report.heldoutCount}</small>
                </span>
                <ArrowRight size={20} />
                <strong>
                  {report.memoryCorrect}
                  <small>/{report.heldoutCount}</small>
                </strong>
              </div>
              <p>
                Baseline <span>→</span> Memory-enabled
              </p>
            </div>
            <div className="panel">
              <small>Repeated failed remedies</small>
              <div>
                <span>{report.baselineRepeatsFailed}</span>
                <ArrowRight size={20} />
                <strong>{report.memoryRepeatsFailed}</strong>
              </div>
              <p>In matching retrieved contexts</p>
            </div>
            <div className="panel">
              <small>Invalid approvals / citations</small>
              <div>
                <strong>
                  {report.unsupportedApprovals} / {report.invalidCitations}
                </strong>
                <ShieldCheck size={25} />
              </div>
              <p>Deterministic safety checks</p>
            </div>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>Held-out decisions</h2>
              <span className="small muted">{date(report.runAt)}</span>
            </div>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Decision results table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Test case</th>
                    <th>Expected</th>
                    <th>Baseline</th>
                    <th>With memory</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.id}</strong>
                        <small className="block">{row.title}</small>
                      </td>
                      <td>
                        {row.expected
                          ? remedies[row.expected].label
                          : "Review / escalate"}
                      </td>
                      <td className={row.baselineCorrect ? "" : "muted"}>
                        {row.baseline
                          ? remedies[row.baseline].label
                          : "Review / escalate"}
                      </td>
                      <td>
                        {row.memory
                          ? remedies[row.memory].label
                          : "Review / escalate"}
                      </td>
                      <td>
                        <Badge
                          value={row.memoryCorrect ? "resolved" : "failed"}
                        >
                          {row.memoryCorrect ? "Pass" : "Fail"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="eval-notes">
            <p>{report.limitations}</p>
            <dl>
              <div>
                <dt>Dataset</dt>
                <dd>{report.version}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd className="mono break">{report.datasetHash}</dd>
              </div>
              <div>
                <dt>Measured compute time</dt>
                <dd>
                  {report.latencyMs} ms · {report.providerFailures} provider
                  failures (no network calls)
                </dd>
              </div>
            </dl>
            <details className="developer-details">
              <summary>Redacted per-case traces</summary>
              <pre>{JSON.stringify(report.rows, null, 2)}</pre>
            </details>
          </div>
        </>
      )}
    </>
  );
}

function Settings({
  ws,
  version,
  busy,
  run,
  check,
  openOrder,
}: {
  ws: Workspace;
  version: number;
  busy: string;
  run: Run;
  check: () => Promise<unknown>;
  openOrder: () => void;
}) {
  const { data, error } = useRemote<Ready>("readiness", version, 10000),
    [token, setToken] = useState(""),
    [capId, setCapId] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KNOW WHAT’S CONNECTED</span>
          <h1>Integrations & policy</h1>
          <p>
            Provider readiness and merchant rules, without exposing credentials.
          </p>
        </div>
        <button className="button secondary" onClick={check} disabled={!!busy}>
          <RefreshCw size={15} />
          {busy === "checks" ? "Checking…" : "Check integrations"}
        </button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="integration-grid">
        {data?.providers.map((provider) => (
          <section className="panel integration-card" key={provider.provider}>
            <div className={`provider-logo ${provider.provider}`}>
              {provider.provider === "tatum" ? (
                <ShieldCheck size={24} />
              ) : provider.provider === "walrus" ? (
                <Layers size={24} />
              ) : (
                <Sparkles size={24} />
              )}
            </div>
            <div className="integration-heading">
              <h2>
                {provider.provider === "tatum"
                  ? "Tatum"
                  : provider.provider === "walrus"
                    ? "Walrus Memory"
                    : "Recommendation model"}
              </h2>
              <Badge value={provider.state} />
            </div>
            <p>{provider.message}</p>
            <small>Latest check: {date(provider.createdAt)}</small>
            <details className="developer-details">
              <summary>Setup & evidence</summary>
              <p>
                {provider.provider === "tatum"
                  ? "Server variables: TATUM_API_KEY, TATUM_SUI_GRPC_ENDPOINT. Node HTTP/2 gRPC, Mainnet only."
                  : provider.provider === "walrus"
                    ? "Server variables: MEMWAL_ACCOUNT_ID, MEMWAL_DELEGATE_KEY, MEMWAL_NAMESPACE, LIVE_MERCHANT_ID. One merchant-owned account with a dedicated delegate."
                    : "Server variables: LLM_PROVIDER=openai, LLM_MODEL, OPENAI_API_KEY. Model access and successful inference are checked separately."}
              </p>
              {provider.evidence && (
                <pre>{JSON.stringify(provider.evidence, null, 2)}</pre>
              )}
            </details>
          </section>
        ))}
      </div>
      {data && (
        <section className="panel readiness-panel">
          <div className="panel-heading">
            <h2>
              <CheckCheck size={17} /> Operational readiness
            </h2>
            <span className="small muted">
              Implementation ≠ live submission readiness
            </span>
          </div>
          <div className="readiness-grid">
            <div>
              <span>Database</span>
              <Badge value="connected">PostgreSQL connected</Badge>
            </div>
            <div>
              <span>Background worker</span>
              <Badge
                value={data.worker === "running" ? "connected" : "pending"}
              >
                {label(data.worker)}
              </Badge>
            </div>
            <div>
              <span>Completed Mainnet memories</span>
              <strong>
                {data.mainnetCount} <small>/ 10 required</small>
              </strong>
            </div>
            <div>
              <span>Mainnet write permission</span>
              <Badge
                value={data.mainnetWritesEnabled ? "connected" : "disconnected"}
              >
                {data.mainnetWritesEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div>
              <span>Live model inference</span>
              <Badge value={data.liveInference ? "connected" : "pending"}>
                {data.liveInference ? "Verified" : "Not verified"}
              </Badge>
            </div>
            <div>
              <span>Published deployment / repo / blog</span>
              <Badge value="pending">External review required</Badge>
            </div>
          </div>
          <p className="helper">
            Worker last seen: {date(data.workerLastSeen)}.{" "}
            {data.worker !== "running" &&
              "Start npm run worker in a separate terminal."}{" "}
            {data.jobCounts.map((c) => `${c.count} ${c.status}`).join(" · ")}
          </p>
        </section>
      )}
      <div className="settings-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <ShieldCheck size={17} /> Merchant policy
            </h2>
            <Badge value="current">Version {ws.policy?.version}</Badge>
          </div>
          <form
            className="form panel-body"
            key={ws.policy?.version}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run("policy", {
                allowed: f.getAll("allowed"),
                productVersion: f.get("productVersion"),
                summary: f.get("summary"),
              });
            }}
          >
            <p>
              Every recommendation and approval is checked against the latest
              effective policy.
            </p>
            <label>
              Product version
              <input
                name="productVersion"
                required
                defaultValue={ws.policy?.config.productVersion}
              />
            </label>
            <fieldset>
              <legend>Allowed remedies</legend>
              {Object.entries(remedies).map(([id, r]) => (
                <label className="checkbox" key={id}>
                  <input
                    type="checkbox"
                    name="allowed"
                    value={id}
                    defaultChecked={ws.policy?.config.allowed.includes(
                      id as RemedyId,
                    )}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>
            <label>
              Policy summary
              <textarea
                name="summary"
                maxLength={1000}
                rows={4}
                required
                defaultValue={ws.policy?.config.summary}
              />
            </label>
            <button className="button primary" disabled={!!busy}>
              Save a new policy version
            </button>
          </form>
        </section>
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <Link2 size={17} /> Orders & customer access
              </h2>
            </div>
            <div className="panel-body">
              <dl>
                <div>
                  <dt>Merchant recipient</dt>
                  <dd className="mono break">{ws.merchant.recipient}</dd>
                </div>
                <div>
                  <dt>Memory account</dt>
                  <dd className="mono break">
                    {ws.merchant.memoryAccountId ??
                      "Sample workspace — no onchain account"}
                  </dd>
                </div>
              </dl>
              <button className="button secondary full" onClick={openOrder}>
                <Plus size={16} /> Create order
              </button>
              <form
                className="form support-code-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    result = await run("support_access", {
                      orderId: f.get("orderId"),
                    });
                  if (result) {
                    setToken(String(result.token));
                    setCapId(String(result.id));
                  }
                }}
              >
                <label>
                  Issue a scoped support code
                  <select name="orderId">
                    {ws.orders
                      .filter((o) => !o.reference.startsWith("HISTORY"))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.reference}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="button secondary" disabled={!!busy}>
                  Generate 24-hour access code
                </button>
              </form>
              {token && (
                <div className="access-code">
                  <strong>Shown once. Share privately with the buyer.</strong>
                  <code>{token}</code>
                  <p>This code grants access only to the selected order.</p>
                  <Link className="text-link" href="/support" target="_blank">
                    Open customer support <ArrowUpRight size={14} />
                  </Link>
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      if (await run("revoke_access", { id: capId })) {
                        setToken("");
                        setCapId("");
                      }
                    }}
                  >
                    Revoke this code
                  </button>
                </div>
              )}
              <p className="helper">
                Customer access codes are hashed in the database. Customers need
                no wallet or Walrus account to request help.
              </p>
            </div>
          </section>
          <section className="privacy-note">
            <LockKeyhole size={20} />
            <h3>Memory has boundaries.</h3>
            <p>
              Only minimized, merchant-confirmed outcomes become experience. The
              standard Walrus relayer processes plaintext before encryption.
              Namespaces organize records; the application enforces access.
              Corrections do not erase remote history or data already read.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function Support({ mode }: { mode: Mode }) {
  const [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter(),
    params = useSearchParams(),
    selectedCase = params.get("case");
  const { data: ws } = useRemote<Workspace>("support/workspace", version, 5000);
  const access = !!ws?.orders;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!access) {
        await api("support/session", { token: f.get("token") });
        setVersion((v) => v + 1);
      } else {
        const response = await api<{ id: string }>("support/action", {
          action: "create_case",
          commandId: crypto.randomUUID(),
          data: {
            orderId: ws!.orders[0].id,
            title: f.get("title"),
            issue: f.get("issue"),
            message: f.get("message"),
          },
        });
        router.push(`/support?case=${response.id}`);
        setVersion((v) => v + 1);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="support-page">
      <header>
        <Link href="/">
          <Logo />
        </Link>
        <Badge value={mode === "demo" ? "sample" : "live"}>
          {mode === "demo" ? "Sample support page" : "Customer support"}
        </Badge>
      </header>
      <main>
        <span className="eyebrow">LET’S GET YOU BACK IN</span>
        <h1>
          A little help,
          <br />
          with all the context.
        </h1>
        <p>
          Use the support code your merchant provided. It connects your request
          to the right order without requiring a wallet or a new account.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        {access && <CustomerProduct version={version} />}
        {access && selectedCase ? (
          <CustomerCase
            id={selectedCase}
            version={version}
            refresh={() => setVersion((v) => v + 1)}
          />
        ) : (
          <form className="form panel" onSubmit={submit}>
            {!access ? (
              <>
                <label>
                  Private support access code
                  <input
                    name="token"
                    autoComplete="off"
                    required
                    minLength={40}
                    placeholder="Paste your merchant-issued code"
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Continue securely <ArrowRight size={16} />
                </button>
              </>
            ) : !ws?.orders ? (
              <Loading />
            ) : (
              <>
                <p>
                  Order <strong>{ws.orders[0]?.reference}</strong>
                </p>
                <label>
                  What do you need help with?
                  <input name="title" required minLength={3} maxLength={160} />
                </label>
                <label>
                  Issue
                  <select name="issue">
                    <option value="access">Product access</option>
                    <option value="delivery">Missing access link</option>
                    <option value="session">Browser session</option>
                  </select>
                </label>
                <label>
                  Tell us what happened
                  <textarea rows={5} name="message" maxLength={4000} required />
                </label>
                <button className="button primary" disabled={busy}>
                  Send support request <ArrowRight size={16} />
                </button>
              </>
            )}
          </form>
        )}
        {access && ws && ws.cases && ws.cases.length > 0 && (
          <section className="support-existing">
            <h2>Your requests</h2>
            {ws.cases.map((c) => (
              <div key={c.ticket.id}>
                <Link href={`/support?case=${c.ticket.id}`}>
                  <strong>{c.ticket.title}</strong>
                </Link>
                <Badge value={c.ticket.status} />
              </div>
            ))}
          </section>
        )}
        <small>
          <LockKeyhole size={13} /> Your access is limited to your order.
        </small>
      </main>
    </div>
  );
}

function CustomerProduct({ version }: { version: number }) {
  const { data, error } = useRemote<ProductAccess>(
    "support/product",
    version,
    3000,
  );
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <Loading />;
  return (
    <section className="panel customer-product">
      <div className="panel-heading">
        <h2>Your product access</h2>
        <Badge value={data.active ? "resolved" : "pending"}>
          {data.active ? "Access restored" : "Access missing"}
        </Badge>
      </div>
      <div className="panel-body">
        <strong>{data.productName}</strong>
        <p>{data.label}</p>
        {data.active && data.supported ? (
          <a
            className="button primary"
            href="/api/support/product/download"
            download
          >
            <ArrowDown size={16} /> Open protected product
          </a>
        ) : (
          <p>
            The merchant must verify your payment and approve an eligible access
            action before this product opens.
          </p>
        )}
        <small>
          Controlled RecallDesk product. Access is stored in the application; no
          outside account or refund is changed.
        </small>
      </div>
    </section>
  );
}

function CustomerCase({
  id,
  version,
  refresh,
}: {
  id: string;
  version: number;
  refresh: () => void;
}) {
  const { data, error } = useRemote<CustomerDetail>(
    `support/cases/${id}`,
    version,
    5000,
  );
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <Loading />;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{data.ticket.title}</h2>
        <Badge value={data.ticket.status} />
      </div>
      <div className="panel-body">
        <p>
          Your request is with the team. You can return using the same private
          access code.
        </p>
        {data.messages.map((message) => (
          <p key={message.id}>{message.body}</p>
        ))}
        {actionError && <ErrorBox>{actionError}</ErrorBox>}
        <form
          className="form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = new FormData(form).get("body");
            setBusy(true);
            setActionError("");
            try {
              await api("support/action", {
                action: "message",
                commandId: crypto.randomUUID(),
                caseId: id,
                revision: data.ticket.revision,
                data: { body },
              });
              form.reset();
              refresh();
            } catch (error) {
              setActionError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Add information
            <textarea name="body" required maxLength={4000} rows={3} />
          </label>
          <button className="button secondary" disabled={busy}>
            Send update
          </button>
        </form>
        <Link className="text-link" href="/support">
          Open another request <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

function Blog() {
  return (
    <article className="blog">
      <span className="eyebrow">FIELD NOTES / RECALLDESK</span>
      <h1>
        Support that remembers
        <br />
        what actually helped.
      </h1>
      <p className="blog-lead">
        A payment-aware support assistant is only useful if it can explain why
        this case deserves a different next step.
      </p>
      <div className="blog-meta">
        Engineering notes · November 2026 · Draft for team review
      </div>
      <h2>The problem is repetition.</h2>
      <p>
        A customer pays for digital access and still sees an upgrade screen. The
        default support script says to refresh the browser. They have already
        done that. Other customers with the same product version have too.
        RecallDesk makes the history of those attempts available to the next
        case.
      </p>
      <h2>Two sources, two different jobs.</h2>
      <p>
        Tatum supplies Sui transaction evidence. The server checks successful
        execution, direct-transfer structure, recipient, canonical asset,
        integer amount, time window, and the payer associated with the order. A
        database allocation prevents one receipt from being used for two orders.
      </p>
      <p>
        Walrus Memory stores minimized case experience after a merchant confirms
        an outcome. A durable database worker records acceptance, preserves the
        provider job ID, and waits for completion. In live mode, recommendations
        use evidence returned by the real recall path and validate it against
        the committed source events.
      </p>
      <div className="blog-flow">
        <span>Check payment</span>
        <ArrowRight size={17} />
        <span>Recall experience</span>
        <ArrowRight size={17} />
        <span>Apply policy</span>
        <ArrowRight size={17} />
        <span>Human decision</span>
      </div>
      <h2>Make memory’s effect visible.</h2>
      <p>
        The sample workspace includes failed refresh attempts and successful
        account relinks. The recommendation screen compares the current-policy
        baseline with the choice informed by recalled outcomes. Each cited
        example opens the source record. Scores use (resolved + 1) / (resolved +
        failed + 2), with stable tie-breaking and a minimum of two eligible
        examples before changing the baseline.
      </p>
      <p>
        When a case reopens, the old success is superseded by a failed outcome
        for that same attempt. It is never counted twice. Current policy can
        retire a formerly successful remedy, regardless of its historical score.
      </p>
      <h2>Measure the change, honestly.</h2>
      <p>
        The evaluation dashboard starts empty. Running the fixed held-out
        dataset produces per-case expected and actual decisions, citation
        checks, failed-remedy repetition, timestamps, and a dataset hash. Both
        variants use the same payment and policy rules. The only intended
        difference is access to training experience. This small synthetic
        experiment is not evidence of production accuracy.
      </p>
      <Link className="text-link" href="/workspace/evaluation">
        Inspect the measured evaluation <ArrowUpRight size={15} />
      </Link>
      <h2>What is real, and what remains external.</h2>
      <p>
        Demo mode uses real PostgreSQL persistence with simulated payment,
        memory, and recommendation providers. It does not claim Mainnet storage.
        Live adapters are implemented separately and fail visibly. Actual
        Mainnet reads, ten completed memories, fresh-session live recall, public
        hosting, and the published submission require credentials,
        authorization, and recorded evidence.
      </p>
      <h2>Trust, privacy, and limits.</h2>
      <p>
        The database owns authentication, current policy, orders and workflow
        state. Walrus carries learning evidence, not authoritative policy. Its
        standard relayer sees plaintext before encryption; namespaces are
        organizational rather than cryptographic access boundaries. Corrections
        preserve history. Recall can return an incomplete subset. The model
        explains a deterministic eligible action and cannot authorize payment,
        refunds, or memory completion.
      </p>
      <div className="blog-sources">
        <a
          href="https://docs.tatum.io/reference/sui-grpc"
          target="_blank"
          rel="noreferrer"
        >
          Tatum Sui gRPC <ExternalLink size={13} />
        </a>
        <a
          href="https://docs.wal.app/walrus-memory/sdk/production-readiness"
          target="_blank"
          rel="noreferrer"
        >
          Walrus storage lifecycle <ExternalLink size={13} />
        </a>
        <a
          href="https://recall-tatum-walrus.vercel.app/"
          target="_blank"
          rel="noreferrer"
        >
          Total Recall event <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}
