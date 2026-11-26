import { computeDueDate, generateInvoiceNumber, roundToCents, syncFinishedInvoiceTotals } from "./money";
import type {
  ActiveDraft,
  FinishedInvoice,
  InvoiceLineItem,
  LineItemType,
  OpenDecision,
  StructuredInvoice
} from "./types";

export interface TradePreset {
  id: string;
  label: string;
  trade: string;
  notes: string;
  quickDecisionAmount?: number;
}

export const TRADE_PRESETS: TradePreset[] = [
  {
    id: "plumber",
    label: "Plumber",
    trade: "Plumbing & Fixture Repair",
    notes:
      "Replaced kitchen faucet and shutoff valve for Sarah Chen at 412 Oak St on Tue. 2.5 hrs at $95/hr, brass valve $38, supply lines $22, hauled away old fixture. Net 15.",
    quickDecisionAmount: 45
  },
  {
    id: "handyman",
    label: "Handyman",
    trade: "Home Repair",
    notes:
      "Mike Torres - 88 Cedar Ave. Fixed sticking front door and hung 3 floating shelves. 3 hrs at $85/hr. Heavy duty wall anchors $18. Touched up hallway drywall. Net 7.",
    quickDecisionAmount: 65
  },
  {
    id: "landscaper",
    label: "Landscaper",
    trade: "Lawn & Yard Care",
    notes:
      "Fall cleanup for Oakridge Strata. Mowed & edged front lawn 2 hrs at $75/hr, 4 bags yard waste disposal $24, trimmed cedar hedge $120. $25 repeat client discount. Net 30.",
    quickDecisionAmount: 40
  },
  {
    id: "freelancer",
    label: "Freelancer",
    trade: "Creative / Consulting",
    notes:
      "Shopify checkout speed audit and mobile bug fixes for Maya Patel (Loom & Leaf). 4 hrs at $110/hr, custom image compression script $150. Due on receipt.",
    quickDecisionAmount: 95
  },
  {
    id: "thread",
    label: "Text Thread",
    trade: "SMS / WhatsApp Paste",
    notes:
      "[10:14 AM] Mark Stevens: hey thanks again for fixing the garage opener!\n[10:15 AM] Me: Anytime Mark! Was an hour and a half at 110 an hour, safety sensor was 34 bucks with 20% markup, plus reprogrammed keypad. Send to mark@stevenshome.com, Net 7.",
    quickDecisionAmount: 35
  }
];

interface ParsedResult {
  invoice: FinishedInvoice;
  structuredInvoice: StructuredInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  taxRate: number;
  paymentTerms: ActiveDraft["paymentTerms"];
  customerEmail?: string;
  depositPercent?: number;
  materialsMarkupPercent?: number;
}

function cleanDescription(text: string): string {
  return text
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\b(net\s*(7|15|30)|due on receipt)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[a-z]/, (ch) => ch.toUpperCase());
}

/**
 * Normalizes messy SMS/WhatsApp dumps & casual speech into clean numeric segments.
 */
