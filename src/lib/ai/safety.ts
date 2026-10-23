import type { AiUrgencyBand } from "@prisma/client";

import { AI_LIMITATIONS_NOTICE, SAFETY_POLICY_VERSION } from "@/lib/ai/capabilities";
import type { AiAttachment, AiTriageDraft, AiTriageRequest } from "@/lib/ai/provider";

/**
 * The safety layer.
 *
 * This module is the reason a model's answer is never shown to a user directly.
 * It is pure, deterministic and unit-tested, and it has three jobs:
 *
 *  1. **Red flags win.** A lexicon matched against the user's own words imposes a
 *     floor on urgency. The floor is applied with `maxUrgency`, so a reassuring
 *     model answer can only ever be raised, never lowered. There is no code path
 *     in this repository that lets a model talk a red flag down.
 *  2. **No prescribing.** Any dosage, drug regimen or "take X mg" in the model's
 *     output is removed and replaced with a referral to a clinician, and a
 *     detected request for medication sets a flag that the UI must surface.
 *  3. **Uncertainty is mandatory.** An assessment without limitations text is not
 *     a valid assessment, so the text is attached by this module rather than
 *     trusted to the model.
 *
 * It is deliberately free of `server-only` and of any network call: the same
 * functions run on the server before anything is stored, and in tests.
 */

// ---------------------------------------------------------------------------
// Urgency ordering
// ---------------------------------------------------------------------------

const URGENCY_ORDER: readonly AiUrgencyBand[] = ["SELF_CARE", "ROUTINE", "SOON", "URGENT", "EMERGENCY"];

const URGENCY_RANK: Record<AiUrgencyBand, number> = {
  SELF_CARE: 0,
  ROUTINE: 1,
  SOON: 2,
  URGENT: 3,
  EMERGENCY: 4,
};

export function urgencyRank(band: AiUrgencyBand): number {
  return URGENCY_RANK[band];
}

/** Returns the more severe of two bands. Used to raise urgency, never to lower it. */
export function maxUrgency(a: AiUrgencyBand, b: AiUrgencyBand): AiUrgencyBand {
  return URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;
}

