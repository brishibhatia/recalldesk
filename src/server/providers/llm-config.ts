export type LlmProvider = "gemini" | "openai";
export type LlmConfig = {
  provider: LlmProvider;
  model: string;
  keyVariable: "GEMINI_API_KEY" | "OPENAI_API_KEY";
};
export type LlmErrorCode =
  | "MISSING_CONFIGURATION"
  | "UNSUPPORTED_PROVIDER"
  | "INVALID_MODEL"
  | "INVALID_REQUEST"
  | "AUTHENTICATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "QUOTA_EXHAUSTED"
  | "REFUSED"
  | "EMPTY_OUTPUT"
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "INVALID_CITATION"
  | "CHANGED_REMEDY"
  | "CHANGED_POLICY"
  | "OUTPUT_LIMIT"
  | "INPUT_LIMIT"
  | "TIMEOUT"
  | "BUDGET_EXHAUSTED"
  | "VERIFICATION_REQUIRED"
  | "PROVIDER_UNAVAILABLE";

const messages: Record<LlmErrorCode, string> = {
  MISSING_CONFIGURATION:
    "The selected explanation provider is missing its model or API key.",
  UNSUPPORTED_PROVIDER: "Unsupported LLM_PROVIDER. Select gemini or openai.",
  INVALID_MODEL:
    "LLM_MODEL must be a supported model identifier, not a URL or credential.",
  INVALID_REQUEST:
    "The explanation provider rejected the structured request. Check SDK and schema compatibility; no automatic retry was made.",
  AUTHENTICATION_FAILED:
    "The explanation provider rejected authentication or access.",
  MODEL_UNAVAILABLE:
    "The configured model is unavailable to this project. No other model was selected.",
  QUOTA_EXHAUSTED:
    "The explanation provider reported a rate or quota limit. Check the recorded attempts; no paid model or billing upgrade was selected.",
  REFUSED: "The explanation provider refused or safety-blocked the response.",
  EMPTY_OUTPUT: "The explanation provider returned no completed explanation.",
  INVALID_JSON: "The explanation provider returned invalid JSON.",
  INVALID_SCHEMA:
    "The explanation provider returned an invalid explanation structure.",
  INVALID_CITATION:
    "The explanation provider cited missing evidence or omitted the supplied evidence.",
  CHANGED_REMEDY:
    "The explanation provider changed the server-selected remedy; its output was rejected.",
  CHANGED_POLICY:
    "The explanation provider changed the current policy reference; its output was rejected.",
  OUTPUT_LIMIT: "The explanation provider exceeded the allowed response size.",
  INPUT_LIMIT: "The decision evidence exceeds the bounded explanation input.",
  TIMEOUT:
    "The explanation request timed out and its client connection was cancelled.",
  BUDGET_EXHAUSTED:
    "The authorized inference attempt limit has been reached; no request was made.",
  VERIFICATION_REQUIRED:
    "This local pilot requires confirmed replacement credentials, free-tier access with billing disabled, the reviewed Gemini model and disabled Mainnet writes. No inference request was made.",
  PROVIDER_UNAVAILABLE:
    "The explanation provider is unavailable or returned an unsupported response.",
};

export class LlmFailure extends Error {
  constructor(public readonly code: LlmErrorCode) {
    super(messages[code]);
  }
}

export function normalizeModelId(value: unknown): string {
  if (typeof value !== "string") throw new LlmFailure("INVALID_MODEL");
  const model = value.replace(/^models\//, "").trim();
  if (
    /^(?:AIza|sk-|t-)/.test(model) ||
    [
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "TATUM_API_KEY",
      "MEMWAL_DELEGATE_KEY",
      "BETTER_AUTH_SECRET",
      "MERCHANT_PASSWORD",
    ].some(
      (key) =>
        process.env[key] &&
        process.env[key]!.length >= 8 &&
        model.includes(process.env[key]!),
    )
  )
    throw new LlmFailure("INVALID_MODEL");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model))
    throw new LlmFailure("INVALID_MODEL");
  return model;
}

