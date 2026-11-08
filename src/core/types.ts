import { z } from "zod";

export const remedies = {
  refresh: {
    label: "Refresh browser session",
    description: "Sign out, refresh, then sign back in.",
    priority: 0,
    issues: ["access", "session"],
  },
  relink: {
    label: "Relink product access",
    description: "Reconcile the paid order with the customer's access account.",
    priority: 1,
    issues: ["access"],
  },
  resend: {
    label: "Resend access link",
    description: "Issue a replacement access link for the existing order.",
    priority: 2,
    issues: ["access", "delivery"],
  },
  legacy_reset: {
    label: "Reset legacy entitlement",
    description: "Retired remedy; excluded by the current policy.",
    priority: 3,
    issues: ["access"],
  },
} as const;
export const remedyIdSchema = z.enum([
  "refresh",
  "relink",
  "resend",
  "legacy_reset",
]);
export type RemedyId = z.infer<typeof remedyIdSchema>;
export const issueSchema = z.enum(["access", "delivery", "session"]);
export type Issue = z.infer<typeof issueSchema>;
export type Mode = "demo" | "live";
export const policySchema = z.object({
  version: z.number().int().positive(),
  allowed: z.array(remedyIdSchema).min(1),
  productVersion: z.string().min(1).max(40),
  summary: z.string().min(1).max(1000),
});
export type Policy = z.infer<typeof policySchema>;
export const memorySchema = z
  .object({
    schemaVersion: z.literal(1),
    logicalEventId: z.string().uuid(),
    merchantId: z.string().uuid(),
    caseId: z.string().uuid(),
    caseRef: z.string().max(50),
    attemptId: z.string().uuid(),
    issue: issueSchema,
    productVersion: z.string().max(40),
    remedy: remedyIdSchema,
    outcome: z.enum(["resolved", "failed"]),
    confirmation: z.literal("merchant"),
    policyVersion: z.number().int().positive(),
    policyEffectiveAt: z.string().datetime(),
    observedAt: z.string().datetime(),
    eventCreatedAt: z.string().datetime(),
    paymentRef: z.string().max(100).nullable(),
    supersedesEventId: z.string().uuid().nullable(),
    provenance: z.enum(["synthetic-demo", "synthetic-mainnet", "live"]),
  })
  .strict();
export type MemoryEvent = z.infer<typeof memorySchema>;
export type Evidence = {
  event: MemoryEvent;
  providerId: string;
  text: string;
  source: "sample-memory" | "walrus-recall";
};
export type PaymentState =
  "verified" | "mismatch" | "pending" | "failed" | "needs_review";
export type PaymentResult = {
  state: PaymentState;
  code: string;
  message: string;
  checkedAt: string;
  provider: "sample-tatum" | "tatum-grpc";
  digest: string;
  network?: string;
  recipient?: string;
  payer?: string;
  coinType?: string;
  amount?: string;
  checkpoint?: string;
  executedAt?: string;
  decimals?: number;
};
export type PaymentTransaction = {
  digest: string;
  network: string;
  success: boolean | undefined;
  checkpoint?: string;
  executedAt?: string;
  payer?: string;
  recipient?: string;
  coinType?: string;
  amount?: string;
  decimals?: number;
  supported: boolean;
};
export type PaymentOrder = {
  id: string;
  customerId: string;
  network: string;
  recipient: string;
  expectedPayer: string | null;
  coinType: string;
  amount: string;
  decimals: number;
  createdAt: Date;
  expiresAt: Date;
};
export const explanationSchema = z.object({
  remedyId: remedyIdSchema.nullable(),
  customerDraft: z.string(),
  operatorExplanation: z.string(),
  memoryIds: z.array(z.string()),
  policyVersion: z.number().int(),
  memoryDifference: z.string(),
  missingInformation: z.array(z.string()),
  escalationReason: z.string().nullable(),
});
export type Explanation = z.infer<typeof explanationSchema>;
export type Score = {
  remedy: RemedyId;
  successes: number;
  failures: number;
  score: number;
  evidenceIds: string[];
};
export type Decision = {
  baseline: RemedyId | null;
  chosen: RemedyId | null;
  scores: Score[];
  evidence: Evidence[];
  limitation: string;
  policyVersion: number;
};
