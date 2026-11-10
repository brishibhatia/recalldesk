import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

const LIMIT = 4;
type Attempt = { at: string; provider: string; model: string; purpose: string };
type Success = { at: string; attempt: number; provider: string; model: string };
type PriorGrant = {
  grantId: string;
  authorizationSha256: string;
  attemptsSha256: string;
};
type Authorization = {
  schemaVersion: 1;
  grantId: string;
  limit: 4;
  provider: "gemini";
  model: string;
  priorLedgerSha256: string;
  authorizedAt: string;
  stopAfterSuccess: true;
  /** All earlier named allowances, in chronological order. */
  priorGrants?: PriorGrant[];
};
type Grant = {
  authorization: Authorization;
  authorizationSha256: string;
  priorAttempts: number;
};
type Budget = {
  limit: number;
  attempts: Attempt[];
  schemaVersion?: number;
  grantId?: string;
  priorLedgerSha256?: string;
  authorizationSha256?: string;
  validatedSuccess?: Success | null;
};
const denied = (message: string) =>
  Object.assign(new Error(message), { code: "INFERENCE_BUDGET_EXHAUSTED" });
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw denied("Invalid verification budget record; no allowance was reset.");
  }
}
function validAttempts(value: unknown): value is Attempt[] {
  return (
    Array.isArray(value) &&
    value.length <= LIMIT &&
    value.every(
      (attempt) =>
        attempt &&
        typeof attempt === "object" &&
        typeof attempt.at === "string" &&
        Number.isFinite(Date.parse(attempt.at)) &&
        [attempt.provider, attempt.model, attempt.purpose].every(
          (field) =>
            typeof field === "string" &&
            field.length > 0 &&
            field.length <= 200,
        ),
    )
  );
}
function originalBudget(text: string): Budget {
  const value = parseJson(text);
  if (!value || value.limit !== LIMIT || !validAttempts(value.attempts))
    throw denied(
      "Invalid original verification budget; no allowance was reset.",
    );
  return { limit: LIMIT, attempts: value.attempts };
}
function paths(directory: string) {
  // Runtime bookkeeping, never a build asset. Do not trace local files.
  const folder = resolve(/* turbopackIgnore: true */ directory);
  const selected = process.env.LLM_VERIFICATION_GRANT?.trim();
  if (selected && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(selected))
    throw denied("Invalid verification grant identifier.");
  const original = resolve(folder, "llm-verification-budget.json");
  const grantFolder = resolve(folder, "llm-verification-grants");
  return {
    original,
    selected: selected || null,
    folder: selected ? grantFolder : folder,
    path: selected
      ? resolve(grantFolder, `${selected}.attempts.json`)
      : original,
    manifest: selected
      ? resolve(grantFolder, `${selected}.authorization.json`)
      : null,
  };
}
function parseAuthorization(
  manifest: string,
  selected: string,
  prior: string,
): Authorization {
  const authorization = parseJson(manifest) as Authorization;
  const priorBudget = originalBudget(prior);
  if (
    !authorization ||
    authorization.schemaVersion !== 1 ||
    authorization.grantId !== selected ||
    authorization.limit !== LIMIT ||
    authorization.provider !== "gemini" ||
    typeof authorization.model !== "string" ||
    !/^[a-z][a-z0-9.-]{1,99}$/.test(authorization.model) ||
    authorization.stopAfterSuccess !== true ||
    typeof authorization.authorizedAt !== "string" ||
    !Number.isFinite(Date.parse(authorization.authorizedAt)) ||
    authorization.priorLedgerSha256 !== digest(prior) ||
    priorBudget.attempts.length !== LIMIT
  )
    throw denied(
      "The named allowance is invalid or its original attempt history has changed.",
    );
  if (authorization.priorGrants !== undefined) {
    const refs = authorization.priorGrants;
    if (
      !Array.isArray(refs) ||
      refs.length > 16 ||
      refs.some(
        (ref) =>
          !ref ||
          typeof ref.grantId !== "string" ||
          !/^[a-z0-9][a-z0-9-]{0,79}$/.test(ref.grantId) ||
          ref.grantId === selected ||
          typeof ref.authorizationSha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(ref.authorizationSha256) ||
          typeof ref.attemptsSha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(ref.attemptsSha256),
      ) ||
      new Set(refs.map((ref) => ref.grantId)).size !== refs.length
    )
      throw denied("Invalid prior allowance references; no history was reset.");
  }
  return authorization;
}
async function readGrant(
  location: ReturnType<typeof paths>,
): Promise<Grant | null> {
  if (!location.manifest || !location.selected) return null;
  let manifest: string, prior: string;
  try {
    [manifest, prior] = await Promise.all([
      readFile(location.manifest, "utf8"),
      readFile(location.original, "utf8"),
    ]);
  } catch {
    throw denied(
      "The named allowance requires an existing authorization manifest and preserved original ledger.",
    );
  }
  const authorization = parseAuthorization(manifest, location.selected, prior);
  let priorAttempts = originalBudget(prior).attempts.length;
  const refs = authorization.priorGrants ?? [];
  for (const [index, ref] of refs.entries()) {
    let priorManifest: string, priorLedger: string;
    try {
      [priorManifest, priorLedger] = await Promise.all([
        readFile(
          resolve(location.folder, `${ref.grantId}.authorization.json`),
          "utf8",
        ),
        readFile(
          resolve(location.folder, `${ref.grantId}.attempts.json`),
          "utf8",
        ),
      ]);
    } catch {
      throw denied(
        "A preserved prior allowance is missing; no history was reset.",
      );
    }
    if (
      digest(priorManifest) !== ref.authorizationSha256 ||
      digest(priorLedger) !== ref.attemptsSha256
    )
      throw denied(
        "A preserved prior allowance changed; no history was reset.",
      );
    const priorAuthorization = parseAuthorization(
      priorManifest,
      ref.grantId,
      prior,
    );
    const ancestors = priorAuthorization.priorGrants ?? [];
    if (
      ancestors.length !== index ||
      ancestors.some(
        (ancestor, i) =>
          ancestor.grantId !== refs[i].grantId ||
          ancestor.authorizationSha256 !== refs[i].authorizationSha256 ||
          ancestor.attemptsSha256 !== refs[i].attemptsSha256,
      ) ||
      Date.parse(priorAuthorization.authorizedAt) >
        Date.parse(authorization.authorizedAt)
    )
      throw denied("Prior allowance chain is incomplete or reordered.");
    const budget = parseNamedBudget(priorLedger, {
      authorization: priorAuthorization,
      authorizationSha256: ref.authorizationSha256,
      priorAttempts,
    });
    if (budget.attempts.length !== LIMIT || budget.validatedSuccess !== null)
      throw denied(
        "A previous allowance must be exhausted without success before an additional repair allowance.",
      );
    priorAttempts += budget.attempts.length;
  }
  return {
    authorization,
    authorizationSha256: digest(manifest),
    priorAttempts,
  };
}
async function readBudget(
  location: ReturnType<typeof paths>,
  grant: Grant | null,
): Promise<Budget> {
  let text: string;
  try {
    text = await readFile(location.path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return grant
      ? {
          schemaVersion: 1,
          grantId: grant.authorization.grantId,
          limit: LIMIT,
          priorLedgerSha256: grant.authorization.priorLedgerSha256,
          authorizationSha256: grant.authorizationSha256,
          attempts: [],
          validatedSuccess: null,
        }
      : { limit: LIMIT, attempts: [] };
  }
  if (!grant) return originalBudget(text);
  return parseNamedBudget(text, grant);
}
function parseNamedBudget(text: string, grant: Grant): Budget {
  const value = parseJson(text) as Budget;
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.limit !== LIMIT ||
    value.grantId !== grant.authorization.grantId ||
    value.priorLedgerSha256 !== grant.authorization.priorLedgerSha256 ||
    value.authorizationSha256 !== grant.authorizationSha256 ||
    !validAttempts(value.attempts) ||
    !Object.hasOwn(value, "validatedSuccess") ||
    value.attempts.some(
      (a) =>
        a.provider !== grant.authorization.provider ||
        a.model !== grant.authorization.model,
    )
  )
    throw denied("Invalid named allowance ledger; no allowance was reset.");
  if (value.validatedSuccess !== null) {
    const success = value.validatedSuccess;
    if (
      !success ||
      !Number.isInteger(success.attempt) ||
      success.attempt < 1 ||
      success.attempt > value.attempts.length ||
      success.provider !== grant.authorization.provider ||
      success.model !== grant.authorization.model ||
      typeof success.at !== "string" ||
      !Number.isFinite(Date.parse(success.at))
    )
      throw denied("Invalid success marker; no allowance was reset.");
  }
  return value;
}
async function withBudget<T>(
  directory: string,
  operation: (budget: Budget, grant: Grant | null) => Promise<T>,
) {
  const location = paths(directory);
  // A named grant cannot be created implicitly by an application request.
  const grant = await readGrant(location);
  await mkdir(location.folder, { recursive: true, mode: 0o700 });
  const lock = `${location.path}.lock`;
  const handle = await open(lock, "wx", 0o600).catch(() => {
    throw denied(
      "Verification budget is locked. Review the previous run before retrying.",
    );
  });
  try {
    const budget = await readBudget(location, grant);
    const result = await operation(budget, grant);
    const file = await open(location.path, "w", 0o600);
    try {
      await file.writeFile(JSON.stringify(budget, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    return result;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
/** Shared, durable allowance. Named repair grants retain the original ledger unchanged. */
export async function reserveInferenceAttempt(
  provider: string,
  model: string,
  purpose: string,
  directory = resolve(".local"),
) {
  return withBudget(directory, async (budget, grant) => {
    if (
      grant &&
      (provider !== grant.authorization.provider ||
        model !== grant.authorization.model)
    )
      throw denied(
        "The requested provider/model does not match the named authorization.",
      );
    if (budget.validatedSuccess)
      throw denied(
        "This verification allowance stopped after a validated response.",
      );
    if (budget.attempts.length >= LIMIT)
      throw denied(
        "Four verification attempts already reserved for this allowance.",
      );
    const attempt = { at: new Date().toISOString(), provider, model, purpose };
    if (!validAttempts([attempt]))
      throw denied("Invalid verification attempt metadata.");
    budget.attempts.push(attempt);
    return budget.attempts.length;
  });
}
/** Call only after schema, remedy, policy and citation validation succeeds. */
export async function markVerificationSuccess(
  provider: string,
  model: string,
  directory = resolve(".local"),
) {
  if (!paths(directory).selected) return;
  await withBudget(directory, async (budget, grant) => {
    if (
      !grant ||
      provider !== grant.authorization.provider ||
      model !== grant.authorization.model ||
      !budget.attempts.length
    )
      throw denied(
        "Cannot close a verification allowance without a matching admitted request.",
      );
    budget.validatedSuccess ??= {
      at: new Date().toISOString(),
      attempt: budget.attempts.length,
      provider,
      model,
    };
  });
}
export async function verificationBudgetStatus(directory = resolve(".local")) {
  const location = paths(directory);
  const grant = await readGrant(location);
  const budget = await readBudget(location, grant);
  return {
    grantId: location.selected,
    limit: LIMIT,
    attempts: budget.attempts.length,
    priorAttempts: grant?.priorAttempts ?? 0,
    totalAttempts: budget.attempts.length + (grant?.priorAttempts ?? 0),
    stoppedAfterSuccess: Boolean(budget.validatedSuccess),
    remaining: budget.validatedSuccess ? 0 : LIMIT - budget.attempts.length,
  };
}
export async function verificationAttemptCount(directory = resolve(".local")) {
  return (await verificationBudgetStatus(directory)).attempts;
}
