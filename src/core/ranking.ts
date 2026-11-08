import {
  explanationSchema,
  memorySchema,
  remedies,
  type Decision,
  type Evidence,
  type Explanation,
  type Issue,
  type Policy,
  type PaymentState,
} from "./types";
export function rankRemedies(input: {
  merchantId: string;
  issue: Issue;
  productVersion: string;
  payment: PaymentState;
  policy: Policy;
  evidence: Evidence[];
  supersededIds?: Set<string>;
}): Decision {
  const { policy } = input;
  const allowed =
    input.payment === "verified" &&
    policy.productVersion === input.productVersion
      ? policy.allowed
          .filter((id) =>
            (remedies[id].issues as readonly string[]).includes(input.issue),
          )
          .sort((a, b) => remedies[a].priority - remedies[b].priority)
      : [];
  const seen = new Set<string>();
  const evidence = input.evidence.filter((e) => {
    const parsed = memorySchema.safeParse(e.event);
    if (!parsed.success) return false;
    const m = parsed.data;
    if (
      m.merchantId !== input.merchantId ||
      m.productVersion !== input.productVersion ||
      m.issue !== input.issue ||
      m.policyVersion > policy.version ||
      !allowed.includes(m.remedy) ||
      input.supersededIds?.has(m.logicalEventId) ||
      seen.has(m.attemptId)
    )
      return false;
    seen.add(m.attemptId);
    return true;
  });
  const scores = allowed
    .map((remedy) => {
      const examples = evidence.filter((e) => e.event.remedy === remedy);
      const successes = examples.filter(
          (e) => e.event.outcome === "resolved",
        ).length,
        failures = examples.length - successes;
      return {
        remedy,
        successes,
        failures,
        score: (successes + 1) / (successes + failures + 2),
        evidenceIds: examples.map((e) => e.event.logicalEventId),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        remedies[a.remedy].priority - remedies[b.remedy].priority,
    );
  const baseline = allowed[0] ?? null;
  // One observation can inform the operator, but does not change the default action by itself.
  const chosen = evidence.length >= 2 ? (scores[0]?.remedy ?? null) : baseline;
  return {
    baseline,
    chosen,
    scores,
    evidence,
    policyVersion: policy.version,
    limitation:
      evidence.length < 2
        ? "Insufficient experience: the policy baseline is retained until at least two compatible attempts are recalled."
        : "Heuristic estimate from retrieved eligible examples only; not a calibrated probability or the complete merchant history.",
  };
}
export function validateExplanation(
  value: unknown,
  decision: Decision,
): Explanation {
  const parsed = explanationSchema.parse(value);
  const ids = new Set(decision.evidence.map((e) => e.event.logicalEventId));
  if (
    parsed.remedyId !== decision.chosen ||
    parsed.policyVersion !== decision.policyVersion ||
    parsed.memoryIds.some((id) => !ids.has(id))
  )
    throw new Error(
      "Explanation contains an unauthorized action, policy or citation",
    );
  if (decision.evidence.length && !parsed.memoryIds.length)
    throw new Error("Explanation omitted recalled evidence");
  return parsed;
}
export function templateExplanation(decision: Decision): Explanation {
  const chosen = decision.chosen ? remedies[decision.chosen] : null;
  return {
    remedyId: decision.chosen,
    customerDraft: chosen
      ? `Thanks for your patience. Your payment has been checked. With your approval, our support team will ${chosen.label.toLowerCase()}.`
      : "We need to review the order and payment evidence before proposing an access action.",
    operatorExplanation: chosen
      ? `${chosen.description} Current policy permits this action. ${decision.limitation}`
      : "No eligible action is available. Verify the payment and current product policy, or escalate.",
    memoryIds: decision.evidence.map((e) => e.event.logicalEventId),
    policyVersion: decision.policyVersion,
    memoryDifference:
      decision.chosen !== decision.baseline
        ? `Prior confirmed outcomes moved the recommendation from ${remedies[decision.baseline!].label.toLowerCase()} to ${chosen!.label.toLowerCase()}.`
        : "Memory did not change the policy baseline for this case.",
    missingInformation: chosen
      ? []
      : ["Verified payment or compatible product policy"],
    escalationReason: chosen
      ? null
      : "Payment or policy eligibility requires operator review.",
  };
}
