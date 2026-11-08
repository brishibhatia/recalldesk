import {
  isValidSuiAddress,
  normalizeSuiAddress,
  normalizeStructTag,
} from "@mysten/sui/utils";
import type { PaymentOrder, PaymentResult, PaymentTransaction } from "./types";
export function canonicalAddress(value: string) {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(value))
    throw new Error("Invalid Sui address");
  const result = normalizeSuiAddress(value);
  if (!isValidSuiAddress(result)) throw new Error("Invalid Sui address");
  return result;
}
export function canonicalCoin(value: string) {
  return normalizeStructTag(value);
}
export const SUI_COIN = canonicalCoin("0x2::sui::SUI");
export function verifyTransaction(
  order: PaymentOrder,
  tx: PaymentTransaction,
  buyerId: string,
  provider: PaymentResult["provider"],
): PaymentResult {
  const base = {
    checkedAt: new Date().toISOString(),
    provider,
    digest: tx.digest,
    network: tx.network,
    checkpoint: tx.checkpoint,
    executedAt: tx.executedAt,
    recipient: tx.recipient,
    payer: tx.payer,
    coinType: tx.coinType,
    amount: tx.amount,
    decimals: tx.decimals,
  };
  const result = (
    state: PaymentResult["state"],
    code: string,
    message: string,
  ): PaymentResult => ({ ...base, state, code, message });
  if (tx.network !== order.network)
    return result(
      "mismatch",
      "NETWORK_MISMATCH",
      "This payment is on a different network.",
    );
  if (tx.success === false)
    return result(
      "failed",
      "EXECUTION_FAILED",
      "The transaction executed unsuccessfully; no payment is verified.",
    );
  if (tx.success !== true || !tx.checkpoint)
    return result(
      "pending",
      "UNCONFIRMED",
      "Successful execution and checkpoint evidence are still required.",
    );
  if (buyerId !== order.customerId || !order.expectedPayer)
    return result(
      "needs_review",
      "BUYER_UNBOUND",
      "A receipt alone does not identify its buyer. Confirm the order's pre-associated payer.",
    );
  if (
    !tx.payer ||
    canonicalAddress(tx.payer) !== canonicalAddress(order.expectedPayer)
  )
    return result(
      "needs_review",
      "PAYER_MISMATCH",
      "The transaction sender does not match this order's pre-associated buyer.",
    );
  if (!tx.supported || !tx.recipient || !tx.coinType || !tx.amount)
    return result(
      "needs_review",
      "UNSUPPORTED_SHAPE",
      "This transaction is outside the supported single direct-transfer flow.",
    );
  if (canonicalAddress(tx.recipient) !== canonicalAddress(order.recipient))
    return result(
      "mismatch",
      "RECIPIENT_MISMATCH",
      "The payment went to a different recipient.",
    );
  if (canonicalCoin(tx.coinType) !== canonicalCoin(order.coinType))
    return result(
      "mismatch",
      "ASSET_MISMATCH",
      "The payment used a different canonical coin type.",
    );
  if (!/^\d+$/.test(tx.amount) || BigInt(tx.amount) !== BigInt(order.amount))
    return result(
      "mismatch",
      "AMOUNT_MISMATCH",
      "The amount does not match the invoice's exact base-unit amount.",
    );
  if (tx.decimals !== order.decimals)
    return result(
      "needs_review",
      "DECIMALS_UNVERIFIED",
      "The asset decimals could not be matched to the configured invoice.",
    );
  const timestamp = Date.parse(tx.executedAt ?? "");
  if (
    !Number.isFinite(timestamp) ||
    timestamp < order.createdAt.getTime() ||
    timestamp > order.expiresAt.getTime() ||
    timestamp > Date.now() + 60000
  )
    return result(
      "needs_review",
      "TIME_WINDOW",
      "The payment does not fall within the order's supported time window.",
    );
  return result(
    "verified",
    "VERIFIED",
    "Successful direct payment matches the order, recipient, asset, amount and pre-associated buyer.",
  );
}
