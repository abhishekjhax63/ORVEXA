import { describe, expect, it } from "vitest";

import {
  DEFAULT_ESCALATION_POLICY,
  ENGLISH_SAFETY_LINE,
  applySafetyPolicy,
  buildRedFlagEscalation,
  detectRedFlags,
  isUrgencyBand,
  maxUrgency,
  medicationRequested,
  reviewRequired,
  safetyLineFor,
  urgencyRank,
  type AiEscalationPolicy,
  type AiTriageDraft,
} from "@/lib/ai/safety";

/** A valid model draft; override only the field a test cares about. */
function draft(overrides: Partial<AiTriageDraft> = {}): AiTriageDraft {
  return {
    summary: "Preliminary explanation.",
    possibleCauses: [],
    warningSigns: [],
    recommendedSteps: [],
    clarifyingQuestions: [],
    selfCareGuidance: null,
    uncertaintyNotes: "What a description cannot distinguish on its own.",
    urgency: "SELF_CARE",
    urgencyRationale: "Nothing concerning in the description.",
    mediaObservations: [],
    medicationRequest: false,
    ...overrides,
  };
}

describe("urgency ordering", () => {
  it("ranks bands from self-care up to emergency", () => {
    expect(urgencyRank("SELF_CARE")).toBeLessThan(urgencyRank("ROUTINE"));
    expect(urgencyRank("ROUTINE")).toBeLessThan(urgencyRank("SOON"));
    expect(urgencyRank("SOON")).toBeLessThan(urgencyRank("URGENT"));
    expect(urgencyRank("URGENT")).toBeLessThan(urgencyRank("EMERGENCY"));
  });

  it("maxUrgency returns the more severe band", () => {
    expect(maxUrgency("SELF_CARE", "EMERGENCY")).toBe("EMERGENCY");
    expect(maxUrgency("EMERGENCY", "SELF_CARE")).toBe("EMERGENCY");
    expect(maxUrgency("URGENT", "URGENT")).toBe("URGENT");
  });

  it("recognises only the known urgency bands", () => {
    expect(isUrgencyBand("EMERGENCY")).toBe(true);
    expect(isUrgencyBand("CRITICAL")).toBe(false);
  });
});

describe("reviewRequired", () => {
  it("requires review at or above the configured band", () => {
    // DEFAULT_ESCALATION_POLICY.reviewRequiredAtOrAbove is URGENT.
    expect(reviewRequired(DEFAULT_ESCALATION_POLICY, "URGENT")).toBe(true);
    expect(reviewRequired(DEFAULT_ESCALATION_POLICY, "EMERGENCY")).toBe(true);
    expect(reviewRequired(DEFAULT_ESCALATION_POLICY, "SOON")).toBe(false);
  });
});

describe("detectRedFlags", () => {
  it("matches a red-flag description", () => {
    const hits = detectRedFlags("I have crushing chest pain going into my left arm");
    expect(hits.map((hit) => hit.code)).toContain("CHEST_PAIN");
  });

  it("returns nothing for an ordinary description", () => {
    expect(detectRedFlags("I have a runny nose and a mild sore throat")).toEqual([]);
  });
});

describe("medicationRequested", () => {
  it("detects a request for a medicine", () => {
    expect(medicationRequested("which medicine should I take for this?")).toBe(true);
  });

  it("does not fire on an ordinary symptom description", () => {
    expect(medicationRequested("I have had a headache since yesterday")).toBe(false);
  });
});

describe("applySafetyPolicy — red-flag guidance is never downgraded", () => {
  it("raises a reassuring model band to the red-flag floor", () => {
    const outcome = applySafetyPolicy({
      request: { statement: "I have crushing chest pain going into my left arm", attachments: [], language: "en" },
      draft: draft({ urgency: "SELF_CARE" }),
      policy: DEFAULT_ESCALATION_POLICY,
    });

    expect(outcome.modelUrgency).toBe("SELF_CARE");
    expect(outcome.urgency).toBe("EMERGENCY");
    expect(outcome.escalated).toBe(true);
    expect(outcome.overrideReason).not.toBeNull();
    expect(outcome.redFlags.map((flag) => flag.code)).toContain("CHEST_PAIN");
  });

  it("never lowers a model band that is already higher than the floor", () => {
    const policy: AiEscalationPolicy = { ...DEFAULT_ESCALATION_POLICY, redFlagFloorBand: "SOON" };
    const outcome = applySafetyPolicy({
      request: { statement: "I have crushing chest pain", attachments: [], language: "en" },
      draft: draft({ urgency: "EMERGENCY" }),
      policy,
    });

    expect(outcome.modelUrgency).toBe("EMERGENCY");
    expect(outcome.urgency).toBe("EMERGENCY");
  });

  it("leaves a model band alone when there is no red flag", () => {
    const outcome = applySafetyPolicy({
      request: { statement: "I have a mild rash on my arm", attachments: [], language: "en" },
      draft: draft({ urgency: "ROUTINE" }),
      policy: DEFAULT_ESCALATION_POLICY,
    });

    expect(outcome.redFlags).toEqual([]);
    expect(outcome.urgency).toBe("ROUTINE");
  });

  it("raises urgency to at least URGENT when a medication is requested", () => {
    const outcome = applySafetyPolicy({
      request: { statement: "which medicine should I take for my headache?", attachments: [], language: "en" },
      draft: draft({ urgency: "SELF_CARE" }),
      policy: DEFAULT_ESCALATION_POLICY,
    });

    expect(outcome.medicationRefused).toBe(true);
    expect(outcome.urgency).toBe("URGENT");
  });
});

describe("safetyLineFor", () => {
  it("includes the fixed safety line when a red flag is present", () => {
    expect(safetyLineFor({ urgency: "SELF_CARE", language: "en", redFlagCount: 1 })).toBe(ENGLISH_SAFETY_LINE);
  });

  it("includes the fixed safety line for an urgent band", () => {
    expect(safetyLineFor({ urgency: "URGENT", language: "en", redFlagCount: 0 })).toBe(ENGLISH_SAFETY_LINE);
  });

  it("includes the English line for a non-English turn by default", () => {
    expect(safetyLineFor({ urgency: "SELF_CARE", language: "hi", redFlagCount: 0 })).toBe(ENGLISH_SAFETY_LINE);
  });

  it("omits the line for a low-urgency English turn", () => {
    expect(safetyLineFor({ urgency: "SELF_CARE", language: "en", redFlagCount: 0 })).toBeNull();
  });
});

describe("buildRedFlagEscalation", () => {
  it("builds an emergency draft from red flags alone", () => {
    const redFlags = detectRedFlags("I have crushing chest pain", "your description");
    const result = buildRedFlagEscalation({ redFlags, policy: DEFAULT_ESCALATION_POLICY, language: "en" });

    expect(result.urgency).toBe("EMERGENCY");
    expect(result.urgency).toBe(DEFAULT_ESCALATION_POLICY.redFlagFloorBand);
    expect(result.warningSigns).toHaveLength(redFlags.length);
    expect(result.recommendedSteps.length).toBeGreaterThan(0);
  });
});
