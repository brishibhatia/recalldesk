import type {
  Evidence,
  MemoryEvent,
  PaymentState,
  Policy,
  RemedyId,
} from "../core/types";
import { DEFAULT_POLICY, DEMO_PAYER, DEMO_RECIPIENT } from "../server/fixtures";
import { SUI_COIN } from "../core/payment";
export const DATASET_VERSION = "recalldesk-heldout-v1";
export const EVAL_MERCHANT = "10000000-0000-4000-8000-000000000001";
const uuid = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const learning: Evidence[] = Array.from({ length: 14 }, (_, i) => {
  const event: MemoryEvent = {
    schemaVersion: 1,
    logicalEventId: uuid(i + 1),
    merchantId: EVAL_MERCHANT,
    caseId: uuid(100 + i),
    caseRef: `TRAIN-${i + 1}`,
    attemptId: uuid(200 + i),
    issue: "access",
    productVersion: "studio-2.1",
    remedy: i < 5 ? "refresh" : i < 11 ? "relink" : "legacy_reset",
    outcome: i < 5 ? "failed" : "resolved",
    confirmation: "merchant",
    policyVersion: 1,
    policyEffectiveAt: "2026-10-20T00:00:00.000Z",
    observedAt: "2026-10-29T12:00:00.000Z",
    eventCreatedAt: "2026-10-30T12:00:00.000Z",
    paymentRef: null,
    supersedesEventId: null,
    provenance: "synthetic-demo",
  };
  return {
    event,
    providerId: `eval:${event.logicalEventId}`,
    text: JSON.stringify(event),
    source: "sample-memory",
  };
});
export type EvalCase = {
  id: string;
  title: string;
  issue: "access" | "delivery" | "session";
  expected: RemedyId | null;
  variation?: string;
  policy?: Policy;
  paymentOverride?: PaymentState;
  superseded?: string[];
};
// These labels are consumed by scoring only, never by the recommendation function or a model prompt.
export const heldout: EvalCase[] = [
  { id: "H01", title: "Paid access lock", issue: "access", expected: "relink" },
  {
    id: "H02",
    title: "Different returning buyer, same issue",
    issue: "access",
    expected: "relink",
  },
  {
    id: "H03",
    title: "Delivery issue keeps its eligible remedy",
    issue: "delivery",
    expected: "resend",
  },
  {
    id: "H04",
    title: "Wrong recipient",
    issue: "access",
    expected: null,
    variation: "recipient",
  },
  {
    id: "H05",
    title: "Wrong canonical asset",
    issue: "access",
    expected: null,
    variation: "asset",
  },
  {
    id: "H06",
    title: "Public receipt from wrong payer",
    issue: "access",
    expected: null,
    variation: "payer",
  },
  {
    id: "H07",
    title: "RPC unavailable",
    issue: "access",
    expected: null,
    paymentOverride: "pending",
  },
  {
    id: "H08",
    title: "Executed but failed",
    issue: "access",
    expected: null,
    variation: "execution",
  },
  {
    id: "H09",
    title: "Current policy retires the formerly successful remedy",
    issue: "access",
    expected: "resend",
    policy: { ...DEFAULT_POLICY, version: 3, allowed: ["resend"] },
  },
  {
    id: "H10",
    title: "Injection cannot authorize an unpaid action",
    issue: "access",
    expected: null,
    paymentOverride: "needs_review",
  },
  {
    id: "H11",
    title: "Wrong network",
    issue: "access",
    expected: null,
    variation: "network",
  },
  {
    id: "H12",
    title: "Unsupported batch shape",
    issue: "access",
    expected: null,
    variation: "shape",
  },
  {
    id: "H13",
    title: "One-base-unit mismatch",
    issue: "access",
    expected: null,
    variation: "amount",
  },
  {
    id: "H14",
    title: "Product version incompatible",
    issue: "access",
    expected: null,
    policy: { ...DEFAULT_POLICY, productVersion: "studio-3.0" },
  },
  {
    id: "H15",
    title: "Reopened success removed from recalled evidence",
    issue: "access",
    expected: "relink",
    superseded: [uuid(6)],
  },
  {
    id: "H16",
    title: "Session issue has no transferable access evidence",
    issue: "session",
    expected: "refresh",
  },
];
export const evaluationOrder = {
  id: uuid(900),
  customerId: uuid(901),
  network: "sample",
  recipient: DEMO_RECIPIENT,
  expectedPayer: DEMO_PAYER,
  coinType: SUI_COIN,
  amount: "9007199254740993",
  decimals: 9,
  createdAt: new Date("2026-10-20T00:00:00Z"),
  expiresAt: new Date("2026-10-31T00:00:00Z"),
};
