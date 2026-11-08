import { and, desc, eq, lte } from "drizzle-orm";
import { db, type Tx } from "../db";
import * as s from "../db/schema";
import type { Principal } from "./auth";
import { AppError } from "./config";

/** This artifact belongs to RecallDesk's controlled pilot, never to an external merchant system. */
const controlledArtifact = `# Studio Plus — controlled pilot workbook

This downloadable product is served by RecallDesk after an authorized operator restores your order's local entitlement.

## Your first studio session

1. Write a one-sentence goal for your project.
2. Choose one customer problem to solve this week.
3. List the smallest deliverable that demonstrates your solution.
4. Record what you tried, what happened, and what you will change next.

## Weekly review template

- Goal:
- Work completed:
- Evidence collected:
- Next action:

This controlled pilot file is not an external product license or proof of payment by itself. Access is checked on every request against the authenticated order and the stored entitlement.
`;

export async function productAccess(p: Principal, orderId: string) {
  if (p.role === "customer" && p.orderId !== orderId)
    throw new AppError("NOT_FOUND", "Product order not found.", 404);
  const [row] = await db
    .select({
      order: s.orders,
      product: s.products,
      entitlement: s.entitlements,
    })
    .from(s.orders)
    .innerJoin(
      s.merchants,
      and(
        eq(s.merchants.id, s.orders.merchantId),
        eq(s.merchants.mode, p.mode),
      ),
    )
    .innerJoin(
      s.products,
      and(
        eq(s.products.id, s.orders.productId),
        eq(s.products.merchantId, p.merchantId),
      ),
    )
    .leftJoin(
      s.entitlements,
      and(
        eq(s.entitlements.orderId, s.orders.id),
        eq(s.entitlements.merchantId, p.merchantId),
        eq(s.entitlements.customerId, s.orders.customerId),
        eq(s.entitlements.productId, s.orders.productId),
      ),
    )
    .where(
      and(eq(s.orders.id, orderId), eq(s.orders.merchantId, p.merchantId)),
    );
  if (!row) throw new AppError("NOT_FOUND", "Product order not found.", 404);
  const supported = row.product.fulfillmentMode === "controlled";
  return {
    orderId: row.order.id,
    productName: row.product.name,
    productVersion: row.product.version,
    supported,
    active: supported && !!row.entitlement,
    grantedAt: row.entitlement?.grantedAt ?? null,
    sourceAttemptId: row.entitlement?.sourceAttemptId ?? null,
    label: supported
      ? "Controlled pilot product — access is enforced by RecallDesk's database."
      : "External product — fulfillment remains with the merchant's service.",
  };
}

export async function downloadProduct(p: Principal, orderId: string) {
  if (p.role !== "customer")
    throw new AppError(
      "CUSTOMER_REQUIRED",
      "Use your order's customer support session to download this product.",
      403,
    );
  const access = await productAccess(p, orderId);
  if (!access.supported)
    throw new AppError(
      "EXTERNAL_PRODUCT",
      "This product is delivered by the merchant's external service.",
      409,
    );
  if (!access.active)
    throw new AppError(
      "ACCESS_LOCKED",
      "Product access is locked. Your support operator can review your order and restore access.",
      403,
    );
  return {
    filename: "studio-plus-controlled-workbook.md",
    contentType: "text/markdown; charset=utf-8",
    content: controlledArtifact,
  };
}

/** Called within the existing tenant-locked command transaction: effect, attempt and command commit together. */
export async function fulfillApprovedAttempt(
  tx: Tx,
  p: Principal,
  attemptId: string,
) {
  if (p.role !== "operator")
    throw new AppError("FORBIDDEN", "Merchant approval is required.", 403);
  const [row] = await tx
    .select({
      attempt: s.attempts,
      ticket: s.cases,
      order: s.orders,
      product: s.products,
    })
    .from(s.attempts)
    .innerJoin(
      s.cases,
      and(
        eq(s.cases.id, s.attempts.caseId),
        eq(s.cases.merchantId, p.merchantId),
      ),
    )
    .innerJoin(
      s.orders,
      and(
        eq(s.orders.id, s.cases.orderId),
        eq(s.orders.merchantId, p.merchantId),
      ),
    )
    .innerJoin(
      s.products,
      and(
        eq(s.products.id, s.orders.productId),
        eq(s.products.merchantId, p.merchantId),
      ),
    )
    .innerJoin(
      s.merchants,
      and(
        eq(s.merchants.id, s.orders.merchantId),
        eq(s.merchants.mode, p.mode),
      ),
    )
    .where(
      and(
        eq(s.attempts.id, attemptId),
        eq(s.attempts.merchantId, p.merchantId),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND", "Approved attempt not found.", 404);
  const [policy] = await tx
    .select()
    .from(s.policies)
    .where(
      and(
        eq(s.policies.merchantId, p.merchantId),
        lte(s.policies.effectiveAt, new Date()),
      ),
    )
    .orderBy(desc(s.policies.version))
    .limit(1);
  const [allocation] = await tx
    .select()
    .from(s.allocations)
    .where(
      and(
        eq(s.allocations.merchantId, p.merchantId),
        eq(s.allocations.orderId, row.order.id),
      ),
    );
  const { attempt, ticket, order, product } = row;
  if (
    !policy ||
    !policy.config.allowed.some((remedy) => remedy === attempt.remedy) ||
    policy.config.productVersion !== product.version ||
    ticket.payment?.state !== "verified" ||
    !allocation ||
    allocation.digest !== ticket.payment.digest ||
    allocation.network !== order.network
  )
    throw new AppError(
      "INELIGIBLE",
      "Current policy and a verified payment allocated to this order are required.",
      409,
    );
  if (product.fulfillmentMode !== "controlled")
    return "Operator reports action performed in the merchant's external fulfillment system; RecallDesk did not modify external access";
  if (!["relink", "resend"].includes(attempt.remedy))
    return "Operator recorded the suggested browser action; local product access was unchanged";
  const [prior] = await tx
    .select()
    .from(s.fulfillmentExecutions)
    .where(
      and(
        eq(s.fulfillmentExecutions.merchantId, p.merchantId),
        eq(s.fulfillmentExecutions.attemptId, attempt.id),
      ),
    );
  if (prior)
    return prior.effect === "granted"
      ? "Controlled pilot product access restored in RecallDesk"
      : "Controlled pilot product access was already active; no duplicate entitlement created";
  const [granted] = await tx
    .insert(s.entitlements)
    .values({
      merchantId: p.merchantId,
      orderId: order.id,
      customerId: order.customerId,
      productId: product.id,
      sourceAttemptId: attempt.id,
    })
    .onConflictDoNothing({ target: s.entitlements.orderId })
    .returning();
  await tx
    .insert(s.fulfillmentExecutions)
    .values({
      merchantId: p.merchantId,
      attemptId: attempt.id,
      orderId: order.id,
      effect: granted ? "granted" : "already_active",
    });
  return granted
    ? "Controlled pilot product access restored in RecallDesk"
    : "Controlled pilot product access was already active; no duplicate entitlement created";
}
