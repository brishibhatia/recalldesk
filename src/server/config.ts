import { z } from "zod";
export function mode() {
  return z.enum(["demo", "live"]).parse(process.env.APP_MODE ?? "demo");
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
export function baseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
export function databaseUrl() {
  return (
    process.env.DATABASE_URL ??
    (mode() === "demo"
      ? "postgresql://recalldesk:local_demo_only@localhost:55432/recalldesk"
      : required("DATABASE_URL"))
  );
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function safeError(error: unknown) {
  return error instanceof AppError
    ? error.message
    : "The operation could not complete. Check provider readiness and try again.";
}
