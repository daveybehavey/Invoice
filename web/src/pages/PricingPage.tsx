import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, CreditCard, Info, ShieldCheck, X } from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import {
  AuthRequiredError,
  openStripeBillingPortal,
  startProCheckoutSession,
  trackClientRevenueSignal
} from "../lib/api";

export function PricingPage() {
  const { session, plan, openAuthModal, showToast } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [loading, setLoading] = useState(false);

  const isUpgradeCancelled = searchParams.get("upgrade") === "cancelled";

  const handleUpgrade = async () => {
    if (!termsAccepted) {
      showToast("Please accept the Terms & Privacy Policy before checkout.", "warning");
      return;
    }
    if (!session) {
      openAuthModal("Sign in first so your NoteBill Pro subscription links to your account.", "/pricing");
      return;
    }
    setLoading(true);
    trackClientRevenueSignal("checkout_started", "v3_pricing");
    try {
      const { checkoutUrl } = await startProCheckoutSession({
        successPath: "/brand?upgrade=success",
        cancelPath: "/pricing?upgrade=cancelled",
        termsAccepted: true,
        termsVersion: "2026-11-03.1"
      });
      if (!checkoutUrl) {
        throw new Error("Stripe checkout URL was empty.");
      }
      window.location.href = checkoutUrl;
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal(err.message, "/pricing");
      } else {
        showToast(err instanceof Error ? err.message : "Could not open checkout.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setLoading(true);
    try {
      const { portalUrl } = await openStripeBillingPortal();
      if (portalUrl) {
        window.location.href = portalUrl;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not open billing portal.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell mode="marketing">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        {isUpgradeCancelled && (
          <div className="mb-8 flex items-center justify-between gap-3 rounded-xl border border-[#D9E0DC] bg-white px-4 py-3 text-sm text-[#101915] shadow-sm">
            <div className="flex items-center gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-[#0F5132]" />
              <span>Checkout cancelled — you were not charged.</span>
            </div>
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              aria-label="Dismiss checkout cancelled notice"
              className="rounded-lg p-1 text-[#6B7A72] hover:bg-[#F5F6F2] hover:text-[#101915]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0F5132]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Transparent Pricing · Cancel Anytime
          </span>
          <h1 className="mt-4 font-serif text-4xl font-bold text-[#101915]">
            Pay only when NoteBill saves you hours and collects cash faster.
          </h1>
          <p className="mt-3 text-base text-[#47554E]">
            We never paywall exporting your own invoice or fixing AI mistakes.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E2E7E3] bg-white p-7 shadow-card">
            <div>
              <h2 className="text-lg font-bold text-[#101915]">Free</h2>
              <p className="mt-1 text-xs text-[#6B7A72]">Try NoteBill on real jobs with zero pressure.</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold text-[#101915]">$0</span>
                <span className="text-sm text-[#6B7A72]">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-[#47554E]">
                {[
                  "Unlimited local rough-note drafts & live invoice builder",
                  "4 clean invoice themes + PDF download",
                  "Device Truck Scratchpad & voice dictation",
                  "Up to 3 cloud-saved invoices per month",
                  "Subtle Powered by NoteBill footer"
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F5132]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              to="/create"
              className="mt-8 block w-full rounded-xl border border-[#D9E0DC] bg-[#F5F6F2] py-3 text-center text-sm font-semibold text-[#101915] hover:bg-[#E8F5EE]"
            >
              Open Workbench Free
            </Link>
          </div>

          {/* Pro */}
          <div className="flex flex-col justify-between rounded-2xl border-2 border-[#0F5132] bg-white p-7 shadow-paper">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#0F5132]">NoteBill Pro</h2>
                <span className="rounded-full bg-[#E8F5EE] px-2.5 py-0.5 text-xs font-bold text-[#0F5132]">
                  7-day goodwill refund
                </span>
              </div>
              <p className="mt-1 text-xs text-[#6B7A72]">
                Everything solo trades &amp; freelancers need to quote, bill, and collect cash fast.
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-mono text-4xl font-bold text-[#101915]">$19</span>
                <span className="text-sm text-[#6B7A72]">USD / month</span>
                <span className="ml-auto rounded-lg bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold text-[#B45309]">
                  Annual $149/yr option coming
                </span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-[#47554E]">
                {[
                  "Unlimited cloud-saved invoices, quotes & zero watermark",
                  "Good/Better/Best quotes, e-signature approval & deposits",
                  "Before/After job-site photo proof on PDFs & Client Portal",
                  "Live Job Timer, Trade Quick-Bundles & Materials Markup",
                  "1-tap Email + SMS + WhatsApp + Stripe / Multi-Pay Portal",
                  "Polite auto-chase ladder, Google Review Ask & Tax CSV export",
                  "Billie AI note parsing, receipt OCR & repeat-client memory"
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F5132]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 space-y-3">
              {plan?.plan === "pro" ? (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0F5132] bg-[#E8F5EE] py-3 text-sm font-semibold text-[#0F5132] hover:bg-[#0F5132] hover:text-white"
                >
                  <CreditCard className="h-4 w-4" />
                  <span>{loading ? "Opening..." : "Manage Pro Subscription"}</span>
                </button>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-xs text-[#47554E]">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-[#D9E0DC] text-[#0F5132] focus:ring-[#0F5132]"
                    />
                    <span>
                      I agree to the{" "}
                      <Link to="/terms?version=2026-11-03.1" className="font-semibold text-[#0F5132] underline">
                        Terms of Service
                      </Link>{" "}
                      (auto-renews at $19 USD/mo, cancel anytime).
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={handleUpgrade}
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F5132] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#146C43] disabled:opacity-60"
                  >
                    <CreditCard className="h-4 w-4" />
                    <span>{loading ? "Starting Checkout..." : "Upgrade to NoteBill Pro"}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