/** Server configuration projection: deliberately never includes credential values. */
export function selectedLlmConfig(): LlmConfig {
  const provider = process.env.LLM_PROVIDER?.trim();
  if (!provider) throw new LlmFailure("MISSING_CONFIGURATION");
  if (provider !== "gemini" && provider !== "openai")
    throw new LlmFailure("UNSUPPORTED_PROVIDER");
  if (!process.env.LLM_MODEL?.trim())
    throw new LlmFailure("MISSING_CONFIGURATION");
  return {
    provider,
    model: normalizeModelId(process.env.LLM_MODEL),
    keyVariable: provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY",
  };
}

export function selectedLlmKey(config: LlmConfig): string {
  const value = process.env[config.keyVariable]?.trim();
  if (!value) throw new LlmFailure("MISSING_CONFIGURATION");
  return value;
}

/** Map only known categories. Provider messages, request URLs and bodies never leave this boundary. */
export function safeLlmFailure(error: unknown, aborted = false): LlmFailure {
  if (error instanceof LlmFailure) return error;
  if (aborted) return new LlmFailure("TIMEOUT");
  const value = error as {
    status?: number;
    statusCode?: number;
    code?: string | number;
    name?: string;
    message?: string;
  } | null;
  const status = value?.status ?? value?.statusCode;
  // Google can reject an invalid key with HTTP 400. Classify internally only;
  // never forward the provider's message, which may contain request details.
  if (
    status === 400 &&
    typeof value?.message === "string" &&
    /API_KEY_(?:INVALID|EXPIRED)|API key not valid|invalid API key/i.test(
      value.message,
    )
  )
    return new LlmFailure("AUTHENTICATION_FAILED");
  if (status === 429 || value?.code === "RESOURCE_EXHAUSTED")
    return new LlmFailure("QUOTA_EXHAUSTED");
  if (status === 401 || status === 403 || value?.code === "UNAUTHENTICATED")
    return new LlmFailure("AUTHENTICATION_FAILED");
  if (status === 404 || value?.code === "NOT_FOUND")
    return new LlmFailure("MODEL_UNAVAILABLE");
  if (status === 400 || value?.name === "InvalidRequestError")
    return new LlmFailure("INVALID_REQUEST");
  if (value?.name && /Abort|Timeout/.test(value.name))
    return new LlmFailure("TIMEOUT");
  if (
    value?.code === "BUDGET_EXHAUSTED" ||
    value?.code === "INFERENCE_BUDGET_EXHAUSTED"
  )
    return new LlmFailure("BUDGET_EXHAUSTED");
  return new LlmFailure("PROVIDER_UNAVAILABLE");
}

/** Allowlisted diagnostic metadata only; never serialize a provider exception. */
export function safeLlmDiagnostic(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as {
          status?: unknown;
          statusCode?: unknown;
          name?: unknown;
          message?: unknown;
        })
      : {};
  const status = value.status ?? value.statusCode;
  const names = [
    "TypeError",
    "BadRequestError",
    "InternalServerError",
    "APIConnectionError",
    "APIConnectionTimeoutError",
    "InvalidRequestError",
    "GoogleGenAiError",
    "ApiError",
  ];
  const message = typeof value.message === "string" ? value.message : "";
  const restriction =
    /FREE_TIER_VERIFICATION_REQUIRED|verification needed/i.test(message)
      ? "free_tier_verification_required"
      : /free tier (?:is )?unavailable|FREE_TIER_UNAVAILABLE/i.test(message)
        ? "free_tier_unavailable"
        : /payment needed|outstanding balance|billing.*required/i.test(message)
          ? "payment_required"
          : /key.*(?:reported|leaked)/i.test(message)
            ? "key_reported_leaked"
            : null;
  return {
    httpStatus:
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? status
        : null,
    category:
      typeof value.name === "string" && names.includes(value.name)
        ? value.name
        : "other",
    schemaRelated: /schema|response_format/i.test(message),
    ...(restriction ? { accessRestriction: restriction } : {}),
  };
}