export function isUrgencyBand(value: string): value is AiUrgencyBand {
  return (URGENCY_ORDER as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Escalation policy
// ---------------------------------------------------------------------------

export type AiEscalationPolicy = {
  /**
   * The lowest band a deterministic red flag can impose.
   *
   * Defaults to EMERGENCY. Because it is combined with `maxUrgency`, this is a
   * floor and not a suggestion: the model's own band is consulted only to see
   * whether it was *higher*.
   */
  redFlagFloorBand: AiUrgencyBand;
  /** Band at or above which an assessment is flagged as needing a clinician's eyes. */
  reviewRequiredAtOrAbove: AiUrgencyBand;
  /** Whether a clinician must respond before a flagged assessment can be shared. */
  blockShareUntilReviewed: boolean;
  /** Whether the emergency route (dial actions + nearest facilities) is offered automatically. */
  autoOfferEmergencyRoute: boolean;
  /** Whether an English safety line is always appended, whatever the chosen language. */
  alwaysIncludeEnglishSafetyLine: boolean;
};

/**
 * Conservative defaults.
 *
 * Shipping a *less* cautious default would mean the safe configuration is the
 * one somebody has to remember to turn on. The environment variables in
 * `src/lib/ai/config.ts` can relax these, and doing so is an explicit act.
 */
export const DEFAULT_ESCALATION_POLICY: AiEscalationPolicy = {
  redFlagFloorBand: "EMERGENCY",
  reviewRequiredAtOrAbove: "URGENT",
  blockShareUntilReviewed: false,
  autoOfferEmergencyRoute: true,
  alwaysIncludeEnglishSafetyLine: true,
};

/** Clinical review is required for anything at or above the configured band. */
export function reviewRequired(policy: AiEscalationPolicy, urgency: AiUrgencyBand): boolean {
  return urgencyRank(urgency) >= urgencyRank(policy.reviewRequiredAtOrAbove);
}

// ---------------------------------------------------------------------------
// Red-flag lexicon
// ---------------------------------------------------------------------------

export type RedFlagDefinition = {
  code: string;
  /** Shown to the user. Written as the symptom, not as a condition name. */
  label: string;
  /** Why this counts as a red flag, for the audit trail and the reviewer. */
  rationale: string;
  patterns: RegExp[];
};

/**
 * Red-flag lexicon.
 *
 * Two design notes that matter more than the individual entries:
 *
 *  - The patterns match *descriptions*, not diagnoses. "Crushing chest pain
 *    going into my left arm" is matched; the word "angina" is deliberately not,
 *    because a patient using a diagnostic label they read somewhere is not the
 *    same evidence as a patient describing what is happening to them.
 *  - The lexicon is tuned to over-trigger rather than under-trigger. A false
 *    positive sends somebody to an emergency department that did not strictly
 *    need them; a false negative keeps somebody at home during a heart attack.
 *    The costs are not symmetric, and the code reflects that.
 */
export const RED_FLAGS: readonly RedFlagDefinition[] = [
  {
    code: "CHEST_PAIN",
    label: "Chest pain or pressure",
    rationale: "Chest pain or pressure can be a heart attack or another immediately life-threatening event.",
    patterns: [
      /\bcrushing\b[^.]{0,40}\bchest\b/,
      /\bchest\b[^.]{0,30}\b(pain|pressure|tight|tightness|heavy|squeez|crush)\w*/,
      /\b(pain|pressure|tightness)\b[^.]{0,30}\bchest\b/,
      /\bchest pain\b/,
      /\bheart attack\b/,
    ],
  },
  {
    code: "CHEST_PAIN_RADIATING",
    label: "Chest pain spreading to the arm, jaw, back or neck",
    rationale: "Radiating chest pain is a classic presentation of an acute cardiac event.",
    patterns: [
      /\bchest\b[^.]{0,60}\b(arm|jaw|neck|back|shoulder|left arm)\b/,
      /\b(pain|pressure)\b[^.]{0,40}\b(left arm|jaw|between the shoulders|down my arm)\b/,
    ],
  },
  {
    code: "BREATHING_DIFFICULTY",
    label: "Severe difficulty breathing",
    rationale: "Severe breathlessness is an emergency regardless of cause.",
    patterns: [
      /\b(can'?t|cannot|can not|unable to|struggling to|hard to|difficulty)\b[^.]{0,20}\b(breathe|breathing|catch my breath)\b/,
      /\b(short|shortness) of breath\b/,
      /\bbreathless\b/,
      /\b(gasping|suffocating|blue lips|turning blue|turning blue)\b/,
      /\bwheez\w*\b[^.]{0,30}\b(can'?t speak|struggling|severe)\b/,
    ],
  },
  {
    code: "SIGNS_OF_STROKE",
    label: "Sudden weakness, numbness, slurred speech or facial droop",
    rationale: "Stroke is time-critical; these are the BE-FAST warning signs.",
    patterns: [
      /\b(slurr\w*|slurred) (speech|words)\b/,
      /\bspeech\b[^.]{0,20}\b(slurr\w*|garbled|not clear|mumbled)\b/,
      /\bface\b[^.]{0,20}\b(droop\w*|drooping|dropped|numb|one side)\b/,
      /\b(one side|left side|right side)\b[^.]{0,30}\b(weak\w*|numb\w*|can'?t move|paralys\w*)\b/,
      /\b(sudden|suddenly)\b[^.]{0,30}\b(weak\w*|numb\w*|can'?t move|vision loss|confus\w*)\b/,
      /\b(stroke|paralysis|hemiplegia)\b/,
    ],
  },
  {
    code: "VISION_LOSS",
    label: "Sudden loss or change of vision",
    rationale: "Sudden visual loss can be stroke, retinal artery occlusion or acute glaucoma.",
    patterns: [
      /\b(sudden|suddenly)\b[^.]{0,30}\b(blurr\w*|loss of vision|can'?t see|blind|black spot)\b/,
      /\b(lost|losing) (my )?(vision|sight)\b/,
    ],
  },
  {
    code: "UNCONTROLLED_BLEEDING",
    label: "Bleeding that will not stop",
    rationale: "Uncontrolled bleeding leads to shock within minutes.",
    patterns: [
      /\bbleed\w*\b[^.]{0,30}\b(won'?t stop|not stopping|heavily|heavier|soaking|a lot)\b/,
      /\b(won'?t stop|not stopping)\b[^.]{0,20}\bbleed\w*\b/,
      /\bvomit\w*\b[^.]{0,20}\bblood\b/,
      /\b(coughing|vomiting|pooping|stool)\b[^.]{0,20}\bblood\b/,
      /\bblood in (my )?(stool|vomit|urine|urine)\b/,
      /\bhaemorrhag\w*\b|\bhemorrhag\w*\b/,
    ],
  },
  {
    code: "LOSS_OF_CONSCIOUSNESS",
    label: "Fainting, collapse or loss of consciousness",
    rationale: "Collapse can indicate arrhythmia, stroke, haemorrhage or sepsis.",
    patterns: [
      /\b(faint\w*|passed out|passing out|unconscious|unresponsive|collaps\w*|black(ed)? out)\b/,
      /\bnot (waking|rousable|responding)\b/,
      /\bseizure\b|\bfit\b|\bconvuls\w*\b/,
    ],
  },
  {
    code: "HEAD_INJURY",
    label: "Head injury with confusion, vomiting or drowsiness",
    rationale: "These are signs of raised intracranial pressure after head trauma.",
    patterns: [
      /\b(head|skull)\b[^.]{0,40}\b(injur\w*|hit|banged|struck|trauma|fall|fell)\b/,
      /\b(hit|banged|struck|injured)\b[^.]{0,20}\bmy head\b/,
      /\b(after|since)\b[^.]{0,30}\b(fall|hit my head)\b[^.]{0,40}\b(vomit\w*|confus\w*|sleep\w*|drowsi\w*|blurr\w*)\b/,
    ],
  },
  {
    code: "SEVERE_ALLERGIC_REACTION",
    label: "Swelling of the face, lips or throat after a bite, food or medicine",
    rationale: "Anaphylaxis progresses within minutes and needs adrenaline.",
    patterns: [
      /\b(swell\w*|swollen)\b[^.]{0,30}\b(throat|lip|tongue|face)\b/,
      /\b(throat|lip|tongue|face)\b[^.]{0,25}\b(swell\w*|swollen|closing)\b/,
      /\b(anaphylax\w*|throat closing|closing up)\b/,
      /\b(rash|hives|welts)\b[^.]{0,40}\b(can'?t breathe|throat|swelling|dizzy)\b/,
    ],
  },
  {
    code: "SUICIDAL_IDEATION",
    label: "Thoughts of ending your life or of harming yourself",
    rationale: "Active suicidal intent needs immediate human contact, not an app.",
    patterns: [
      /\b(kill|killing|end(ing)?) (myself|my life|it all)\b/,
      /\bsuicid\w*\b/,
      /\b(no reason|don'?t want) (to live|to be here|to go on)\b/,
      /\bharm (myself|me)\b/,
      /\bself[- ]harm\w*\b/,
      /\boverdose\b[^.]{0,20}\b(myself|deliberate|on purpose|to die)\b/,
    ],
  },
  {
    code: "SEVERE_ABDOMINAL_PAIN",
    label: "Sudden severe abdominal pain",
    rationale: "Sudden severe abdominal pain can be a perforated viscus, torsion or a ruptured aneurysm.",
    patterns: [
      /\b(severe|worst|unbearable|excruciating|agonising|agonizing)\b[^.]{0,30}\b(stomach|abdom\w*|belly|tummy)\b/,
      /\b(stomach|abdom\w*|belly)\b[^.]{0,30}\b(severe|unbearable|excruciating|worst pain|agonis\w*)\b/,
      /\bsudden\b[^.]{0,25}\b(stomach|abdominal|belly)\b[^.]{0,20}\bpain\b/,
    ],
  },
  {
    code: "PREGNANCY_BLEEDING",
    label: "Bleeding, severe pain or reduced movement during pregnancy",
    rationale: "These can indicate ectopic pregnancy, abruption or fetal distress.",
    patterns: [
      /\b(pregnan\w*|expecting)\b[^.]{0,60}\b(bleed\w*|blood|cramp\w*|severe pain|no movement|stopped moving|reduced movement)\b/,
      /\b(bleed\w*|no movement|reduced movement|severe pain)\b[^.]{0,50}\b(pregnan\w*)\b/,
    ],
  },
  {
    code: "POISONING_OR_OVERDOSE",
    label: "Swallowed a poison, chemical or too much medicine",
    rationale: "Time-critical toxicity, often needing an antidote.",
    patterns: [
      /\b(swallow\w*|drank|ate|took)\b[^.]{0,30}\b(poison|pesticide|kerosene|bleach|acid|chemical|phenyl|rat poison|unknown tablet)\b/,
      /\b(overdose|too many tablets|too much (medicine|paracetamol|panadol|acetaminophen))\b/,
      /\bsnake ?bite\b|\bscorpion\b|\bbite\b[^.]{0,25}\b(snake|scorpion)\b/,
    ],
  },
  {
    code: "MAJOR_BURNS",
    label: "Large, deep or facial burns, or burns around the airway",
    rationale: "Major burns and airway involvement need emergency resuscitation.",
    patterns: [
      /\bburn\w*\b[^.]{0,40}\b(face|neck|throat|chest|airway|large|deep|most of|whole)\b/,
      /\b(face|neck|throat|airway)\b[^.]{0,25}\bburn\w*\b/,
      /\b(electric|chemical|acid)\b[^.]{0,20}\bburn\w*\b/,
      /\b(smoke|soot)\b[^.]{0,30}\b(inhal\w*|breath\w*|voice|hoarse)\b/,
    ],
  },
  {
    code: "INFANT_OR_NEONATE_DANGER",
    label: "A baby under three months with fever, poor feeding or drowsiness",
    rationale: "Neonatal fever needs urgent assessment; deterioration is fast.",
    patterns: [
      /\b(\d+\s*(day|week)s? old|newborn|neonat\w*|infant|baby)\b[^.]{0,50}\b(fever|temperature|not feeding|poor feeding|floppy|drowsi\w*|lethargic|limp)\b/,
      /\b(under (three|3) months|below (three|3) months)\b[^.]{0,50}\b(fever|not feeding|drowsi\w*|floppy)\b/,
    ],
  },
  {
    code: "SEVERE_DEHYDRATION",
    label: "Unable to keep fluids down, very little urine, or drowsy",
    rationale: "Severe dehydration and shock need intravenous fluids.",
    patterns: [
      /\b(no urine|not passing urine|no pee|no wet nappies|no wet diapers)\b/,
      /\b(can'?t keep (anything|water|fluids) down|vomit\w*\b[^.]{0,30}\b(everything|non[- ]stop|all day))\b/,
      /\b(severe|very) dehydrat\w*\b/,
      /\b(sunken eyes|no tears|dry mouth)\b[^.]{0,40}\b(drowsi\w*|dizzy|confus\w*|limp)\b/,
    ],
  },
  {
    code: "SEVERE_INFECTION",
    label: "Fever with confusion, a stiff neck, a rash that does not fade, or very low urine",
    rationale: "These are sepsis and meningococcal warning signs.",
    patterns: [
      /\bfever\b[^.]{0,50}\b(confus\w*|stiff neck|neck stiffness|rash|won'?t wake|very sleepy|shivering|rigors)\b/,
      /\b(stiff neck|neck stiffness)\b[^.]{0,40}\bfever\b/,
      /\brash\b[^.]{0,40}\b(does not fade|doesn'?t fade|not fading|glass test|pressure)\b/,
      /\bsepsis\b|\bseptic\w*\b/,
    ],
  },
  {
    code: "SUDDEN_SEVERE_HEADACHE",
    label: "The worst headache of your life, starting suddenly",
    rationale: "Thunderclap headache suggests subarachnoid haemorrhage.",
    patterns: [
      /\bworst headache\b/,
      /\bheadache\b[^.]{0,40}\b(worst ever|worst of my life|sudden|like being hit|thunderclap)\b/,
      /\b(sudden|suddenly)\b[^.]{0,30}\b(worst)\b[^.]{0,20}\bheadache\b/,
      /\bthunderclap headache\b/,
    ],
  },
  {
    code: "LIMB_ISCHAEMIA",
    label: "A limb that is suddenly cold, pale, blue or numb",
    rationale: "Acute limb ischaemia needs surgery within hours.",
    patterns: [
      /\b(arm|leg|hand|foot|toe|finger)\b[^.]{0,40}\b(suddenly|went|turned|turning)\b[^.]{0,25}\b(cold|white|pale|blue|grey|numb|no pulse)\b/,
      /\b(cold|white|pale|blue|numb)\b[^.]{0,25}\b(arm|leg|foot|toe|finger)\b[^.]{0,20}\b(sudden\w*)\b/,
    ],
  },
  {
    code: "TESTICULAR_TORSION",
    label: "Sudden severe pain in the testicle",
    rationale: "Torsion loses the testis after roughly six hours.",
    patterns: [/\b(sudden|severe)\b[^.]{0,30}\b(testicle|testicular|scrotum|scrotal)\b[^.]{0,20}\bpain\b/, /\btesticular torsion\b/],
  },
  {
    code: "SPINAL_CORD_SIGNS",
    label: "New weakness in both legs, or loss of bladder or bowel control",
    rationale: "Cauda equina syndrome causes permanent deficit if it is not decompressed urgently.",
    patterns: [
      /\b(can'?t|cannot|unable to)\b[^.]{0,25}\b(control|hold)\b[^.]{0,20}\b(bladder|urine|pee|bowel|stool|poo)\b/,
      /\b(no control over)\b[^.]{0,25}\b(bladder|bowel)\b/,
      /\b(numb (crotch|saddle|groin|inner thighs)|saddle numbness)\b/,
      /\b(both legs)\b[^.]{0,30}\b(weak\w*|numb\w*|gave way|can'?t walk)\b/,
    ],
  },
];

export type RedFlagHit = {
  code: string;
  label: string;
  rationale: string;
  /** The phrase that matched, so a reviewer can see the evidence. */
  evidence: string;
};

/**
 * Match the lexicon against free text.
 *
 * Normalising rather than stemming on purpose: a stemming library would be
 * another dependency that can change behaviour silently between releases, and
 * the lexicon already lists the variants it cares about.
 */
export function detectRedFlags(text: string, source = "user"): RedFlagHit[] {
  const normalised = text.toLowerCase().replace(/\s+/g, " ");
  const hits: RedFlagHit[] = [];
  for (const flag of RED_FLAGS) {
    for (const pattern of flag.patterns) {
      const match = pattern.exec(normalised);
      if (!match) continue;
      hits.push({
        code: flag.code,
        label: flag.label,
        rationale: flag.rationale,
        evidence: `${source}: “…${match[0].trim()}…”`,
      });
      break;
    }
  }
  return hits;
}

/**
 * Red flags from the whole turn: what the user typed, what their voice note
 * said, and any text inside an uploaded report. A laboratory report that itself
 * says "critical potassium" is as much a warning sign as the user's sentence.
 */
export function redFlagsForRequest(request: Pick<AiTriageRequest, "statement" | "attachments">): RedFlagHit[] {
  const parts: { text: string; source: string }[] = [{ text: request.statement, source: "your description" }];
  for (const attachment of request.attachments) {
    if (attachment.kind === "DOCUMENT" && attachment.text) parts.push({ text: attachment.text, source: attachment.label });
    if (attachment.kind === "AUDIO") parts.push({ text: attachment.transcript, source: "your voice note" });
  }

  const seen = new Set<string>();
  const hits: RedFlagHit[] = [];
  for (const part of parts) {
    for (const hit of detectRedFlags(part.text, part.source)) {
      if (seen.has(hit.code)) continue;
      seen.add(hit.code);
      hits.push(hit);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Prescribing guard
// ---------------------------------------------------------------------------

/**
 * Dosage and regimen patterns.
 *
 * These remove the *shape* of a prescription rather than screening for drug
 * names. A brand-name blocklist is unmaintainable and, worse, misses the
 * combination products it does not list — whereas every prescription the brief
 * rules out ("500 mg twice daily") matches one of these.
 */
const DOSAGE_PATTERNS: readonly RegExp[] = [
  /\b\d+(\.\d+)?\s*(mg|mcg|µg|ug|g|ml|mL|iu|units?|tablets?|capsules?|drops?|puffs?|sprays?|sachets?)\b/i,
  /\b(take|give|use|start|apply)\b[^.]{0,30}\b(twice|thrice|once|every \d+ ?(hours?|h)|daily|bd|tds|qid|od|sos|prn)\b/i,
  /\b(twice|thrice|once|every \d+ ?(hours?|h))\b[^.]{0,30}\b(a day|daily|per day)\b/i,
];

const PRESCRIPTIVE_PATTERNS: readonly RegExp[] = [
  /\b(i (recommend|suggest|advise)|you should (take|start|use)|start (him|her|them|yourself)? ?on)\b/i,
  /\b(prescrib\w*|antibiotic\w*|steroid course|painkiller\w*|analgesic\w*)\b/i,
  /\b(dose|dosage|dosing)\b/i,
];

export const MEDICATION_REFUSAL_TEXT =
  "The assistant cannot recommend a medicine, a dose or a treatment plan. Deciding what to take needs a qualified " +
  "clinician who can examine you, check your other medicines and your allergies, and take responsibility for the " +
  "prescription. Please ask a doctor or pharmacist. If you have already taken too much of something, treat that as an " +
  "emergency and call for help now.";

/** True when the user appears to be asking for a medicine, dose or regimen. */
export function medicationRequested(text: string): boolean {
  const normalised = text.toLowerCase();
  if (/\b(prescrib\w*|what (should|can) i take|which (medicine|tablet|drug)|name of (a )?(medicine|tablet)|dose|dosage|how many (mg|tablets)|how much (mg|medicine))\b/.test(normalised)) {
    return true;
  }
  return DOSAGE_PATTERNS.some((pattern) => pattern.test(normalised)) && /\b(take|use|give|start|prescrib\w*|medicine|tablet|drug)\b/.test(normalised);
}

/**
 * Remove prescriptive content from a draft.
 *
 * Returns the cleaned draft plus the sentences that were removed, so the audit
 * trail can record that a strip happened without storing the removed text.
 */
export function stripPrescriptiveContent(draft: AiTriageDraft): { draft: AiTriageDraft; removedCount: number } {
  let removedCount = 0;

  const cleanLine = (value: string): string => {
    const sentences = value.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((sentence) => {
      const prescriptive =
        DOSAGE_PATTERNS.some((pattern) => pattern.test(sentence)) || PRESCRIPTIVE_PATTERNS.some((pattern) => pattern.test(sentence));
      if (prescriptive) removedCount += 1;
      return !prescriptive;
    });
    return kept.join(" ").trim();
  };

  const possibleCauses = draft.possibleCauses.map((cause) => ({ ...cause, note: cleanLine(cause.note) }));
  const recommendedSteps = draft.recommendedSteps.map((step) => ({ ...step, detail: cleanLine(step.detail) }));
  // A self-care line whose only content was a dose is dropped entirely rather
  // than kept in its original form.
  const cleanedSelfCare = draft.selfCareGuidance === null ? null : cleanLine(draft.selfCareGuidance);

  return {
    draft: {
      ...draft,
      possibleCauses,
      recommendedSteps,
      selfCareGuidance: cleanedSelfCare && cleanedSelfCare.length > 0 ? cleanedSelfCare : null,
      uncertaintyNotes: cleanLine(draft.uncertaintyNotes) || draft.uncertaintyNotes,
    },
    removedCount,
  };
}

// ---------------------------------------------------------------------------
// Applying the policy
// ---------------------------------------------------------------------------

export type SafetyOutcome = {
  /** The band that will actually be stored and shown. */
  urgency: AiUrgencyBand;
  /** The model's own band, kept so an override is visible in the record. */
  modelUrgency: AiUrgencyBand;
  /** True when the deterministic layer raised the band or a red flag was present. */
  escalated: boolean;
  overrideReason: string | null;
  redFlags: RedFlagHit[];
  medicationRefused: boolean;
  clinicalReviewRequired: boolean;
  limitationsNotice: string;
  /** Appended to the rendered assessment in every language. */
  safetyLine: string | null;
  draft: AiTriageDraft;
  safetyPolicyVersion: string;
  /** Count of prescriptive sentences removed from the model output. */
  prescriptiveLinesRemoved: number;
};

export const ENGLISH_SAFETY_LINE =
  "This is not a diagnosis. If this is happening now, or gets worse, call emergency services or go to the nearest " +
  "emergency department. Do not wait for this assistant to reply.";

/**
 * Whether a turn carries the fixed safety line.
 *
 * Exported as a function rather than left inline because there is no column for
 * it: a saved assessment is re-rendered from its urgency, language and red-flag
 * codes, and recomputing here keeps the wording identical to what was shown
 * instead of leaving old assessments without the warning. The recomputation errs
 * toward *including* the line, which is the safe direction, and the row records
 * `safetyPolicyVersion` so the policy that was live is still auditable.
 */
export function safetyLineFor(input: {
  urgency: AiUrgencyBand;
  language: string;
  redFlagCount: number;
  policy?: AiEscalationPolicy;
}): string | null {
  const policy = input.policy ?? DEFAULT_ESCALATION_POLICY;
  if (input.redFlagCount > 0 || urgencyRank(input.urgency) >= urgencyRank("URGENT")) return ENGLISH_SAFETY_LINE;
  if (policy.alwaysIncludeEnglishSafetyLine && input.language !== "en") return ENGLISH_SAFETY_LINE;
  return null;
}

export type SafetyInput = {
  request: Pick<AiTriageRequest, "statement" | "attachments" | "language">;
  draft: AiTriageDraft;
  policy: AiEscalationPolicy;
};

/**
 * Run the full safety layer over a model draft.
 *
 * Order matters: prescriptive content is stripped first, then the deterministic
 * red flags are matched, then the two urgency values are reconciled with
 * `maxUrgency`. Nothing here reads the model's own confidence in order to decide
 * whether to escalate — a red flag is a red flag whether the model was sure or
 * not.
 */
export function applySafetyPolicy(input: SafetyInput): SafetyOutcome {
  const { request, policy } = input;
  const redFlags = redFlagsForRequest(request);
  const stripped = stripPrescriptiveContent(input.draft);

  const modelUrgency = stripped.draft.urgency;
  const declaredMedicationRequest = stripped.draft.medicationRequest || medicationRequested(request.statement);
  const medicationRefused = declaredMedicationRequest || stripped.removedCount > 0;

  const flagFloor: AiUrgencyBand | null = redFlags.length > 0 ? policy.redFlagFloorBand : null;
  let urgency = flagFloor ? maxUrgency(modelUrgency, flagFloor) : modelUrgency;
  let overrideReason: string | null = null;

  if (flagFloor && urgencyRank(flagFloor) > urgencyRank(modelUrgency)) {
    overrideReason = `The assistant suggested ${modelUrgency.toLowerCase().replace("_", " ")}, but the description contains a red flag (${redFlags
      .map((flag) => flag.label)
      .join("; ")}). The urgency was raised to ${urgency.toLowerCase()} and the model's suggestion was not used.`;
  }

  if (medicationRefused) {
    // A refusal is not a reason to lower urgency, but a medication request in an
    // emergency still needs at least the urgent band.
    urgency = maxUrgency(urgency, "URGENT");
    overrideReason =
      overrideReason ??
      "The message asked for a medicine or a dose. The request was declined and a clinician was recommended instead.";
  }

  const escalated = redFlags.length > 0 || urgencyRank(urgency) >= urgencyRank(policy.reviewRequiredAtOrAbove);

  return {
    urgency,
    modelUrgency,
    escalated,
    overrideReason,
    redFlags,
    medicationRefused,
    clinicalReviewRequired: reviewRequired(policy, urgency),
    limitationsNotice: AI_LIMITATIONS_NOTICE,
    safetyLine: safetyLineFor({ urgency, language: request.language, redFlagCount: redFlags.length, policy }),
    draft: stripped.draft,
    safetyPolicyVersion: SAFETY_POLICY_VERSION,
    prescriptiveLinesRemoved: stripped.removedCount,
  };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

export type PromptAttachmentNotes = { label: string; kind: AiAttachment["kind"]; analysed: boolean };

/**
 * The system prompt.
 *
 * The hard rules are stated in the prompt *and* enforced in code above. The
 * prompt exists to keep the model's output usable; the code exists because a
 * prompt is not a control. Anything that must hold is checked after the model
 * replies, not requested before it does.
 */
export function buildTriageSystemPrompt(input: {
  language: string;
  capabilities: readonly string[];
  attachments: PromptAttachmentNotes[];
  followUp: boolean;
}): string {
  const attachmentLines =
    input.attachments.length === 0
      ? "The user has attached nothing."
      : input.attachments
          .map(
            (attachment, index) =>
              `${index}. ${attachment.kind} — "${attachment.label}" — ${
                attachment.analysed ? "provided to you for analysis" : "NOT provided to you; do not speculate about it"
              }`,
          )
          .join("\n");

  return [
    "You are the ORVEXA health assistant. ORVEXA is a healthcare platform in India.",
    "",
    "## What you are",
    "You produce a PRELIMINARY explanation of a symptom description and of any media you were given. You help the user",
    "understand what might be going on, how urgent it is, and what to do next.",
    "",
    "## What you must never do",
    "1. Never state or imply a diagnosis. Use 'may be consistent with', 'one possibility is'. Never 'you have X'.",
    "2. Never name a medicine, a dose, a frequency, a duration or a treatment regimen. If asked, say plainly that",
    "   prescribing needs a qualified clinician, and direct the user to a doctor or pharmacist.",
    "3. Never say anything is 'nothing to worry about', 'harmless', or 'probably fine'. You cannot rule anything out,",
    "   and reassurance is the most dangerous output you can produce.",
    "4. Never claim to have examined the user. You have not touched them, and you have not seen anything you were not sent.",
    "5. Never describe an image or a video beyond what is plainly visible in it. If a photo is unclear, dark, out of focus,",
    "   or shows nothing diagnostic, say exactly that instead of guessing. A normal-looking photo does not mean a normal",
    "   examination, and you must say so when the user seems to be seeking that conclusion.",
    "6. Never ask the user to delay emergency care, whatever they describe.",
    "",
    "## Urgency",
    "Set `urgency` to exactly one of SELF_CARE, ROUTINE, SOON, URGENT, EMERGENCY based on what would be appropriate if",
    "your understanding is correct. Choose the more cautious band when you are unsure. This value is a floor for a",
    "separate safety check, so an under-call will be corrected upward — but never rely on that.",
    "",
    "## Uncertainty",
    "`uncertaintyNotes` is required and must name what you do not know: what you were not told, what a description",
    "cannot distinguish, and what would change your answer. Empty or generic uncertainty text is a failure.",
    "",
    "## Media handling",
    "You may be given photos, transcribed voice notes and text extracted from documents.",
    "For every image you analyse, record one entry in `mediaObservations` with the attachment index, what you can",
    "actually see, and a confidence of low, medium or high. A photo of a rash does not permit you to comment on",
    "anything other than the visible skin. Photographs of a report are read as text, not interpreted as images.",
    attachmentLines,
    "",
    "## Clarifying questions",
    "Ask at most three questions, and only ones that would change your urgency or your advice. Put them in",
    "`clarifyingQuestions` with a `why` that explains what it changes. Do not ask for identifying information.",
    "",
    "## Output",
    `Write every user-facing string in this language: ${input.language}. Do not mix languages unless a symptom name has`,
    "no equivalent. Never include the user's name, address or any identifier in the output.",
    "",
    input.followUp
      ? "This is a follow-up turn. Answer the new question directly and briefly. Do not reissue a full assessment; set the fields you are not changing to their previous meaning."
      : "This is a first assessment. Produce the full structure.",
    `Capabilities available for this request: ${input.capabilities.join(", ") || "none"}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Deterministic escalation
// ---------------------------------------------------------------------------

/**
 * Build an assessment without a model, from the red flags alone.
 *
 * This exists for exactly one situation: the description contains a recognised
 * warning sign *and* the provider call failed or is unconfigured. In that case
 * returning an error would mean a network problem could suppress an emergency
 * warning, which is the one outcome this whole phase is arranged to prevent.
 *
 * The asymmetry is deliberate and is the reason this function has no sibling:
 *
 *  - Red flags present, model unavailable → this deterministic assessment is
 *    shown. Nothing is inferred; every line comes from the matched lexicon.
 *  - No red flags, model unavailable → the turn fails and the user is told the
 *    assistant is unavailable. Nothing is filled in.
 *
 * Guessing a likely cause is a safety problem. Refusing to say "call an
 * ambulance" is a worse one. Only the second is solved here.
 */
export function buildRedFlagEscalation(input: {
  redFlags: readonly RedFlagHit[];
  policy: AiEscalationPolicy;
  language: string;
}): AiTriageDraft {
  const labels = input.redFlags.map((flag) => flag.label);
  const listed = labels.join(", ");

  return {
    summary:
      `What you described includes ${input.redFlags.length === 1 ? "a warning sign" : "warning signs"} of a medical ` +
      `emergency: ${listed}. This response was produced by ORVEXA's fixed warning-sign rules, not by the AI assistant, ` +
      `because the assistant was not available for this message.`,
    possibleCauses: [],
    warningSigns: input.redFlags.map((flag) => ({
      label: flag.label,
      detail: flag.rationale,
    })),
    recommendedSteps: [
      {
        title: "Get emergency help now",
        detail:
          "Call your local emergency number or go to the nearest emergency department. Do not wait to see whether " +
          "the symptoms settle.",
        timeframe: "now",
      },
      {
        title: "Do not wait for a reply from this assistant",
        detail: "The assistant cannot help in an emergency, and nothing here replaces an ambulance or a doctor.",
        timeframe: "now",
      },
    ],
    clarifyingQuestions: [],
    selfCareGuidance: null,
    uncertaintyNotes:
      "No assessment was made of your description beyond matching it against ORVEXA's warning-sign rules, and " +
      `${input.language === "en" ? "this text" : "this text is in English because the assistant, which would have written in your language, was unavailable"}. ` +
      "It is not a diagnosis and it does not tell you what is wrong.",
    urgency: input.policy.redFlagFloorBand,
    urgencyRationale: "A recognised emergency warning sign was present in the description.",
    mediaObservations: [],
    medicationRequest: false,
  };
}

export type { AiTriageDraft };
