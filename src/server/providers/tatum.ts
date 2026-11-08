import { credentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { SuiGrpcClient, GrpcTypes } from "@mysten/sui/grpc";
import { isValidTransactionDigest } from "@mysten/sui/utils";
import {
  canonicalAddress,
  canonicalCoin,
  verifyTransaction,
} from "../../core/payment";
import type {
  PaymentOrder,
  PaymentResult,
  PaymentTransaction,
} from "../../core/types";
import { required } from "../config";

export function tatumClient() {
  const endpoint =
    process.env.TATUM_SUI_GRPC_ENDPOINT ??
    "sui-mainnet-grpc.gateway.tatum.io:443";
  if (endpoint !== "sui-mainnet-grpc.gateway.tatum.io:443")
    throw new Error("Only the documented Tatum Mainnet gateway is supported");
  if ((process.env.SUI_NETWORK ?? "mainnet") !== "mainnet")
    throw new Error("Live adapter supports Mainnet only");
  const transport = new GrpcTransport({
    host: endpoint,
    channelCredentials: credentials.createSsl(),
    meta: { "x-api-key": required("TATUM_API_KEY") },
    timeout: 10000,
  });
  return {
    client: new SuiGrpcClient({ network: "mainnet", transport }),
    close: () => transport.close(),
  };
}

// Intentionally narrow: SplitCoins(one amount) -> TransferObjects(one split result).
// No Move calls, batches, swaps, arbitrary object transfers, sponsor or exchange inference.
export function decodeDirectTransfer(
  tx: GrpcTypes.ExecutedTransaction,
  network: string,
  decimals?: number,
): PaymentTransaction {
  const base: PaymentTransaction = {
    digest: tx.digest ?? "",
    network,
    success: tx.effects?.status?.success,
    checkpoint: tx.checkpoint?.toString(),
    executedAt: tx.timestamp
      ? new Date(
          Number(tx.timestamp.seconds) * 1000 +
            Math.floor(tx.timestamp.nanos / 1e6),
        ).toISOString()
      : undefined,
    payer: tx.transaction?.sender,
    decimals,
    supported: false,
  };
  const kind = tx.transaction?.kind?.data;
  if (kind?.oneofKind !== "programmableTransaction" || !base.payer) return base;
  const ptb = kind.programmableTransaction;
  if (
    ptb.commands.length !== 2 ||
    tx.transaction?.gasPayment?.owner !== base.payer
  )
    return base;
  const first = ptb.commands[0].command,
    second = ptb.commands[1].command;
  if (
    first.oneofKind !== "splitCoins" ||
    second.oneofKind !== "transferObjects"
  )
    return base;
  const split = first.splitCoins,
    transfer = second.transferObjects;
  if (
    split.amounts.length !== 1 ||
    transfer.objects.length !== 1 ||
    split.amounts[0].kind !== GrpcTypes.Argument_ArgumentKind.INPUT ||
    transfer.address?.kind !== GrpcTypes.Argument_ArgumentKind.INPUT
  )
    return base;
  const object = transfer.objects[0];
  if (
    object.kind !== GrpcTypes.Argument_ArgumentKind.RESULT ||
    object.result !== 0 ||
    (object.subresult ?? 0) !== 0
  )
    return base;
  if (
    split.coin?.kind !== GrpcTypes.Argument_ArgumentKind.GAS &&
    split.coin?.kind !== GrpcTypes.Argument_ArgumentKind.INPUT
  )
    return base;
  const amountBytes = ptb.inputs[split.amounts[0].input ?? -1]?.pure,
    addressBytes = ptb.inputs[transfer.address.input ?? -1]?.pure;
  if (amountBytes?.length !== 8 || addressBytes?.length !== 32) return base;
  const amount = Buffer.from(amountBytes).readBigUInt64LE().toString(),
    recipient = "0x" + Buffer.from(addressBytes).toString("hex");
  const changes = tx.balanceChanges;
  if (
    changes.some(
      (b) =>
        !b.address || !b.coinType || !b.amount || !/^[-]?\d+$/.test(b.amount),
    )
  )
    return base;
  const credits = changes.filter((b) => BigInt(b.amount!) > 0n);
  if (
    credits.length !== 1 ||
    canonicalAddress(credits[0].address!) !== recipient ||
    credits[0].amount !== amount
  )
    return base;
  if (
    changes.some(
      (b) =>
        BigInt(b.amount!) < 0n &&
        canonicalAddress(b.address!) !== canonicalAddress(base.payer!),
    )
  )
    return base;
  if (canonicalAddress(base.payer) === recipient) return base;
  return {
    ...base,
    recipient,
    amount,
    coinType: canonicalCoin(credits[0].coinType!),
    supported: true,
  };
}
export function providerFailure(error: unknown, digest: string): PaymentResult {
  const e = error as { code?: string | number; message?: string };
  const status = String(e.code ?? "");
  const [code, message] =
    status === "5" || status === "NOT_FOUND"
      ? [
          /prun|histor/i.test(e.message ?? "")
            ? "PRUNED_HISTORY"
            : "NOT_FOUND_OR_PRUNED",
          "The provider could not return this transaction. It may be unknown or outside retained history; this is not proof of nonpayment.",
        ]
      : status === "8" || status === "RESOURCE_EXHAUSTED"
        ? ["RATE_LIMITED", "Tatum is rate limiting requests. Retry later."]
        : status === "4" || status === "DEADLINE_EXCEEDED"
          ? [
              "RPC_TIMEOUT",
              "Tatum did not respond before the deadline. Payment remains unverified.",
            ]
          : /Missing configuration/.test(e.message ?? "")
            ? ["CREDENTIALS_MISSING", "Configure TATUM_API_KEY on the server."]
            : status === "16" || status === "UNAUTHENTICATED"
              ? ["AUTH_REJECTED", "Tatum rejected the configured credentials."]
              : [
                  "RPC_UNAVAILABLE",
                  "Tatum is unavailable. Payment remains unverified.",
                ];
  return {
    state: "pending",
    code,
    message,
    digest,
    checkedAt: new Date().toISOString(),
    provider: "tatum-grpc",
  };
}
export async function verifyTatum(
  order: PaymentOrder,
  digest: string,
  buyerId: string,
): Promise<PaymentResult> {
  if (!isValidTransactionDigest(digest))
    return {
      state: "needs_review",
      code: "INVALID_DIGEST",
      message: "Enter a valid Sui transaction digest.",
      digest,
      provider: "tatum-grpc",
      checkedAt: new Date().toISOString(),
    };
  let connection: ReturnType<typeof tatumClient> | undefined;
  try {
    connection = tatumClient();
    const { client } = connection;
    const info = await client.ledgerService.getServiceInfo({});
    if (info.response.chain !== "mainnet")
      throw new Error("Unexpected chain reported by gateway");
    let raw: GrpcTypes.ExecutedTransaction | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        raw = (
          await client.ledgerService.getTransaction({
            digest,
            readMask: {
              paths: [
                "digest",
                "transaction",
                "effects.status",
                "checkpoint",
                "timestamp",
                "balance_changes",
              ],
            },
          })
        ).response.transaction;
        break;
      } catch (error) {
        const code = String((error as { code?: unknown }).code);
        if (attempt || !["UNAVAILABLE", "14"].includes(code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!raw)
      return {
        state: "pending",
        code: "UNKNOWN_TRANSACTION",
        message: "No transaction was returned. Payment remains unverified.",
        digest,
        provider: "tatum-grpc",
        checkedAt: new Date().toISOString(),
      };
    if (raw.digest !== digest)
      throw new Error("Provider returned a different digest");
    const tx = decodeDirectTransfer(raw, "mainnet");
    if (tx.coinType) {
      const metadata = await client.getCoinMetadata({ coinType: tx.coinType });
      tx.decimals = metadata.coinMetadata?.decimals;
    }
    return verifyTransaction(order, tx, buyerId, "tatum-grpc");
  } catch (error) {
    return providerFailure(error, digest);
  } finally {
    connection?.close();
  }
}
