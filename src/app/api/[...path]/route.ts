import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import {
  authenticate,
  assertOrigin,
  hash,
  newToken,
  rateLimit,
  sessionCookie,
} from "@/server/auth";
import { AppError, mode, safeError } from "@/server/config";
import { createDemoWorkspace } from "@/server/fixtures";
import { caseDetails, performAction, workspace } from "@/server/services";
import { checkProviders, readiness } from "@/server/readiness";
import { runEvaluation } from "@/evaluation/runner";
import { workerOnce } from "@/server/worker";
import { compareCase, evidenceReport } from "@/server/evidence";
import { productAccess, downloadProduct } from "@/server/fulfillment";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 65536)
    throw new AppError("TOO_LARGE", "Request too large.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("EMPTY_BODY", "Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > 65536) {
      await reader.cancel();
      throw new AppError("TOO_LARGE", "Request too large.", 413);
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return json(
      {
        error: "Please check the entered fields.",
        code: "VALIDATION",
        fields: error.issues.map((i) => i.path.join(".")),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return json({ error: "Invalid JSON request." }, 400);
  if (!(error instanceof AppError))
    console.error("RecallDesk request failed", {
      name: (error as Error).name,
      code: (error as { code?: string }).code,
    });
  return json(
    {
      error: safeError(error),
      code: error instanceof AppError ? error.code : "INTERNAL",
    },
    error instanceof AppError ? error.status : 500,
  );
}
export async function GET(req: Request, ctx: Context) {
  try {
    const path = (await ctx.params).path.join("/");
    if (path === "health") return json({ status: "ok", mode: mode() });
    const p = await authenticate(req, path.startsWith("support/"));
    if (path === "support/product")
      return json(await productAccess(p, p.orderId!));
    if (path === "support/product/download") {
      const file = await downloadProduct(p, p.orderId!);
      return new NextResponse(file.content, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path === "evidence") {
      const id = z
        .string()
        .uuid()
        .parse(new URL(req.url).searchParams.get("case"));
      const report = await evidenceReport(p, id);
      if (new URL(req.url).searchParams.get("download") === "1")
        return new NextResponse(JSON.stringify(report, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="recalldesk-evidence-${id}.json"`,
            "Cache-Control": "no-store",
          },
        });
      return json(report);
    }
    if (/^cases\/[^/]+\/comparison$/.test(path))
      return json(
        await compareCase(p, z.string().uuid().parse(path.split("/")[1])),
      );
    if (path === "workspace" || path === "support/workspace")
      return json(await workspace(p));
    if (path.startsWith("cases/") || path.startsWith("support/cases/"))
      return json(
        await caseDetails(p, z.string().uuid().parse(path.split("/").at(-1))),
      );
    if (path === "memories")
      return json(
        await db
          .select({ event: s.memories, job: s.jobs })
          .from(s.memories)
          .innerJoin(
            s.jobs,
            and(
              eq(s.jobs.eventId, s.memories.id),
              eq(s.jobs.merchantId, p.merchantId),
            ),
          )
          .where(eq(s.memories.merchantId, p.merchantId))
          .orderBy(desc(s.memories.createdAt)),
      );
    if (path === "evaluations")
      return json(
        await db
          .select()
          .from(s.evaluations)
          .where(eq(s.evaluations.merchantId, p.merchantId))
          .orderBy(desc(s.evaluations.createdAt)),
      );
    if (path === "readiness") return json(await readiness(p));
    throw new AppError("NOT_FOUND", "Endpoint not found.", 404);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const path = (await ctx.params).path.join("/");
    if (path === "worker") {
      const configured = process.env.WORKER_TOKEN;
      const supplied =
        req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (
        !configured ||
        configured.length < 32 ||
        !timingSafeEqual(
          Buffer.from(hash(supplied)),
          Buffer.from(hash(configured)),
        )
      )
        throw new AppError(
          "UNAUTHORIZED",
          "Worker authentication required.",
          401,
        );
      await workerOnce();
      return json({ ok: true });
    }
    assertOrigin(req);
    if (path === "demo") {
      if (mode() !== "demo")
        throw new AppError(
          "DEMO_DISABLED",
          "Sample workspaces are disabled on this live deployment.",
          403,
        );
      await rateLimit("demo-entry-global", 30);
      const merchant = await createDemoWorkspace(),
        token = newToken();
      await db.insert(s.demoSessions).values({
        merchantId: merchant.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 86400000),
      });
      return new NextResponse(JSON.stringify({ id: merchant.id }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie("rd_demo", token, 86400),
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "support/session") {
      await rateLimit("support-entry-global", 60);
      const token = z
        .string()
        .min(40)
        .max(100)
        .parse((await body(req)).token);
      const [access] = await db
        .select()
        .from(s.supportAccess)
        .innerJoin(s.merchants, eq(s.supportAccess.merchantId, s.merchants.id))
        .where(
          and(
            eq(s.supportAccess.tokenHash, hash(token)),
            gt(s.supportAccess.expiresAt, new Date()),
            isNull(s.supportAccess.revokedAt),
            eq(s.merchants.mode, mode()),
          ),
        );
      if (!access)
        throw new AppError(
          "UNAUTHORIZED",
          "This support access code is invalid or expired.",
          401,
        );
      return new NextResponse(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie(
            "rd_support",
            token,
            Math.max(
              0,
              Math.floor(
                (access.support_access.expiresAt.getTime() - Date.now()) / 1000,
              ),
            ),
          ),
          "Cache-Control": "no-store",
        },
      });
    }
    const p = await authenticate(req, path === "support/action");
    await rateLimit(`merchant:${p.merchantId}`, 90);
    if (path === "action" || path === "support/action")
      return json(await performAction(p, await body(req)));
    if (path === "signout") {
      if (p.mode === "demo")
        await db
          .delete(s.demoSessions)
          .where(eq(s.demoSessions.merchantId, p.merchantId));
      return new NextResponse(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie("rd_demo", "", 0),
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "checks") return json(await checkProviders(p));
    if (path === "evaluate") return json(await runEvaluation(p.merchantId));
    if (path === "jobs/tick") {
      if (p.mode !== "demo")
        throw new AppError(
          "DEMO_ONLY",
          "Use the authenticated worker process in live mode.",
          403,
        );
      await workerOnce(p.merchantId);
      return json({ ok: true });
    }
    if (path === "demo/reset") {
      if (p.mode !== "demo")
        throw new AppError(
          "DEMO_ONLY",
          "Reset only applies to sample sessions.",
          403,
        );
      // Revoke this browser capability. Old isolated data expires administratively; no live or remote deletion.
      await db
        .delete(s.demoSessions)
        .where(eq(s.demoSessions.merchantId, p.merchantId));
      return new NextResponse(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie("rd_demo", "", 0),
        },
      });
    }
    throw new AppError("NOT_FOUND", "Endpoint not found.", 404);
  } catch (error) {
    return failure(error);
  }
}
