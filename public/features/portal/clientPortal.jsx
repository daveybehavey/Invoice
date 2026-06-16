(() => {
  const { useEffect, useState } = React;
  const { useNavigate, useParams } = ReactRouterDOM;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error("Missing /utils/requestIdentity.js load. Ensure it is loaded before /launcher.jsx.");
  }

  const paymentMethodsUtils = window.InvoicePaymentMethods;
  if (!paymentMethodsUtils) {
    throw new Error("Missing /utils/paymentMethods.js load. Ensure it is loaded before /features/portal/clientPortal.jsx.");
  }

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error("Missing /utils/formatters.js load. Ensure it is loaded before /launcher.jsx.");
  }

  const { apiFetch } = requestIdentity;
  const { formatMoney } = formatUtils;
  const { getPaymentMethodDisplayData } = paymentMethodsUtils;

  function ClientPortalPage() {
    const navigate = useNavigate();
    const { invoiceId, token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [invoice, setInvoice] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
      let cancelled = false;
      const loadPortal = async () => {
        if (!invoiceId || !token) {
          setLoading(false);
          setError("This portal link is missing a token.");
          return;
        }
        setLoading(true);
        setError("");
        try {
          const response = await apiFetch(`/api/public/invoices/${invoiceId}/portal?token=${encodeURIComponent(token)}`);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "Portal link not found.");
          }
          if (!cancelled) {
            setInvoice(payload?.invoice ?? null);
            setHistory(Array.isArray(payload?.history) ? payload.history : []);
          }
        } catch (nextError) {
          if (!cancelled) {
            setError(nextError?.message || "Portal link not found.");
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void loadPortal();
      return () => {
        cancelled = true;
      };
    }, [invoiceId, token]);

    const finishedInvoice = invoice?.invoiceData?.finishedInvoice ?? null;
    const lineItems = Array.isArray(finishedInvoice?.lineItems) ? finishedInvoice.lineItems : [];
    const total = Number(finishedInvoice?.total ?? 0);
    const balanceDue = Number(finishedInvoice?.balanceDue ?? total);
    const paymentLinkUrl = typeof finishedInvoice?.paymentLinkUrl === "string" ? finishedInvoice.paymentLinkUrl.trim() : "";
    const paymentMethods = Array.isArray(finishedInvoice?.paymentMethods)
      ? finishedInvoice.paymentMethods.filter(
          (method) =>
            method?.enabled !== false &&
            (String(method?.label ?? "").trim() || String(method?.details ?? "").trim())
        )
      : [];
    const notes = typeof finishedInvoice?.notes === "string" ? finishedInvoice.notes.trim() : "";
    const customerName =
      finishedInvoice?.customerName ?? invoice?.invoiceData?.structuredInvoice?.customerName ?? "Customer";
    const statusLabel = (() => {
      const rawStatus = typeof invoice?.status === "string" ? invoice.status.trim() : "";
      if (!rawStatus) {
        return "Ready";
      }
      return rawStatus
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
        .join(" ");
    })();
    const isPaid = invoice?.status === "paid" || balanceDue <= 0;
    const paymentAvailable = Boolean(paymentLinkUrl) && !isPaid;
    const manualPaymentAvailable = paymentMethods.length > 0 && !isPaid;
    const nextStepTitle = isPaid
      ? "Paid in full"
      : paymentAvailable || manualPaymentAvailable
        ? "Ready for payment"
        : "Review invoice";
    const nextStepBody = isPaid
      ? "Thanks, this invoice is marked paid. You can still review the details and past invoices below."
      : paymentAvailable
        ? "Review the invoice details below, then pay securely online when you are ready."
        : manualPaymentAvailable
          ? "Review the invoice details below, then use the payment instructions provided. Contact the sender if you need a different payment path."
        : "Review the invoice details below. Contact the sender if you need a payment link, different payment instructions, or any changes.";
    const balanceCardClassName = isPaid
      ? "rounded-3xl bg-[#17493c] px-5 py-4 text-white shadow-lg shadow-[#17493c]/15"
      : "rounded-3xl bg-[#1f2b27] px-5 py-4 text-white shadow-lg shadow-slate-900/10";

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium mx-auto flex min-h-screen w-full max-w-4xl flex-col py-5 md:py-8">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="nb-kicker">NoteBill portal</p>
              <h1 className="nb-title mt-1 text-2xl sm:text-4xl">
                Customer invoice portal
              </h1>
            </div>
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-4 py-2 text-sm"
              onClick={() => navigate("/")}
            >
              Open app
            </button>
          </header>

          <section className="nb-surface nb-surface--elevated mt-5 rounded-[28px] p-5">
            {loading ? (
              <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading invoice portal">
                <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
                <div className="h-24 animate-pulse rounded-3xl bg-slate-100" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                </div>
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900" role="alert">
                <p className="text-sm font-semibold">Portal unavailable</p>
                <p className="mt-2 text-sm">{error}</p>
                <p className="mt-3 text-xs text-amber-800/90">
                  Ask the sender to refresh the portal link from NoteBill.
                </p>
              </div>
            ) : invoice ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {finishedInvoice?.invoiceNumber || "Invoice"}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">{customerName}</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {finishedInvoice?.dueDate ? `Due ${finishedInvoice.dueDate}` : "Due date not set"}
                      {finishedInvoice?.issueDate ? ` · Issued ${finishedInvoice.issueDate}` : ""}
                    </p>
                  </div>
                  <div className={balanceCardClassName}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">Balance due</p>
                    <p className="mt-1 text-3xl font-black tabular-nums">{formatMoney(balanceDue)}</p>
                  </div>
                </div>

                <div className="nb-highlight-panel overflow-hidden rounded-[26px] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="nb-kicker">Payment status</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{nextStepTitle}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{nextStepBody}</p>
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        Review first, then pay using the path shown here.
                      </p>
                    </div>
                    {paymentAvailable ? (
                      <a
                        href={paymentLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-full bg-[#17493c] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#17493c]/15 transition hover:-translate-y-0.5 hover:bg-[#1f5a49]"
                      >
                        Pay online
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="nb-focus-panel rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{statusLabel}</p>
                  </div>
                  <div className="nb-focus-panel rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{formatMoney(total)}</p>
                  </div>
                  <div className="nb-focus-panel rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{lineItems.length}</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#d8e7df] bg-[#f7fbf9] p-4 text-sm leading-6 text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">What this page gives you</p>
                  <p className="mt-2">
                    This portal keeps the invoice total, notes, and payment path together in one place so you do not need to piece the handoff together from separate messages.
                  </p>
                </div>

                <div className="nb-focus-panel rounded-[24px] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">Invoice details</h3>
                    {paymentLinkUrl ? (
                      <a
                        href={paymentLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-[#d5e5de] bg-white px-4 py-2 text-xs font-semibold text-[#17493c] transition hover:border-[#bcd2c8]"
                      >
                        Pay online
                      </a>
                    ) : null}
                  </div>
                  {lineItems.length > 0 ? (
                    <div className="mt-4 divide-y divide-slate-100">
                      {lineItems.map((item, index) => (
                        <div key={item.id || `${item.description}-${index}`} className="flex items-start justify-between gap-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.description}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {Number.isFinite(item.quantity) ? `${item.quantity}` : "1"}{" "}
                              {Number.isFinite(item.unitPrice) ? `· ${formatMoney(item.unitPrice)}` : ""}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">
                            {Number.isFinite(item.amount) ? formatMoney(item.amount) : formatMoney(0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">No line items were provided.</p>
                  )}
                </div>

                {notes ? (
                  <div className="nb-focus-panel rounded-[24px] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes and terms</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{notes}</p>
                  </div>
                ) : null}

                {paymentMethods.length > 0 ? (
                  <div className="nb-highlight-panel rounded-[24px] p-4">
                    <p className="nb-kicker">Payment instructions</p>
                    <div className="mt-3 space-y-3">
                      {paymentMethods.map((method, index) => {
                        const { label, details } = getPaymentMethodDisplayData(method);
                        return (
                          <div key={method?.id || `${label}-${index}`} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-slate-900">{label}</p>
                            {details ? (
                              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{details}</p>
                            ) : (
                              <p className="mt-2 text-sm leading-6 text-slate-500">
                                Ask the sender for payment details.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="nb-focus-panel rounded-[24px] p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Past invoices</h3>
                  {history.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {history.map((entry) => (
                        <div key={entry.invoiceId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {entry.invoiceNumber || entry.invoiceId}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Updated {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : "recently"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900 tabular-nums">
                                {formatMoney(entry.total ?? 0)}
                              </p>
                              <p className="text-xs text-slate-500">{entry.status}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No earlier invoices found for this customer.</p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  window.InvoicePortalFeature = {
    ClientPortalPage
  };
})();