function preprocessNaturalNotes(raw: string): string {
  return raw
    // Strip bracketed timestamps like "[10:14 AM]" or "[10:15 AM]"
    .replace(/\[\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?\s*\]\s*/gi, "")
    // Strip date+time prefixes like "11/25, 2:15 PM - "
    .replace(/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?,?\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?\s*[-–:]?\s*/gim, "")
    // Strip chat speaker labels ("Me:", "Client:", "Mark Stevens:")
    .replace(/^(?:me|you|client|customer|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*:\s+/gim, "")
    // Strip send-to-email directives completely before splitting segments
    .replace(/\b(?:send(?:\s+(?:bill|invoice|quote))?\s+to|email\s+to)\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "")
    // Strip common chat small talk & greetings
    .replace(/\b(?:(?:hey\s+)?thanks(?:\s+again)?\s+for|hey\s+can\s+you|anytime\s+[A-Z][a-z]+[!.,]*|sounds\s+good|see\s+you\s+then)\b/gi, "")
    // Spoken durations -> decimal hours
    .replace(/\ban\s+hour\s+and\s+a\s+half\b|\b1\s*h(?:r|our)?\s*30\s*m(?:in)?s?\b/gi, "1.5 hrs")
    .replace(/\btwo\s+hours\b/gi, "2 hrs")
    .replace(/\bthree\s+hours\b/gi, "3 hrs")
    .replace(/\bhalf\s+an\s+hour\b|\b30\s*mins?\b/gi, "0.5 hrs")
    .replace(/\b45\s*mins?\b/gi, "0.75 hrs")
    .replace(/\b15\s*mins?\b/gi, "0.25 hrs")
    // Spoken currency ("34 bucks", "110 an hour")
    .replace(/(\d+(?:\.\d{1,2})?)\s*(?:bucks|dollars)\b/gi, "$$$1")
    .replace(/\bat\s+(\d+(?:\.\d{1,2})?)\s*(?:an?\s*hour|per\s*hour|\/\s*hr)\b/gi, "at $$$1/hr")
    .replace(/(\d+(?:\.\d{1,2})?)\s*(?:an?\s*hour|per\s*hour)\b/gi, "$$$1/hr")
    .replace(/\b(?:plus|with)\s+(\d+(?:\.\d+)?%\s*markup)\b/gi, "$1");
}

function extractInlineEmail(raw: string): string | undefined {
  const match = raw.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  return match?.[1]?.toLowerCase();
}

function extractCustomerName(raw: string): string | undefined {
  const speakerChatMatch = raw.match(/^(?:\[[^\]]+\]\s*)?([A-Z][a-zA-Z'&-]+(?:\s+[A-Z][a-zA-Z'&-]+){1,2})\s*:/m);
  if (speakerChatMatch?.[1] && !/^(Me|You|Client|Customer|Bill\s*To)$/i.test(speakerChatMatch[1])) {
    return speakerChatMatch[1].trim();
  }
  const forMatch = raw.match(
    /\bfor\s+([A-Z][a-zA-Z'&-]+(?:\s+[A-Z][a-zA-Z'&-]+){0,2})(?=\s+(?:at|on|in|—|-|\()|[,.;\n]|$)/
  );
  if (forMatch?.[1]) {
    const candidate = forMatch[1].trim();
    if (!/^(Tue|Mon|Wed|Thu|Fri|Sat|Sun|Today|Yesterday|Fixing|Repairing|Installing)$/i.test(candidate)) {
      return candidate;
    }
  }
  const clientLabelMatch = raw.match(/(?:client|bill\s*to|customer)\s*:\s*([^\n,;]+)/i);
  if (clientLabelMatch?.[1]) {
    return clientLabelMatch[1].trim();
  }
  const leadingDashMatch = raw.match(
    /^([A-Z][a-zA-Z'&-]+(?:\s+[A-Z][a-zA-Z'&-]+){0,2})(?:\s+(?:on|at)\s+[^-—\n]+)?\s+[-—]\s+/
  );
  if (leadingDashMatch?.[1]) {
    return leadingDashMatch[1].trim();
  }
  return undefined;
}

function extractPaymentTerms(raw: string): ActiveDraft["paymentTerms"] {
  if (/\bdue\s+on\s+receipt\b/i.test(raw)) return "due_on_receipt";
  if (/\bnet\s*7\b/i.test(raw)) return "net_7";
  if (/\bnet\s*30\b/i.test(raw)) return "net_30";
  return "net_15";
}

function extractTaxRate(raw: string): number {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%\s*(?:tax|gst|hst|pst|vat)\b/i);
  if (match?.[1]) {
    const parsed = Number.parseFloat(match[1]);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 30) {
      return parsed;
    }
  }
  return 0;
}

function extractDepositPercent(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%\s*deposit\b/i);
  if (match?.[1]) {
    const val = Number.parseFloat(match[1]);
    if (Number.isFinite(val) && val > 0 && val < 100) return val;
  }
  return undefined;
}

function extractMarkupPercent(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%\s*markup\b/i);
  if (match?.[1]) {
    const val = Number.parseFloat(match[1]);
    if (Number.isFinite(val) && val > 0 && val <= 200) return val;
  }
  return undefined;
}

function extractDiscount(raw: string): { amount?: number; reason?: string } {
  const dollarOff = raw.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:[a-z]+\s+){0,3}discount\b|\$\s*(\d+(?:\.\d{1,2})?)\s*off\b/i);
  const rawNum = dollarOff?.[1] || dollarOff?.[2];
  if (rawNum) {
    const amount = roundToCents(Number.parseFloat(rawNum));
    if (amount > 0) {
      return { amount, reason: "Applied discount" };
    }
  }
  return {};
}

