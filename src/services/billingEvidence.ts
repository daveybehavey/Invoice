import { Material, OpenDecision, StructuredInvoice, Task } from "../models/invoice.js";

export type BillingSubjectKind = "material" | "labor";
export type BillingEvidenceField = "quantity" | "price" | "cost" | "rate";
export type BillingEvidenceState = "unresolved" | "known" | "waived";

export type BillingEvidence = {
  subjectId: string;
  subjectKind: BillingSubjectKind;
  subjectIdentity: string;
  subjectLabel: string;
  field: BillingEvidenceField;
  state: BillingEvidenceState;
  value?: number;
  knownQuantityHint?: number;
  sourceOrder: number;
  sourceSpan?: { start: number; end: number };
  sourceSnippet: string;
  sourceFingerprint: string;
  /** Present after bind/apply. Ambiguous/zero binds fail closed for line mutation. */
  binding?: "unique" | "zero" | "ambiguous";
};

export type BillingEvidenceApplyResult = {
  structuredInvoice: StructuredInvoice;
  ledger: BillingEvidence[];
  unresolvedFacts: BillingEvidence[];
  /** Unresolved facts that uniquely bound a line — used for field clearing at emission. */
  lineBoundUnresolvedFacts: BillingEvidence[];
};

const GENERIC_IDENTITY_TOKENS = new Set([
  "pump",
  "pumps",
  "basket",
  "baskets",
  "part",
  "parts",
  "item",
  "items",
  "system",
  "work",
  "labor",
  "labour",
  "service",
  "visit",
  "job",
  "unit",
  "material",
  "materials",
  "charge",
  "free",
  "cost",
  "price",
  "rate",
  "amount",
  "quantity",
  "qty",
  "hour",
  "hours",
  "hr",
  "hrs"
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "was",
  "were",
  "been",
  "being",
  "is",
  "are",
  "be",
  "as",
  "into",
  "over",
  "after",
  "before",
  "about",
  "than",
  "then",
  "so",
  "if",
  "not",
  "no",
  "yes"
]);

const MISSING_PRICE_MARKERS =
  /\b(?:(?:supplier\s+)?(?:price|cost|rate)\s+not\s+(?:written(?:\s+down)?|recorded|noted|available|known)|(?:price|cost|rate)\s+(?:unknown|missing|tbd|tba)|(?:don't|do\s+not|didn'?t|did\s+not)\s+know\s+(?:the\s+)?(?:price|cost|rate)|forgot\s+(?:the\s+)?(?:price|cost|rate)|(?:no|missing)\s+(?:unit\s+)?(?:price|cost))\b/i;

const MISSING_QUANTITY_MARKERS =
  /\b(?:(?:quantity|qty|count)\s+not\s+(?:written(?:\s+down)?|recorded|noted|available|known)|(?:quantity|qty|count)\s+(?:unknown|missing|tbd|tba)|(?:don't|do\s+not|didn'?t|did\s+not)\s+know\s+(?:the\s+)?(?:quantity|qty|count)|(?:no|missing)\s+(?:quantity|qty|count))\b/i;

const MISSING_RATE_MARKERS =
  /\b(?:rate\s+(?:unknown|missing|tbd|tba)|(?:don't|do\s+not|didn'?t|did\s+not)\s+know\s+(?:the\s+)?rate|forgot\s+(?:the\s+)?rate|missing\s+rate)\b/i;

const EXPLICIT_FREE_CHARGE_MARKERS =
  /\b(?:no charge|no-charge|didn't charge|did not charge|didnt charge|not charged|no cost|complimentary|\bfree\b)\b/i;

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function normalizeBillingText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘‛]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.length <= 3) {
    return token;
  }
  if (token.endsWith("tion") && token.length > 5) {
    return token.slice(0, -3); // inspection -> inspect
  }
  if (token.endsWith("sion") && token.length > 5) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function identityTokens(identity: string): string[] {
  return normalizeBillingText(identity)
    .split(/\s+/)
    .map(stemToken)
    .filter((token) => token && !STOP_WORDS.has(token))
    .sort();
}

export function subjectIdentityKey(identity: string): string {
  return identityTokens(identity).join(" ");
}

function identitiesEqual(left: string, right: string): boolean {
  const leftKey = subjectIdentityKey(left);
  const rightKey = subjectIdentityKey(right);
  return Boolean(leftKey) && leftKey === rightKey;
}

function fingerprintSourceSnippet(value?: string): string {
  const normalized = normalizeBillingText(value ?? "");
  if (!normalized) {
    return "";
  }
  return hashString(normalized);
}

