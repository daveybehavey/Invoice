import fs from "node:fs/promises";
import path from "node:path";
import { createInvoicePdfBuffer } from "../src/services/invoicePdf.js";

const outputDirectories = [
  path.resolve("marketing", "landing", "invoice-export-samples"),
  path.resolve("public", "landing", "invoice-export-samples")
];

const samples = [
  {
    fileName: "classic-split.pdf",
    label: "Painter finish work",
    accentColor: "#0f9d6e",
    stylePreset: "default",
    headerLayout: "split" as const,
    spacingDensity: "balanced" as const,
    fromDetails: "North Shore Paint Co\n145 Cedar Avenue\nNanaimo, BC V9R 2K1\nbilling@northshorepaint.co",
    billToDetails: "Lark & Pine Studio\nAttention: M. Russo\n18 Harbour Street\nNanaimo, BC V9R 5A9",
    invoice: {
      documentType: "invoice" as const,
      invoiceNumber: "NSP-2048",
      issueDate: "Jun 7, 2026",
      dueDate: "Jun 21, 2026",
      customerName: "Lark & Pine Studio",
      currency: "USD",
      lineItems: [
        {
          id: "li-1",
          type: "labor" as const,
          description: "Kitchen cabinet repaint and finish protection",
          quantity: 1,
          unitPrice: 480,
          amount: 480
        },
        {
          id: "li-2",
          type: "labor" as const,
          description: "Site prep, masking, and final touch-up visit",
          quantity: 1,
          unitPrice: 225,
          amount: 225
        },
        {
          id: "li-3",
          type: "material" as const,
          description: "Primer, cabinet enamel, rollers, masking film",
          quantity: 1,
          unitPrice: 138,
          amount: 138
        }
      ],
      notes:
        "Thank you for the project. Payment is due within 14 days. Please reply if you want us to schedule the next room while this one is drying.",
      paymentLinkUrl: "https://pay.notebill.app/invoice/NSP-2048",
      paymentMethods: [
        {
          id: "pm-1",
          kind: "etransfer" as const,
          label: "e-Transfer",
          details: "Send to billing@northshorepaint.co with invoice NSP-2048 in the note.",
          enabled: true
        },
        {
          id: "pm-2",
          kind: "custom" as const,
          label: "Card",
          details: "Use the secure payment link above to pay by card.",
          enabled: true
        }
      ],
      subtotal: 843,
      total: 843,
      balanceDue: 843,
      paymentRecords: []
    }
  },
  {
    fileName: "minimal-centered.pdf",
    label: "HVAC service call",
    accentColor: "#475569",
    stylePreset: "compact",
    headerLayout: "centered" as const,
    spacingDensity: "tight" as const,
    fromDetails: "Harbour HVAC Service\nVictoria, BC\nservice@harbourhvac.ca",
    billToDetails: "Harbour Built Interiors\n37 Front Street\nVictoria, BC V8W 1Y2",
    invoice: {
      documentType: "invoice" as const,
      invoiceNumber: "HHS-8821",
      issueDate: "Jun 3, 2026",
      dueDate: "Jun 10, 2026",
      customerName: "Harbour Built Interiors",
      currency: "USD",
      lineItems: [
        {
          id: "li-1",
          type: "labor" as const,
          description: "HVAC diagnostics and rooftop unit reset",
          quantity: 1.5,
          unitPrice: 140,
          amount: 210
        },
        {
          id: "li-2",
          type: "material" as const,
          description: "Replacement contactor and control fuse",
          quantity: 1,
          unitPrice: 94,
          amount: 94
        },
        {
          id: "li-3",
          type: "other" as const,
          description: "After-hours dispatch fee",
          quantity: 1,
          unitPrice: 65,
          amount: 65
        }
      ],
      notes:
        "Cooling restored during the visit. Recommend a follow-up maintenance check within 30 days if the unit trips again during warmer weather.",
      paymentLinkUrl: "https://pay.notebill.app/invoice/HHS-8821",
      paymentMethods: [
        {
          id: "pm-1",
          kind: "bank_transfer" as const,
          label: "Bank transfer",
          details: "ACH available on request. Include invoice HHS-8821 in your remittance note.",
          enabled: true
        },
        {
          id: "pm-2",
          kind: "custom" as const,
          label: "Card",
          details: "Pay online using the secure link above.",
          enabled: true
        }
      ],
      subtotal: 369,
      total: 369,
      balanceDue: 369,
      paymentRecords: []
    }
  },
  {
    fileName: "bold-split.pdf",
    label: "Landscape monthly billing",
    accentColor: "#1d4ed8",
    stylePreset: "spacious",
    headerLayout: "split" as const,
    spacingDensity: "airy" as const,
    fromDetails:
      "Cedar Ridge Grounds Co\n2840 Marine Drive\nWest Vancouver, BC V7V 1L9\naccounts@cedarridgegrounds.ca",
    billToDetails:
      "Westline Property Care\nAttn: Jen Morales\nSuite 204, 905 Main Street\nWest Vancouver, BC V7T 2Z3",
    invoice: {
      documentType: "invoice" as const,
      invoiceNumber: "CRG-3316",
      issueDate: "Jun 1, 2026",
      dueDate: "Jun 15, 2026",
      customerName: "Westline Property Care",
      currency: "USD",
      lineItems: [
        {
          id: "li-1",
          type: "labor" as const,
          description: "Weekly landscape maintenance for May",
          quantity: 4,
          unitPrice: 185,
          amount: 740
        },
        {
          id: "li-2",
          type: "material" as const,
          description: "Cedar mulch top-up for front entrance beds",
          quantity: 1,
          unitPrice: 126,
          amount: 126
        },
        {
          id: "li-3",
          type: "other" as const,
          description: "Green waste haul-away and disposal",
          quantity: 1,
          unitPrice: 88,
          amount: 88
        }
      ],
      notes:
        "Includes May service visits and curb appeal cleanup before the strata board walkthrough. June pruning can be added to the next cycle if approved this week.",
      paymentLinkUrl: "https://pay.notebill.app/invoice/CRG-3316",
      paymentMethods: [
        {
          id: "pm-1",
          kind: "etransfer" as const,
          label: "e-Transfer",
          details: "Send to accounts@cedarridgegrounds.ca with invoice CRG-3316 in the message.",
          enabled: true
        },
        {
          id: "pm-2",
          kind: "custom" as const,
          label: "Card",
          details: "Card payment is available through the secure link above.",
          enabled: true
        }
      ],
      subtotal: 954,
      total: 954,
      balanceDue: 954,
      paymentRecords: []
    }
  }
];

for (const dir of outputDirectories) {
  await fs.mkdir(dir, { recursive: true });
}

for (const sample of samples) {
  const pdfBuffer = await createInvoicePdfBuffer({
    invoice: sample.invoice,
    accentColor: sample.accentColor,
    stylePreset: sample.stylePreset,
    headerLayout: sample.headerLayout,
    spacingDensity: sample.spacingDensity,
    fromDetails: sample.fromDetails,
    billToDetails: sample.billToDetails,
    businessRegistrations: [{ label: "GST", value: "74291 1845 RT0001", visible: true }],
    registrationBlockVisible: true,
    notesVisible: true,
    logoVisible: false
  });

  await Promise.all(
    outputDirectories.map((dir) => fs.writeFile(path.join(dir, sample.fileName), pdfBuffer))
  );
}

console.log(
  `Generated ${samples.length} invoice export samples in ${outputDirectories
    .map((dir) => path.relative(process.cwd(), dir))
    .join(" and ")}`
);
