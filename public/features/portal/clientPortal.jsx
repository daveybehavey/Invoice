(() => {
  const { useEffect, useState } = React;
  const { useNavigate, useParams } = ReactRouterDOM;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error("Missing /utils/requestIdentity.js load. Ensure it is loaded before /launcher.jsx.");
  }

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error("Missing /utils/formatters.js load. Ensure it is loaded before /launcher.jsx.");
  }

  const { apiFetch } = requestIdentity;
  const { formatMoney } = formatUtils;

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
    const nextStepTitle = isPaid ? "Paid in full" : paymentAvailable ? "Ready for payment" : "Review invoice";
    const nextStepBody = isPaid
      ? "Thanks, this invoice is marked paid. You can still review the details and past invoices below."
      : paymentAvailable
        ? "Pay securely online now, or review the line items and notes before paying."
        : "Review the details below. Contact the sender if you need a payment link or any changes.";
    const balanceCardClassName = isPaid
      ? "rounded-3xl bg-emerald-700 px-5 py-4 text-white shadow-lg shadow-emerald-900/10"
      : "rounded-3xl bg-slate-900 px-5 py-4 text-white shadow-lg shadow-slate-900/10";

    return (
      <div className="nb-page min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_36%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
        <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-5 sm:px-6 md:py-8">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">NoteBill portal</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Customer invoice portal
              </h1>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => navigate("/")}
            >
              Open app
            </button>
          </header>

          <section className="mt-5 rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
                <div className="h-24 animate-pulse rounded-3xl bg-slate-100" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                </div>
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
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

                <div className="overflow-hidden rounded-[26px] border border-emerald-200 bg-[linear-gradient(135deg,_#ecfdf5_0%,_#ffffff_52%,_#eef2ff_100%)] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Payment status</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{nextStepTitle}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{nextStepBody}</p>
                    </div>
                    {paymentAvailable ? (
                      <a
                        href={paymentLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800"
                      >
                        Pay online
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{statusLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{formatMoney(total)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{lineItems.length}</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">Invoice details</h3>
                    {paymentLinkUrl ? (
                      <a
                        href={paymentLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
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
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes and terms</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{notes}</p>
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-slate-200 bg-white p-4">
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