function buildSubjectId(kind: BillingSubjectKind, identity: string): string {
  return `subj-${kind}-${hashString(subjectIdentityKey(identity) || normalizeBillingText(identity))}`;
}

function cleanSubjectLabel(raw: string): string {
  return raw
    .replace(
      /\b(?:but|and|,|;).*$/i,
      ""
    )
    .replace(
      /\b(?:supplier\s+)?(?:price|cost|rate|quantity|qty|count)\s+(?:not\s+)?(?:written(?:\s+down)?|recorded|noted|available|known|unknown|missing|tbd|tba).*$/i,
      ""
    )
    .replace(/\b(?:at\s+\$?\d[\d,]*(?:\.\d+)?(?:\s*each)?)\b/gi, "")
    .replace(/\b(?:for\s+\d+(?:\.\d+)?\s+hours?)\b/gi, "")
    .replace(/\b(?:quantity|qty|count|price|cost|rate)\b/gi, "")
    .replace(/\b(?:unknown|missing|recorded|written|noted|available|tbd|tba)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .slice(0, 80);
}

function splitSentencesWithSpans(sourceText: string): Array<{ text: string; start: number; end: number; order: number }> {
  // Align with invoicePipeline sentence boundaries: newlines and .!? (not semicolons),
  // so "Added X at $74 each; quantity not recorded" stays one statement.
  const results: Array<{ text: string; start: number; end: number; order: number }> = [];
  const pattern = /[^.!?\n]+[.!?\n]?/g;
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = pattern.exec(sourceText)) !== null) {
    const text = match[0].trim();
    if (!text) {
      continue;
    }
    results.push({
      text,
      start: match.index,
      end: match.index + match[0].length,
      order
    });
    order += 1;
  }
  return results;
}

function snippetOf(sentence: string): string {
  return sentence.length > 140 ? `${sentence.slice(0, 137)}...` : sentence;
}

