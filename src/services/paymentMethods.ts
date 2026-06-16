const PAYMENT_METHOD_KIND_LABELS = {
  cheque: "Cheque",
  etransfer: "E-transfer",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  custom: "Custom"
} as const;

export type PaymentMethodLike = {
  kind?: string;
  label?: string | null;
  details?: string | null;
  enabled?: boolean | null;
};

const toOptionalTrimmedString = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const escapeAttribute = (value: string): string => escapeHtml(value).replaceAll("`", "&#96;");

const normalizePaymentMethodKind = (kind?: string | null): keyof typeof PAYMENT_METHOD_KIND_LABELS => {
  const normalized = String(kind ?? "").trim() as keyof typeof PAYMENT_METHOD_KIND_LABELS;
  return PAYMENT_METHOD_KIND_LABELS[normalized] ? normalized : "custom";
};

const getPaymentMethodKindLabel = (kind?: string | null): string =>
  PAYMENT_METHOD_KIND_LABELS[normalizePaymentMethodKind(kind)] || PAYMENT_METHOD_KIND_LABELS.custom;

export const buildPaymentMethodTextLines = (paymentMethods: PaymentMethodLike[] | undefined): string => {
  const entries = (Array.isArray(paymentMethods) ? paymentMethods : []).filter(
    (method) => method?.enabled !== false && (String(method?.label ?? "").trim() || String(method?.details ?? "").trim())
  );
  if (entries.length === 0) {
    return "";
  }
  return [
    "Payment instructions:",
    ...entries.map((method) => {
      const label = toOptionalTrimmedString(method.label) ?? getPaymentMethodKindLabel(method.kind);
      const details = toOptionalTrimmedString(method.details);
      return details ? `- ${label}: ${details.replace(/\r?\n+/g, " | ")}` : `- ${label}`;
    })
  ].join("\n");
};

export const buildPaymentMethodHtml = (paymentMethods: PaymentMethodLike[] | undefined): string => {
  const entries = (Array.isArray(paymentMethods) ? paymentMethods : []).filter(
    (method) => method?.enabled !== false && (String(method?.label ?? "").trim() || String(method?.details ?? "").trim())
  );
  if (entries.length === 0) {
    return "";
  }
  const items = entries
    .map((method) => {
      const label = escapeHtml(toOptionalTrimmedString(method.label) ?? getPaymentMethodKindLabel(method.kind));
      const details = escapeHtml(toOptionalTrimmedString(method.details) ?? "");
      const detailMarkup = details
        ? `<div style="margin-top:4px;font-size:13px;line-height:1.55;color:#0f172a;white-space:pre-wrap;">${details}</div>`
        : "";
      return `<div style="padding:10px 0;border-top:1px solid #dcfce7;"><div style="font-size:14px;font-weight:700;color:#065f46;">${label}</div>${detailMarkup}</div>`;
    })
    .join("");
  return `<div style="margin-top:14px;">${items}</div>`;
};

export const buildPaymentMethodPdfLabel = (kind?: string | null): string => getPaymentMethodKindLabel(kind);
