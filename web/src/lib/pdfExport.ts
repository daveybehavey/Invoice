import { getStoredOwnerId, getStoredSessionToken } from "./localStore";
import type { BusinessProfile, FinishedInvoice, InvoiceThemeId } from "./types";

function mapThemeToStylePreset(theme: InvoiceThemeId): string {
  switch (theme) {
    case "editorial":
      return "editorial";
    case "bold_trade":
      return "bold";
    case "clean_minimal":
      return "minimal";
    default:
      return "classic";
  }
}

export async function exportInvoicePdf(input: {
  invoice: FinishedInvoice;
  profile: BusinessProfile;
  customerEmail?: string;
  theme?: InvoiceThemeId;
  poweredByVisible?: boolean;
}): Promise<{ method: "download" | "print"; filename?: string }> {
  const safeLineItems = input.invoice.lineItems.filter((item) => item.description.trim().length > 0);
  if (safeLineItems.length === 0) {
    window.print();
    return { method: "print" };
  }

  const fromLines = [
    input.profile.businessName,
    input.profile.address,
    input.profile.phone,
    input.profile.email
  ]
    .filter((v) => v && v.trim())
    .join("\n");

  const payload = {
    invoice: {
      ...input.invoice,
      lineItems: safeLineItems
    },
    fromDetails: fromLines || undefined,
    businessRegistrations: input.profile.taxIdValue
      ? [
          {
            label: input.profile.taxIdLabel || "Tax ID",
            value: input.profile.taxIdValue,
            visible: true
          }
        ]
      : undefined,
    registrationBlockVisible: Boolean(input.profile.taxIdValue),
    billToDetails: input.customerEmail || undefined,
    accentColor: input.profile.accentColor || "#0F5132",
    stylePreset: mapThemeToStylePreset(input.theme || input.profile.defaultTheme),
    logoUrl: input.profile.logoDataUrl || undefined,
    logoVisible: Boolean(input.profile.logoDataUrl),
    notesVisible: true,
    poweredByVisible: input.poweredByVisible
  };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-invoice-user-id": getStoredOwnerId()
    };
    const token = getStoredSessionToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const res = await fetch("/api/invoices/export-pdf", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      window.print();
      return { method: "print" };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const filename = `${input.invoice.documentType === "estimate" ? "estimate" : "invoice"}-${
      input.invoice.invoiceNumber || "draft"
    }.pdf`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { method: "download", filename };
  } catch {
    window.print();
    return { method: "print" };
  }
}
