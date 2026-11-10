export type ReadCheckStage =
  "tatum_service" | "tatum_account" | "owner_configuration" | "walrus_recall";

/** Return only allowlisted classifications; provider messages/causes can contain secrets. */
export function readCheckError(error: unknown, stage: ReadCheckStage) {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const status =
    typeof value.status === "number" &&
    Number.isInteger(value.status) &&
    value.status >= 100 &&
    value.status <= 599
      ? value.status
      : null;
  const message = typeof value.message === "string" ? value.message : "";
  const cause =
    value.cause && typeof value.cause === "object"
      ? (value.cause as Record<string, unknown>)
      : {};
  let code = "UNCLASSIFIED_READ_FAILURE";
  let action =
    "Check the configured endpoint, account and provider service status. No raw provider error was retained.";
  if (value.serverCode === "ERR_TIMESTAMP_OUT_OF_BOUNDS") {
    code = "CLOCK_DRIFT";
    action = "Synchronize the host clock, then repeat the authenticated read.";
  } else if (value.serverCode === "AUTH_UPSTREAM_UNAVAILABLE") {
    code = "AUTH_UPSTREAM_UNAVAILABLE";
    action =
      "The relayer could not check credentials against Sui. This does not establish an invalid delegate.";
  } else if (
    status === 401 ||
    status === 403 ||
    value.code === "UNAUTHENTICATED" ||
    value.code === "PERMISSION_DENIED"
  ) {
    code = "AUTH_REJECTED";
    action =
      stage === "walrus_recall"
        ? "Verify the replacement delegate is authorized on this exact Mainnet account. Do not register or replace it onchain as part of this read check."
        : "Verify the replacement Tatum Mainnet API key and its Sui access.";
  } else if (status === 429 || value.code === "RESOURCE_EXHAUSTED") {
    code = "RATE_LIMITED";
    action =
      "The provider quota or rate limit was reached. No automatic retry was attempted.";
  } else if (
    value.name === "MemWalCompatibilityError" ||
    status === 426 ||
    message.startsWith("Walrus Memory compatibility check failed:")
  ) {
    code = "SDK_COMPATIBILITY";
    action =
      "Check the installed Walrus SDK against the managed relayer compatibility metadata.";
  } else if (
    value.name === "MemWalRequestTimeout" ||
    value.name === "AbortError" ||
    value.code === "DEADLINE_EXCEEDED" ||
    status === 504
  ) {
    code = "TIMEOUT";
    action =
      "A bounded read timed out. Authentication and recall remain unverified.";
  } else if (
    message.startsWith("GET /config") ||
    message.startsWith("Required ")
  ) {
    code = "RELAYER_CONFIGURATION";
    action =
      "Check managed relayer configuration and installed Sui/SEAL SDK compatibility.";
  } else if (
    message === "Wrong network" ||
    message === "Unexpected account type" ||
    message === "Account omitted embedded owner"
  ) {
    code = "ACCOUNT_VALIDATION";
    action =
      "The response did not establish the expected Mainnet MemWalAccount and embedded owner.";
  } else if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(String(value.code)) ||
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(String(cause.code)) ||
    value.code === "UNAVAILABLE" ||
    message === "fetch failed"
  ) {
    code = "NETWORK_UNAVAILABLE";
    action =
      "Check outbound connectivity to the configured service and managed relayer preflight endpoints.";
  } else if (status !== null && status >= 500) {
    code = "PROVIDER_UNAVAILABLE";
    action =
      "The provider returned a server failure. This is not proof of invalid credentials.";
  }
  const knownPhases = [
    "preflight GET /version",
    "preflight GET /health",
    "preflight GET /config",
    "POST /api/recall",
  ];
  return {
    stage,
    code,
    status,
    phase:
      typeof value.phase === "string" && knownPhases.includes(value.phase)
        ? value.phase
        : null,
    action,
  };
}
