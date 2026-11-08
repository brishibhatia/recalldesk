import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";
import { mode } from "@/server/config";
export const runtime = "nodejs";
export async function GET(req: Request) {
  if (mode() !== "live")
    return Response.json(
      { error: "Merchant login is disabled in sample mode." },
      { status: 403 },
    );
  return toNextJsHandler(getAuth()).GET(req);
}
export async function POST(req: Request) {
  if (mode() !== "live")
    return Response.json(
      { error: "Merchant login is disabled in sample mode." },
      { status: 403 },
    );
  return toNextJsHandler(getAuth()).POST(req);
}