function parseMoney(raw: string): number | undefined {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function detectSubjectKind(sentence: string, field: BillingEvidenceField, label: string): BillingSubjectKind {
  if (field === "rate") {
    return "labor";
  }
  const haystack = `${sentence} ${label}`;
  const looksLikeMaterialVerb = /\b(?:added|used|installed|purchased|bought|jug|jugs|material)\b/i.test(
    haystack
  );
  const looksLikeLaborVerb =
    /\b(?:hour|hours|hr|hrs|worker|workers|labour|labor|repaired|repair|cleaned|cleaning|inspected|inspection|visit)\b/i.test(
      haystack
    );
  if (field === "quantity" && looksLikeMaterialVerb) {
    return "material";
  }
  if ((field === "price" || field === "cost") && looksLikeMaterialVerb && !looksLikeLaborVerb) {
    return "material";
  }
  if (looksLikeLaborVerb) {
    return "labor";
  }
  return "material";
}

function extractMissingSubject(
  sentence: string
): { label: string; quantityHint?: number } | null {
  const addedWithQty = sentence.match(
    /\b(?:added|used|installed|replaced|purchased|bought|included|add)\s+(\d+(?:\.\d+)?)\s+(.+?)(?:\s+but\b|\s+and\b|,|;|\.|$)/i
  );
  if (addedWithQty) {
    const quantity = Number(addedWithQty[1]);
    const label = cleanSubjectLabel(addedWithQty[2]);
    if (label) {
      return {
        label,
        quantityHint: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined
      };
    }
  }

  const repairedHours = sentence.match(
    /\b(.+?)\s+for\s+(\d+(?:\.\d+)?)\s+hours?\b/i
  );
  if (repairedHours && MISSING_RATE_MARKERS.test(sentence)) {
    const label = cleanSubjectLabel(repairedHours[1]);
    if (label) {
      return { label };
    }
  }

  const addedWithoutQty = sentence.match(
    /\b(?:added|used|installed|replaced|purchased|bought|included|add)\s+(.+?)(?:\s+at\b|\s+but\b|\s+and\b|,|;|\.|$)/i
  );
  if (addedWithoutQty) {
    const label = cleanSubjectLabel(addedWithoutQty[1]);
    if (label) {
      return { label };
    }
  }

  const genericItem = sentence.match(
    /\b(?:for|on)\s+(.+?)(?:\s+but\b|\s+and\b|,|;|\.|$)/i
  );
  if (genericItem) {
    const label = cleanSubjectLabel(genericItem[1]);
    if (label) {
      return { label };
    }
  }

  return null;
}

function pushEvidence(bucket: BillingEvidence[], evidence: BillingEvidence): void {
  const key = `${evidence.subjectId}:${evidence.field}:${evidence.state}:${evidence.sourceFingerprint}:${evidence.value ?? ""}`;
  if (bucket.some((item) => `${item.subjectId}:${item.field}:${item.state}:${item.sourceFingerprint}:${item.value ?? ""}` === key)) {
    return;
  }
  bucket.push(evidence);
}

function makeEvidence(input: {
  kind: BillingSubjectKind;
  label: string;
  field: BillingEvidenceField;
  state: BillingEvidenceState;
  value?: number;
  knownQuantityHint?: number;
  sourceOrder: number;
  start: number;
  end: number;
  sentence: string;
}): BillingEvidence {
  const subjectIdentity = subjectIdentityKey(input.label) || normalizeBillingText(input.label);
  return {
    subjectId: buildSubjectId(input.kind, subjectIdentity),
    subjectKind: input.kind,
    subjectIdentity,
    subjectLabel: input.label,
    field: input.field,
    state: input.state,
    value: input.value,
    knownQuantityHint: input.knownQuantityHint,
    sourceOrder: input.sourceOrder,
    sourceSpan: { start: input.start, end: input.end },
    sourceSnippet: snippetOf(input.sentence),
    sourceFingerprint: fingerprintSourceSnippet(input.sentence)
  };
}

/**
 * Parse typed billing evidence in source order.
 * This is intentional structured extraction for the ledger seam — not a second fuzzy authority path.
 */
export function parseBillingEvidence(sourceText: string): BillingEvidence[] {
  const sentences = splitSentencesWithSpans(sourceText);
  const evidence: BillingEvidence[] = [];

  sentences.forEach(({ text: sentence, start, end, order }) => {
    const waivedMatch = sentence.match(
      /(?:no(?:\s+|-)?charge|did(?:\s+not|n't|nt)\s+charge|not\s+charged|no\s+cost|complimentary|\bfree\b)(?:\s+for)\s+(.+?)(?:\.|$)/i
    );
    if (waivedMatch?.[1] && EXPLICIT_FREE_CHARGE_MARKERS.test(sentence)) {
      const label = cleanSubjectLabel(waivedMatch[1]);
      if (label) {
        const kind = detectSubjectKind(sentence, "price", label);
        pushEvidence(
          evidence,
          makeEvidence({
            kind,
            label,
            field: "price",
            state: "waived",
            sourceOrder: order,
            start,
            end,
            sentence
          })
        );
      }
    } else if (EXPLICIT_FREE_CHARGE_MARKERS.test(sentence)) {
      // Same-statement free/no-charge without "for X" (e.g. "inspection visit, no charge").
      const workPortion = sentence.replace(EXPLICIT_FREE_CHARGE_MARKERS, " ");
      const label = cleanSubjectLabel(
        workPortion
          .replace(/\b(?:maybe|about|approx(?:imately)?)\s+\d+(?:\.\d+)?\s*(?:mins?|minutes?|hours?|hrs?)\b/gi, " ")
          .replace(/\b\d+(?:\.\d+)?\s*(?:mins?|minutes?|hours?|hrs?)\b/gi, " ")
          .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b/gi, " ")
      );
      if (label && !isAnaphoricSubjectLabel(label)) {
        pushEvidence(
          evidence,
          makeEvidence({
            kind: detectSubjectKind(sentence, "price", label),
            label,
            field: "price",
            state: "waived",
            sourceOrder: order,
            start,
            end,
            sentence
          })
        );
      }
    }

    const hasMissingQuantity = MISSING_QUANTITY_MARKERS.test(sentence);
    const hasMissingRate = MISSING_RATE_MARKERS.test(sentence);
    const hasMissingPrice = MISSING_PRICE_MARKERS.test(sentence) && !hasMissingRate;

    if (hasMissingQuantity || hasMissingPrice || hasMissingRate) {
      let subject = extractMissingSubject(sentence);
      // Trailing missing-value clauses can omit the noun when the prior clause named it.
      if (!subject?.label) {
        const prior = [...evidence].reverse().find((item) => item.subjectLabel);
        if (prior) {
          subject = { label: prior.subjectLabel, quantityHint: prior.knownQuantityHint };
        }
      }
      if (subject?.label) {
        if (hasMissingQuantity) {
          pushEvidence(
            evidence,
            makeEvidence({
              kind: "material",
              label: subject.label,
              field: "quantity",
              state: "unresolved",
              knownQuantityHint: subject.quantityHint,
              sourceOrder: order,
              start,
              end,
              sentence
            })
          );
        }
        if (hasMissingRate) {
          pushEvidence(
            evidence,
            makeEvidence({
              kind: "labor",
              label: subject.label,
              field: "rate",
              state: "unresolved",
              sourceOrder: order,
              start,
              end,
              sentence
            })
          );
        } else if (hasMissingPrice) {
          const field: BillingEvidenceField = /\bcost\b/i.test(sentence)
            ? "cost"
            : /\brate\b/i.test(sentence)
              ? "rate"
              : "price";
          const kind = detectSubjectKind(sentence, field, subject.label);
          pushEvidence(
            evidence,
            makeEvidence({
              kind,
              label: subject.label,
              field,
              state: "unresolved",
              knownQuantityHint: subject.quantityHint,
              sourceOrder: order,
              start,
              end,
              sentence
            })
          );
        }
      }
    }

    const quantityIs = sentence.match(
      /\b(.+?)\s+(?:quantity|qty|count)\s+is\s+(\d+(?:\.\d+)?)\b/i
    );
    if (quantityIs) {
      const label = cleanSubjectLabel(quantityIs[1]);
      const value = Number(quantityIs[2]);
      if (label && Number.isFinite(value) && value > 0) {
        pushEvidence(
          evidence,
          makeEvidence({
            kind: "material",
            label,
            field: "quantity",
            state: "known",
            value,
            sourceOrder: order,
            start,
            end,
            sentence
          })
        );
      }
    }

    const costEach = sentence.match(
      /\b(.+?)\s+cost\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(?:each)?\b/i
    );
    if (costEach) {
      const label = cleanSubjectLabel(costEach[1]);
      const value = parseMoney(costEach[2]);
      if (label && typeof value === "number") {
        pushEvidence(
          evidence,
          makeEvidence({
            kind: "material",
            label,
            field: "cost",
            state: "known",
            value,
            sourceOrder: order,
            start,
            end,
            sentence
          })
        );
      }
    }

    const pricedAt = sentence.match(
      /\b(?:added|used|installed|replaced|purchased|bought|included|add)\s+(?:(\d+(?:\.\d+)?)\s+)?(.+?)\s+at\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(?:each)?\b/i
    );
    const looksLikeLaborRate =
      /\b(?:hours?|hrs?|\/hr|per\s+hour)\b/i.test(sentence) ||
      /\$\s*[\d,]+(?:\.\d+)?\s*(?:\/hr|per\s+hour)/i.test(sentence);
    if (
      pricedAt &&
      !MISSING_QUANTITY_MARKERS.test(sentence) &&
      !MISSING_PRICE_MARKERS.test(sentence) &&
      !looksLikeLaborRate
    ) {
      const quantityHint = pricedAt[1] ? Number(pricedAt[1]) : undefined;
      const label = cleanSubjectLabel(pricedAt[2]);
      const value = parseMoney(pricedAt[3]);
      if (label && typeof value === "number") {
        pushEvidence(
          evidence,
          makeEvidence({
            kind: "material",
            label,
            field: "price",
            state: "known",
            value,
            knownQuantityHint:
              typeof quantityHint === "number" && Number.isFinite(quantityHint) && quantityHint > 0
                ? quantityHint
                : undefined,
            sourceOrder: order,
            start,
            end,
            sentence
          })
        );
      }
    }

    const washPriced = sentence.match(
      /\b(.+?)\s+(?:for|at|=)\s+\$?\s*([\d,]+(?:\.\d+)?)\b/i
    );
    if (
      washPriced &&
      !MISSING_PRICE_MARKERS.test(sentence) &&
      !MISSING_QUANTITY_MARKERS.test(sentence) &&
      !EXPLICIT_FREE_CHARGE_MARKERS.test(sentence) &&
      !/\bcost\b/i.test(sentence) &&
      !looksLikeLaborRate
    ) {
      const label = cleanSubjectLabel(washPriced[1]);
      const value = parseMoney(washPriced[2]);
      if (label && typeof value === "number" && !/\bquantity\b/i.test(label)) {
        // Only emit when this looks like an independent priced sibling (e.g. acid wash $200).
        if (/\bwash\b|\bfitting|\bpump\b|\bfee\b/i.test(label) || /\b\$/.test(sentence)) {
          pushEvidence(
            evidence,
            makeEvidence({
              kind: detectSubjectKind(sentence, "price", label),
              label,
              field: "price",
              state: "known",
              value,
              sourceOrder: order,
              start,
              end,
              sentence
            })
          );
        }
      }
    }
  });

  return evidence.sort((left, right) => left.sourceOrder - right.sourceOrder);
}

/**
 * Reduce evidence before invoice mutation.
 * Later explicit evidence for the same subject + field supersedes earlier unresolved.
 * The originating missing-value statement cannot self-resolve.
 */
export function reduceBillingEvidence(raw: BillingEvidence[]): BillingEvidence[] {
  const reduced = new Map<string, BillingEvidence>();

  raw
    .slice()
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .forEach((fact) => {
      const key = `${fact.subjectId}:${fact.field}`;
      const existing = reduced.get(key);
      if (!existing) {
        reduced.set(key, fact);
        return;
      }

      if (existing.state === "unresolved" && (fact.state === "known" || fact.state === "waived")) {
        // Originating statement cannot self-resolve.
        if (fact.sourceFingerprint === existing.sourceFingerprint) {
          return;
        }
        reduced.set(key, fact);
        return;
      }

      if (existing.state !== "unresolved" && fact.state === "unresolved") {
        // Keep authoritative known/waived unless a later unresolved is intentional replacement
        // from a different statement — still prefer known/waived once established in-order
        // only when the later fact is unresolved from a new statement about the same field.
        if (fact.sourceOrder > existing.sourceOrder) {
          reduced.set(key, fact);
        }
        return;
      }

      // Same-state later fact wins (e.g. corrected known value).
      if (fact.sourceOrder >= existing.sourceOrder) {
        reduced.set(key, fact);
      }
    });

  return Array.from(reduced.values()).sort((left, right) => left.sourceOrder - right.sourceOrder);
}

export function buildBillingEvidenceLedger(sourceText: string): BillingEvidence[] {
  return reduceBillingEvidence(parseBillingEvidence(sourceText));
}

type BindCandidate = {
  index: number;
  kind: BillingSubjectKind;
  identity: string;
  label: string;
};

type BindResult =
  | { status: "unique"; candidate: BindCandidate }
  | { status: "zero" }
  | { status: "ambiguous" };

function isAnaphoricSubjectLabel(label: string): boolean {
  const normalized = normalizeBillingText(label);
  return /^(?:that|this|it|the)(?:\s+\w+)?$/.test(normalized) || /^(?:that|this)\s+(?:visit|job|work|service|item|one)$/.test(normalized);
}

function bindSubject(
  fact: BillingEvidence,
  materials: Material[],
  tasks: Array<{ sessionIndex: number; taskIndex: number; task: Task }>
): BindResult {
  const candidates: BindCandidate[] = [];

  if (fact.subjectKind === "material" || fact.state === "waived") {
    materials.forEach((material, index) => {
      candidates.push({
        index,
        kind: "material",
        identity: subjectIdentityKey(material.description) || normalizeBillingText(material.description),
        label: material.description
      });
    });
  }

  if (fact.subjectKind === "labor" || fact.field === "rate" || fact.state === "waived") {
    tasks.forEach((entry, index) => {
      candidates.push({
        index,
        kind: "labor",
        identity: subjectIdentityKey(entry.task.description) || normalizeBillingText(entry.task.description),
        label: entry.task.description
      });
    });
  }

  const exact = candidates.filter((candidate) => identitiesEqual(candidate.identity, fact.subjectIdentity));
  // Prefer longest normalized identity among exact matches when labels differ only by noise.
  if (exact.length === 1) {
    return { status: "unique", candidate: exact[0] };
  }
  if (exact.length > 1) {
    const byKind = exact.filter((candidate) => candidate.kind === fact.subjectKind);
    if (byKind.length === 1) {
      return { status: "unique", candidate: byKind[0] };
    }
    return { status: "ambiguous" };
  }

  // Reject substring containment and single generic token overlap — fail closed.
  const loose = candidates.filter((candidate) => {
    const factTokens = new Set(identityTokens(fact.subjectIdentity));
    const candidateTokens = identityTokens(candidate.identity);
    if (!factTokens.size || !candidateTokens.length) {
      return false;
    }
    // Substring containment is explicitly disallowed.
    if (
      candidate.identity.includes(fact.subjectIdentity) ||
      fact.subjectIdentity.includes(candidate.identity)
    ) {
      if (!identitiesEqual(candidate.identity, fact.subjectIdentity)) {
        return false;
      }
    }
    const overlap = candidateTokens.filter((token) => factTokens.has(token));
    if (overlap.length === 0) {
      return false;
    }
    if (overlap.length === 1 && GENERIC_IDENTITY_TOKENS.has(overlap[0])) {
      return false;
    }
    // Require full token-set equality only (already handled). No partial multi-token bind.
    return false;
  });

  if (loose.length === 1) {
    return { status: "unique", candidate: loose[0] };
  }
  if (loose.length > 1) {
    return { status: "ambiguous" };
  }
  return { status: "zero" };
}

function clearInventedZeroPricing<T extends { amount?: number; unitCost?: number; rate?: number }>(
  item: T
): T {
  const next = { ...item };
  if (typeof next.amount === "number" && next.amount === 0) {
    next.amount = undefined;
  }
  if (typeof next.unitCost === "number" && next.unitCost === 0) {
    next.unitCost = undefined;
  }
  if (typeof next.rate === "number" && next.rate === 0) {
    next.rate = undefined;
  }
  return next;
}

function listTasks(
  structuredInvoice: StructuredInvoice
): Array<{ sessionIndex: number; taskIndex: number; task: Task }> {
  const tasks: Array<{ sessionIndex: number; taskIndex: number; task: Task }> = [];
  structuredInvoice.workSessions.forEach((session, sessionIndex) => {
    session.tasks.forEach((task, taskIndex) => {
      tasks.push({ sessionIndex, taskIndex, task });
    });
  });
  return tasks;
}

function isWaivedBound(fact: BillingEvidence, identity: string): boolean {
  return fact.state === "waived" && identitiesEqual(fact.subjectIdentity, identity);
}

/**
 * Bind reduced ledger facts onto the structured invoice before line-item emission.
 * Category-aware, discriminative, field-specific; fail closed on ambiguous binds.
 */
export function applyBillingEvidenceLedger(
  structuredInvoice: StructuredInvoice,
  sourceText: string
): BillingEvidenceApplyResult {
  const ledger = buildBillingEvidenceLedger(sourceText);
  let materials = structuredInvoice.materials.map((material) => ({ ...material }));
  const workSessions = structuredInvoice.workSessions.map((session) => ({
    ...session,
    tasks: session.tasks.map((task) => ({ ...task }))
  }));

  const unresolvedAfterBind: BillingEvidence[] = [];
  const lineBoundUnresolved: BillingEvidence[] = [];
  const boundWaivedIdentities = new Set<string>();

  ledger.forEach((fact) => {
    const tasks = listTasks({ ...structuredInvoice, workSessions, materials });
    const bind = bindSubject(fact, materials, tasks);

    if (bind.status !== "unique") {
      // Fail closed: do not mutate siblings. Keep authoritative unresolved projection.
      if (fact.state === "known") {
        unresolvedAfterBind.push({
          ...fact,
          state: "unresolved",
          value: undefined,
          binding: bind.status
        });
      } else if (fact.state === "unresolved") {
        unresolvedAfterBind.push({ ...fact, binding: bind.status });
      } else if (fact.state === "waived" && bind.status === "zero") {
        // Anaphoric free/no-charge ("didn't charge for that visit") may uniquely
        // bind to the only explicit $0 labor/material line.
        if (isAnaphoricSubjectLabel(fact.subjectLabel)) {
          const zeroMaterials = materials
            .map((material, index) => ({ material, index }))
            .filter(
              ({ material }) =>
                (typeof material.amount === "number" && material.amount === 0) ||
                (typeof material.unitCost === "number" && material.unitCost === 0)
            );
          const zeroTasks = tasks.filter(
            (entry) => typeof entry.task.amount === "number" && entry.task.amount === 0
          );
          if (fact.subjectKind === "labor" && zeroTasks.length === 1) {
            const taskRef = zeroTasks[0];
            workSessions[taskRef.sessionIndex].tasks[taskRef.taskIndex] = {
              ...taskRef.task,
              amount: 0,
              rate: 0
            };
            boundWaivedIdentities.add(
              subjectIdentityKey(taskRef.task.description) ||
                normalizeBillingText(taskRef.task.description)
            );
          } else if (zeroMaterials.length === 1 && zeroTasks.length === 0) {
            const { material, index } = zeroMaterials[0];
            materials[index] = { ...material, unitCost: 0, amount: 0 };
            boundWaivedIdentities.add(
              subjectIdentityKey(material.description) || normalizeBillingText(material.description)
            );
          } else if (zeroTasks.length === 1 && zeroMaterials.length === 0) {
            const taskRef = zeroTasks[0];
            workSessions[taskRef.sessionIndex].tasks[taskRef.taskIndex] = {
              ...taskRef.task,
              amount: 0,
              rate: 0
            };
            boundWaivedIdentities.add(
              subjectIdentityKey(taskRef.task.description) ||
                normalizeBillingText(taskRef.task.description)
            );
          }
        }
      } else if (fact.state === "waived") {
        unresolvedAfterBind.push({
          ...fact,
          state: "unresolved",
          value: undefined,
          binding: bind.status
        });
      }

      // Materialize unmatched unresolved material placeholders only (never labor-rate as material).
      if (fact.state === "unresolved" && fact.subjectKind === "material" && bind.status === "zero") {
        const alreadyPresent = materials.some((material) =>
          identitiesEqual(
            subjectIdentityKey(material.description) || normalizeBillingText(material.description),
            fact.subjectIdentity
          )
        );
        if (!alreadyPresent) {
          materials.push({
            description: fact.subjectLabel,
            quantity:
              fact.field === "quantity"
                ? undefined
                : typeof fact.knownQuantityHint === "number"
                  ? fact.knownQuantityHint
                  : undefined
          });
          lineBoundUnresolved.push({ ...fact, binding: "unique" });
        }
      }
      return;
    }

    const candidate = bind.candidate;
    if (candidate.kind === "material") {
      let material = { ...materials[candidate.index] };
      if (fact.state === "unresolved") {
        if (fact.field === "quantity") {
          material.quantity = undefined;
          material.amount = undefined;
        } else if (fact.field === "price" || fact.field === "cost") {
          material = clearInventedZeroPricing(material);
          if (typeof material.quantity !== "number" && typeof fact.knownQuantityHint === "number") {
            material.quantity = fact.knownQuantityHint;
          }
        } else if (fact.field === "rate") {
          // Rate on a material bind is invalid category — fail closed.
          unresolvedAfterBind.push(fact);
          return;
        }
        unresolvedAfterBind.push({ ...fact, binding: "unique" });
        lineBoundUnresolved.push({ ...fact, binding: "unique" });
      } else if (fact.state === "known") {
        if (fact.field === "quantity" && typeof fact.value === "number") {
          material.quantity = fact.value;
          if (typeof material.unitCost === "number") {
            material.amount = material.quantity * material.unitCost;
          }
        } else if ((fact.field === "price" || fact.field === "cost") && typeof fact.value === "number") {
          material.unitCost = fact.value;
          if (typeof material.quantity === "number") {
            material.amount = material.quantity * fact.value;
          }
        }
      } else if (fact.state === "waived") {
        material.unitCost = 0;
        material.amount = 0;
        boundWaivedIdentities.add(candidate.identity);
      }
      materials[candidate.index] = material;
      return;
    }

    // Labor bind
    const taskRef = tasks[candidate.index];
    if (!taskRef) {
      unresolvedAfterBind.push({ ...fact, state: "unresolved", value: undefined, binding: "zero" });
      return;
    }
    let task = { ...workSessions[taskRef.sessionIndex].tasks[taskRef.taskIndex] };
    if (fact.state === "unresolved") {
      if (fact.field === "rate" || fact.field === "price" || fact.field === "cost") {
        task = clearInventedZeroPricing(task);
        task.rate = undefined;
        task.amount = undefined;
      }
      unresolvedAfterBind.push({ ...fact, binding: "unique" });
      lineBoundUnresolved.push({ ...fact, binding: "unique" });
    } else if (fact.state === "known" && fact.field === "rate" && typeof fact.value === "number") {
      task.rate = fact.value;
      if (typeof task.hours === "number") {
        task.amount = task.hours * fact.value;
      }
    } else if (fact.state === "waived") {
      task.amount = 0;
      task.rate = 0;
      boundWaivedIdentities.add(candidate.identity);
    } else {
      // Known non-rate on labor without category support — fail closed.
      unresolvedAfterBind.push({ ...fact, state: "unresolved", value: undefined, binding: "zero" });
    }
    workSessions[taskRef.sessionIndex].tasks[taskRef.taskIndex] = task;
  });

  // Re-apply unresolved clearing after known values, in case both exist for different fields.
  const authoritativeUnresolved = reduceBillingEvidence(
    unresolvedAfterBind.filter((fact) => fact.state === "unresolved")
  );

  authoritativeUnresolved.forEach((fact) => {
    const tasks = listTasks({ ...structuredInvoice, workSessions, materials });
    const bind = bindSubject(fact, materials, tasks);
    if (bind.status !== "unique") {
      return;
    }
    if (bind.candidate.kind === "material") {
      let material = { ...materials[bind.candidate.index] };
      if (fact.field === "quantity") {
        material.quantity = undefined;
        material.amount = undefined;
      } else if (fact.field === "price" || fact.field === "cost") {
        material = clearInventedZeroPricing(material);
      }
      materials[bind.candidate.index] = material;
    } else {
      const taskRef = tasks[bind.candidate.index];
      let task = { ...workSessions[taskRef.sessionIndex].tasks[taskRef.taskIndex] };
      task = clearInventedZeroPricing(task);
      task.rate = undefined;
      task.amount = undefined;
      workSessions[taskRef.sessionIndex].tasks[taskRef.taskIndex] = task;
    }
  });

  materials = materials.filter((material) => {
    const identity = subjectIdentityKey(material.description) || normalizeBillingText(material.description);
    const matchedUnresolved = authoritativeUnresolved.filter(
      (fact) => fact.subjectKind === "material" && identitiesEqual(fact.subjectIdentity, identity)
    );
    const hasPricedAmount =
      (typeof material.amount === "number" && material.amount > 0) ||
      (typeof material.unitCost === "number" && material.unitCost > 0);
    if (hasPricedAmount || matchedUnresolved.length > 0) {
      return true;
    }
    const isZeroOnly =
      (typeof material.amount === "number" && material.amount === 0) ||
      (typeof material.unitCost === "number" && material.unitCost === 0);
    if (isZeroOnly) {
      return boundWaivedIdentities.has(identity) || ledger.some((fact) => isWaivedBound(fact, identity));
    }
    const hasNoPricing =
      typeof material.amount !== "number" && typeof material.unitCost !== "number";
    if (hasNoPricing) {
      return matchedUnresolved.length > 0;
    }
    return true;
  });

  workSessions.forEach((session, sessionIndex) => {
    workSessions[sessionIndex] = {
      ...session,
      tasks: session.tasks.filter((task) => {
        const identity = subjectIdentityKey(task.description) || normalizeBillingText(task.description);
        const hasPositivePricing =
          (typeof task.amount === "number" && task.amount > 0) ||
          (typeof task.rate === "number" && task.rate > 0);
        if (hasPositivePricing) {
          return true;
        }
        const isExplicitZero = typeof task.amount === "number" && task.amount === 0;
        if (isExplicitZero) {
          return boundWaivedIdentities.has(identity) || ledger.some((fact) => isWaivedBound(fact, identity));
        }
        return true;
      })
    };
  });

  // Deduplicate unresolved projection by subject+field.
  const unresolvedFacts = reduceBillingEvidence(authoritativeUnresolved);
  const lineBoundUnresolvedFacts = reduceBillingEvidence(
    lineBoundUnresolved.filter((fact) => fact.state === "unresolved" && fact.binding === "unique")
  );

  return {
    structuredInvoice: {
      ...structuredInvoice,
      materials,
      workSessions
    },
    ledger,
    unresolvedFacts,
    lineBoundUnresolvedFacts
  };
}

export function projectUnresolvedEvidenceToDecisions(unresolvedFacts: BillingEvidence[]): OpenDecision[] {
  return unresolvedFacts
    .filter((fact) => fact.state === "unresolved")
    .map((fact) => {
      const fieldLabel =
        fact.field === "quantity"
          ? "quantity"
          : fact.field === "rate"
            ? "rate"
            : fact.field === "cost"
              ? "cost"
              : "unit price";
      return {
        id: `decision-${hashString(`${fact.subjectId}:${fact.field}:${fact.sourceFingerprint}`)}`,
        kind: "billing" as const,
        prompt: `Confirm ${fieldLabel} for "${fact.subjectLabel}"?`,
        sourceSnippet: fact.sourceSnippet,
        keywords: identityTokens(fact.subjectLabel),
        subjectId: fact.subjectId,
        evidenceField: fact.field
      };
    });
}

export function hasUnresolvedAuthoritativeBillingFacts(input: {
  unresolvedFacts?: BillingEvidence[];
  openDecisions?: OpenDecision[];
}): boolean {
  if ((input.unresolvedFacts ?? []).some((fact) => fact.state === "unresolved")) {
    return true;
  }
  return (input.openDecisions ?? []).some(
    (decision) => Boolean(decision.subjectId) && Boolean(decision.evidenceField)
  );
}

export function materialHasUnresolvedField(
  material: Material,
  unresolvedFacts: BillingEvidence[],
  field: BillingEvidenceField | BillingEvidenceField[]
): boolean {
  const fields = Array.isArray(field) ? field : [field];
  const identity = subjectIdentityKey(material.description) || normalizeBillingText(material.description);
  return unresolvedFacts.some(
    (fact) =>
      fact.state === "unresolved" &&
      fact.subjectKind === "material" &&
      fact.binding === "unique" &&
      fields.includes(fact.field) &&
      identitiesEqual(fact.subjectIdentity, identity)
  );
}
