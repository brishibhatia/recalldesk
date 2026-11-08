import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  numeric,
  check,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  Decision,
  Explanation,
  MemoryEvent,
  PaymentResult,
  Policy,
} from "../core/types";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const merchant = () =>
  uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" });
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const session = pgTable("auth_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
export const account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const merchants = pgTable("merchants", {
  id: id(),
  name: text("name").notNull(),
  mode: text("mode", { enum: ["demo", "live"] }).notNull(),
  recipient: text("recipient").notNull(),
  memoryAccountId: text("memory_account_id"),
  memoryOwnerAddress: text("memory_owner_address"),
  namespace: text("namespace").notNull(),
  createdAt: created(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    merchantId: merchant(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("operator"),
  },
  (t) => [uniqueIndex("membership_unique").on(t.merchantId, t.userId)],
);
export const demoSessions = pgTable("demo_sessions", {
  id: id(),
  merchantId: merchant(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const products = pgTable(
  "products",
  {
    id: id(),
    merchantId: merchant(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    fulfillmentMode: text("fulfillment_mode", {
      enum: ["external", "controlled"],
    })
      .notNull()
      .default("external"),
  },
  (t) => [uniqueIndex("product_version_unique").on(t.merchantId, t.version)],
);
export const policies = pgTable(
  "policies",
  {
    id: id(),
    merchantId: merchant(),
    version: integer("version").notNull(),
    config: jsonb("config").$type<Policy>().notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("policy_version_unique").on(t.merchantId, t.version)],
);
export const customers = pgTable("customers", {
  id: id(),
  merchantId: merchant(),
  label: text("label").notNull(),
  createdAt: created(),
});
export const orders = pgTable(
  "orders",
  {
    id: id(),
    merchantId: merchant(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    reference: text("reference").notNull(),
    recipient: text("recipient").notNull(),
    expectedPayer: text("expected_payer"),
    coinType: text("coin_type").notNull(),
    amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
    decimals: integer("decimals").notNull(),
    network: text("network").notNull(),
    createdAt: created(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("order_ref_unique").on(t.merchantId, t.reference),
    check("order_positive_amount", sql`${t.amount} > 0`),
    check("order_decimals", sql`${t.decimals} between 0 and 30`),
  ],
);
export const supportAccess = pgTable("support_access", {
  id: id(),
  merchantId: merchant(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: created(),
});
export const cases = pgTable(
  "cases",
  {
    id: id(),
    merchantId: merchant(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    issue: text("issue", { enum: ["access", "delivery", "session"] }).notNull(),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    assignedTo: text("assigned_to").notNull().default("You"),
    revision: integer("revision").notNull().default(0),
    payment: jsonb("payment").$type<PaymentResult>(),
    demoScenario: text("demo_scenario"),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("case_ref_unique").on(t.merchantId, t.reference),
    index("case_tenant_updated").on(t.merchantId, t.updatedAt),
  ],
);
export const messages = pgTable("case_messages", {
  id: id(),
  merchantId: merchant(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  body: text("body").notNull(),
  createdAt: created(),
});
export const paymentChecks = pgTable("payment_checks", {
  id: id(),
  merchantId: merchant(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  result: jsonb("result").$type<PaymentResult>().notNull(),
  createdAt: created(),
});
export const allocations = pgTable(
  "payment_allocations",
  {
    id: id(),
    merchantId: merchant(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    network: text("network").notNull(),
    digest: text("digest").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("one_receipt_per_merchant").on(
      t.merchantId,
      t.network,
      t.digest,
    ),
    uniqueIndex("one_payment_per_order").on(t.orderId),
  ],
);
export const recommendations = pgTable("recommendations", {
  id: id(),
  merchantId: merchant(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  caseRevision: integer("case_revision").notNull(),
  decision: jsonb("decision").$type<Decision>().notNull(),
  explanation: jsonb("explanation").$type<Explanation>().notNull(),
  provider: text("provider").notNull(),
  providerError: text("provider_error"),
  recallSource: text("recall_source").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: created(),
});
export const attempts = pgTable(
  "remedy_attempts",
  {
    id: id(),
    merchantId: merchant(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    remedy: text("remedy").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: created(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    fulfillment: text("fulfillment"),
    outcome: text("outcome"),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [uniqueIndex("approval_once").on(t.recommendationId)],
);
export const entitlements = pgTable("product_entitlements", {
  id: id(),
  merchantId: merchant(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" })
    .unique(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  sourceAttemptId: uuid("source_attempt_id")
    .notNull()
    .references(() => attempts.id, { onDelete: "cascade" }),
  grantedAt: created(),
});
export const fulfillmentExecutions = pgTable("fulfillment_executions", {
  id: id(),
  merchantId: merchant(),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => attempts.id, { onDelete: "cascade" })
    .unique(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  effect: text("effect", { enum: ["granted", "already_active"] }).notNull(),
  createdAt: created(),
});
export const memories = pgTable(
  "memory_events",
  {
    id: id(),
    merchantId: merchant(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    revision: integer("revision").notNull(),
    payload: jsonb("payload").$type<MemoryEvent>().notNull(),
    text: text("text").notNull(),
    contentHash: text("content_hash").notNull(),
    supersededBy: uuid("superseded_by"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("attempt_revision_once").on(t.attemptId, t.revision)],
);
export const jobs = pgTable("memory_jobs", {
  id: id(),
  merchantId: merchant(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" })
    .unique(),
  status: text("status").notNull().default("queued"),
  providerJobId: text("provider_job_id"),
  providerMemoryId: text("provider_memory_id"),
  receipt: jsonb("receipt").$type<Record<string, unknown>>(),
  attempts: integer("attempts").notNull().default(0),
  nextRunAt: timestamp("next_run_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseToken: uuid("lease_token"),
  error: text("error"),
  createdAt: created(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
export const evaluations = pgTable("evaluation_runs", {
  id: id(),
  merchantId: merchant(),
  datasetVersion: text("dataset_version").notNull(),
  datasetHash: text("dataset_hash").notNull(),
  report: jsonb("report").$type<Record<string, unknown>>().notNull(),
  createdAt: created(),
});
export const auditEvents = pgTable("audit_events", {
  id: id(),
  merchantId: merchant(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  reference: text("reference").notNull(),
  createdAt: created(),
});
export const providerChecks = pgTable("provider_checks", {
  id: id(),
  merchantId: merchant(),
  provider: text("provider").notNull(),
  state: text("state").notNull(),
  message: text("message").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  createdAt: created(),
});
export const workerHeartbeats = pgTable("worker_heartbeats", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
export const authRateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const commands = pgTable("commands", {
  id: uuid("id").primaryKey(),
  merchantId: merchant(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: created(),
});