function classifyType(desc: string): LineItemType {
  if (/\b(hrs?|hours?|labor|labour|install|repair|service|trim|mow|audit|fix|cleanup|opener)\b/i.test(desc)) {
    return "labor";
  }
  if (/\b(valve|lines?|pipe|part|anchors?|bags?|material|supplies|wire|lumber|paint|script|fixture|sensor)\b/i.test(desc)) {
    return "material";
  }
  return "other";
}

function stripContextClauses(segment: string): string {
  return segment
    .replace(/\bfor\s+[A-Z][a-zA-Z'&-]+(?:\s+[A-Z][a-zA-Z'&-]+){0,2}(?=\s+(?:at|on|in|—|-|\()|[,.;\n]|$)/g, "")
    .replace(/\bat\s+\d+\s+[A-Za-z0-9\s]+(?:St|Ave|Rd|Blvd|Dr|Ln|Way)\b/gi, "")
    .replace(/\bon\s+(?:Mon|Tue|Tues|Wed|Thu|Thurs|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|yesterday)\b/gi, "")
    .replace(/^[A-Z][a-zA-Z'&-]+(?:\s+[A-Z][a-zA-Z'&-]+){0,2}(?:\s+(?:on|at)\s+[^-—\n]+)?\s+[-—]\s+/, "")
    .replace(/^(?:client|bill\s*to|customer)\s*:\s*[^\n,;]+/i, "")
    .replace(/\d+(?:\.\d+)?\s*%\s*(?:tax|gst|hst|pst|vat|deposit|markup)\b/gi, "")
    .replace(/\$\s*\d+(?:\.\d{1,2})?\s*(?:[a-z]+\s+){0,3}(?:discount|off)\b/gi, "")
    .replace(/\b(net\s*(?:7|15|30)|due\s+on\s+receipt)\b/gi, "")
    .replace(/^(?:was|plus|and|also|with)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic instant rough-note parser used for guest sandbox & instant preview.
 * Never invents a silent $0 price: unpriced clauses emit an OpenDecision so the
 * user explicitly sets a price, marks included ($0), or removes the line.
 */
export function parseRoughNotesInstant(
  rawInput: string,
  options?: {
    invoiceNumber?: string;
    currency?: string;
    defaultTaxRate?: number;
    defaultTerms?: ActiveDraft["paymentTerms"];
    documentType?: "invoice" | "estimate";
    defaultMarkupPercent?: number;
  }
): ParsedResult {
  const trimmed = rawInput.trim();
  const issueDate = new Date().toISOString().slice(0, 10);
  const paymentTerms = /\b(net\s*(?:7|15|30)|due\s+on\s+receipt)\b/i.test(trimmed)
    ? extractPaymentTerms(trimmed)
    : options?.defaultTerms ?? "net_15";
  const dueDate = computeDueDate(issueDate, paymentTerms);
  const customerName = extractCustomerName(trimmed);
  const customerEmail = extractInlineEmail(trimmed);
  const parsedTax = extractTaxRate(trimmed);
  const taxRate = parsedTax > 0 ? parsedTax : options?.defaultTaxRate ?? 0;
  const depositPercent = extractDepositPercent(trimmed);
  const materialsMarkupPercent = extractMarkupPercent(trimmed) ?? options?.defaultMarkupPercent ?? 0;
  const discount = extractDiscount(trimmed);
  const currency = options?.currency || "USD";
  const documentType = options?.documentType ?? (/\bestimate|quote\b/i.test(trimmed) ? "estimate" : "invoice");

  const lineItems: InvoiceLineItem[] = [];
  const openDecisions: OpenDecision[] = [];
  const assumptions: string[] = [];

  if (!trimmed) {
    return {
      invoice: syncFinishedInvoiceTotals(
        {
          documentType,
          invoiceNumber: options?.invoiceNumber || generateInvoiceNumber(),
          issueDate,
          dueDate,
          customerName,
          currency,
          lineItems: [],
          paymentRecords: [],
          paymentMethods: [],
          materialsMarkupPercent
        },
        taxRate
      ),
      structuredInvoice: { customerName, workSessions: [], materials: [] },
      openDecisions: [],
      assumptions: [],
      taxRate,
      paymentTerms,
      customerEmail,
      depositPercent,
      materialsMarkupPercent
    };
  }

  const normalizedNotes = preprocessNaturalNotes(trimmed);

  // Split by newlines, exclamations, question marks, commas, semicolons, or sentence periods (without splitting decimal numbers like 2.5)
  const rawSegments = normalizedNotes
    .split(/[!?\n;,]|\.(?!\d)\s+/g)
    .map((s) => s.replace(/\.+$/, "").trim())
    .filter(Boolean);

  let idx = 0;
  let lastHourlyDesc = "";

  for (const seg of rawSegments) {
    const cleanedSeg = stripContextClauses(seg);
    if (!cleanedSeg || cleanedSeg.length < 2) {
      continue;
    }

    // 1. Hourly pattern: e.g. "2.5 hrs at $95/hr" or "2 hrs fence repair at $85/hr"
    const hourlyMatch = cleanedSeg.match(
      /^(.*?)\b(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b(?:\s+(?:of|for|on)?\s*([^$@]+?))?\s*(?:@|at)\s*\$?\s*(\d+(?:\.\d{1,2})?)(?:\s*\/\s*(?:hr|hour))?(.*)$/i
    );
    if (hourlyMatch) {
      const before = cleanDescription(hourlyMatch[1] || "");
      const middle = cleanDescription(hourlyMatch[3] || "");
      const after = cleanDescription(hourlyMatch[5] || "");
      const qty = Number.parseFloat(hourlyMatch[2]);
      const rate = roundToCents(Number.parseFloat(hourlyMatch[4]));
      const desc = before || middle || after || lastHourlyDesc || "Service labor";
      idx += 1;
      lineItems.push({
        id: `line_${idx}`,
        type: "labor",
        description: desc,
        quantity: qty,
        unitPrice: rate,
        amount: roundToCents(qty * rate)
      });
      continue;
    }

    // 2. Quantity x Unit Cost pattern: e.g. "4 bags yard waste disposal $24" or "2x supply lines @ $11"
    const qtyPriceMatch = cleanedSeg.match(
      /^(\d+)\s*[x×]?\s+(.+?)\s*(?:@|at)\s*\$?\s*(\d+(?:\.\d{1,2})?)$/i
    );
    if (qtyPriceMatch) {
      const qty = Number.parseFloat(qtyPriceMatch[1]);
      const desc = cleanDescription(qtyPriceMatch[2]);
      const unitPrice = roundToCents(Number.parseFloat(qtyPriceMatch[3]));
      const type = classifyType(desc);
      const markedUnit =
        type === "material" && materialsMarkupPercent > 0
          ? roundToCents(unitPrice * (1 + materialsMarkupPercent / 100))
          : unitPrice;
      idx += 1;
      lineItems.push({
        id: `line_${idx}`,
        type,
        description: desc,
        quantity: qty,
        unitPrice: markedUnit,
        amount: roundToCents(qty * markedUnit)
      });
      continue;
    }

    // 3. Flat priced item: e.g. "brass valve $38", "safety sensor was $34"
    const flatMatch = cleanedSeg.match(/^(.+?)\s+(?:for\s+|at\s+|was\s+)?\$\s*(\d+(?:\.\d{1,2})?)\s*$/i);
    if (flatMatch) {
      const desc = cleanDescription(flatMatch[1]);
      const rawAmt = roundToCents(Number.parseFloat(flatMatch[2]));
      const type = classifyType(desc);
      const amount =
        type === "material" && materialsMarkupPercent > 0
          ? roundToCents(rawAmt * (1 + materialsMarkupPercent / 100))
          : rawAmt;
      if (desc) {
        idx += 1;
        lineItems.push({
          id: `line_${idx}`,
          type,
          description: desc,
          quantity: 1,
          unitPrice: amount,
          amount
        });
        continue;
      }
    }

    // 4. Hours without rate: e.g. "3 hrs installing cabinets" -> requires explicit rate decision
    const unpricedHours = cleanedSeg.match(/^(.*?)\b(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b(.*)$/i);
    if (unpricedHours) {
      const qty = Number.parseFloat(unpricedHours[2]);
      const desc = cleanDescription(`${unpricedHours[1]} ${unpricedHours[3]}`) || "Labor";
      idx += 1;
      const lineId = `line_${idx}`;
      lineItems.push({
        id: lineId,
        type: "labor",
        description: desc,
        quantity: qty
      });
      openDecisions.push({
        id: `dec_${lineId}`,
        kind: "billing",
        lineItemId: lineId,
        suggestedAction: "price",
        prompt: `What hourly rate or flat price for "${desc}" (${qty} hrs)?`,
        sourceSnippet: seg
      });
      continue;
    }

    // 5. Explicit free/included language
    if (/\b(no\s*charge|free|included|complimentary)\b/i.test(cleanedSeg)) {
      const desc = cleanDescription(cleanedSeg.replace(/\b(no\s*charge|free|included|complimentary)\b/gi, ""));
      if (desc) {
        idx += 1;
        lineItems.push({
          id: `line_${idx}`,
          type: "other",
          description: `${desc} (Included)`,
          quantity: 1,
          unitPrice: 0,
          amount: 0,
          explicitFree: true
        });
      }
      continue;
    }

    // 6. Unpriced clause -> keep visible & raise explicit money decision (never silent $0)
    const desc = cleanDescription(cleanedSeg);
    if (desc.length >= 3) {
      const looksLikeTaskWithNoPrice =
        lineItems.length > 0 ||
        /\b(haul|dispos|clean|patch|paint|fix|hang|install|replace|trim|deliver|setup|audit|inspect|remov|reprogram)\b/i.test(
          desc
        );
      if (looksLikeTaskWithNoPrice) {
        idx += 1;
        const lineId = `line_${idx}`;
        lineItems.push({
          id: lineId,
          type: classifyType(desc),
          description: desc
        });
        openDecisions.push({
          id: `dec_${lineId}`,
          kind: "billing",
          lineItemId: lineId,
          suggestedAction: "price",
          prompt: `Set price for "${desc}" or mark included`,
          sourceSnippet: seg
        });
      } else {
        lastHourlyDesc = desc;
      }
    }
  }

  if (customerName) {
    assumptions.push(`Billed to ${customerName}`);
  }
  if (materialsMarkupPercent > 0) {
    assumptions.push(`Applied +${materialsMarkupPercent}% materials markup`);
  }
  if (discount.amount) {
    assumptions.push(`Applied $${discount.amount.toFixed(2)} discount`);
  }

  const baseInvoice = syncFinishedInvoiceTotals(
    {
      documentType,
      invoiceNumber: options?.invoiceNumber || generateInvoiceNumber(),
      issueDate,
      dueDate,
      customerName,
      currency,
      lineItems,
      discountAmount: discount.amount,
      discountReason: discount.reason,
      paymentRecords: [],
      paymentMethods: [],
      materialsMarkupPercent: materialsMarkupPercent > 0 ? materialsMarkupPercent : undefined,
      depositPercent,
      notes: "Thank you for your business."
    },
    taxRate
  );

  const finishedInvoice: FinishedInvoice =
    depositPercent && baseInvoice.total
      ? {
          ...baseInvoice,
          depositAmount: roundToCents((baseInvoice.total * depositPercent) / 100)
        }
      : baseInvoice;

  const structuredInvoice: StructuredInvoice = {
    customerName,
    invoiceNumber: finishedInvoice.invoiceNumber,
    issueDate,
    dueDate,
    workSessions: [
      {
        date: issueDate,
        tasks: lineItems
          .filter((l) => l.type === "labor")
          .map((l) => ({
            description: l.description,
            hours: l.quantity,
            rate: l.unitPrice,
            amount: l.amount,
            explicitFree: l.explicitFree
          }))
      }
    ],
    materials: lineItems
      .filter((l) => l.type !== "labor")
      .map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitCost: l.unitPrice,
        amount: l.amount,
        explicitFree: l.explicitFree
      })),
    notes: finishedInvoice.notes
  };

  return {
    invoice: finishedInvoice,
    structuredInvoice,
    openDecisions,
    assumptions,
    taxRate,
    paymentTerms,
    customerEmail,
    depositPercent,
    materialsMarkupPercent
  };
}

/**
 * Estimates potential unbilled dollar value inside a scratchpad note without creating an invoice.
 */
export function estimateNotesValue(rawInput: string): number {
  const parsed = parseRoughNotesInstant(rawInput);
  return roundToCents(parsed.invoice.total ?? 0);
}
