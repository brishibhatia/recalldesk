import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { AppError, baseUrl, mode, required } from "./config";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

export function getAuth(provisioning = false) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: baseUrl(),
    secret:
      mode() === "live"
        ? required("BETTER_AUTH_SECRET")
        : (process.env.BETTER_AUTH_SECRET ??
          "demo-only-not-used-for-live-auth-000000000000"),
    emailAndPassword: {
      enabled: mode() === "live",
      disableSignUp: !provisioning,
      minPasswordLength: 12,
    },
    trustedOrigins: [baseUrl()],
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60 },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimit",
    },
  });
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export type Principal = {
  merchantId: string;
  actor: string;
  mode: "demo" | "live";
  role: "operator" | "customer";
  orderId?: string;
};
function cookie(req: Request, name: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export async function authenticate(
  req: Request,
  allowCustomer = false,
): Promise<Principal> {
  if (mode() === "demo" && !allowCustomer) {
    const token = cookie(req, "rd_demo");
    if (token) {
      const [row] = await db
        .select()
        .from(schema.demoSessions)
        .innerJoin(
          schema.merchants,
          eq(schema.demoSessions.merchantId, schema.merchants.id),
        )
        .where(
          and(
            eq(schema.demoSessions.tokenHash, hash(token)),
            gt(schema.demoSessions.expiresAt, new Date()),
            eq(schema.merchants.mode, "demo"),
          ),
        );
      if (row)
        return {
          merchantId: row.merchants.id,
          actor: "demo-operator",
          mode: "demo",
          role: "operator",
        };
    }
  } else if (!allowCustomer) {
    const authSession = await getAuth().api.getSession({
      headers: req.headers,
    });
    if (authSession) {
      const [membership] = await db
        .select()
        .from(schema.memberships)
        .innerJoin(
          schema.merchants,
          eq(schema.memberships.merchantId, schema.merchants.id),
        )
        .where(
          and(
            eq(schema.memberships.userId, authSession.user.id),
            eq(schema.merchants.mode, "live"),
          ),
        );
      if (membership)
        return {
          merchantId: membership.merchants.id,
          actor: authSession.user.id,
          mode: "live",
          role: "operator",
        };
    }
  }
  if (allowCustomer) {
    const token = cookie(req, "rd_support");
    if (token) {
      const [access] = await db
        .select()
        .from(schema.supportAccess)
        .innerJoin(
          schema.merchants,
          eq(schema.supportAccess.merchantId, schema.merchants.id),
        )
        .where(
          and(
            eq(schema.supportAccess.tokenHash, hash(token)),
            isNull(schema.supportAccess.revokedAt),
            gt(schema.supportAccess.expiresAt, new Date()),
            eq(schema.merchants.mode, mode()),
          ),
        );
      if (access)
        return {
          merchantId: access.merchants.id,
          actor: `customer:${access.support_access.id}`,
          mode: mode(),
          role: "customer",
          orderId: access.support_access.orderId,
        };
    }
  }
  throw new AppError("UNAUTHORIZED", "Sign in to access this workspace.", 401);
}
export function assertOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(baseUrl()).origin)
    throw new AppError(
      "ORIGIN",
      "This request did not originate from RecallDesk.",
      403,
    );
}
export async function rateLimit(key: string, limit = 60) {
  const result = await db.execute(
    sql`INSERT INTO rate_limits (key,count,reset_at) VALUES (${key},1,now()+interval '1 minute') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.count+1 END, reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '1 minute' ELSE rate_limits.reset_at END RETURNING count`,
  );
  if (Number(result.rows[0].count) > limit)
    throw new AppError(
      "RATE_LIMIT",
      "Too many requests. Please wait a minute.",
      429,
    );
}
export function sessionCookie(name: string, token: string, seconds: number) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${baseUrl().startsWith("https:") ? "; Secure" : ""}`;
}
