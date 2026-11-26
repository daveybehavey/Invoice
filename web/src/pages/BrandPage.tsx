import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Download, ExternalLink, LogOut, Mail, Package, Plus, Shield, Star, Trash2, Upload, Wallet } from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { openStripeBillingPortal, requestContractCopy } from "../lib/api";
import {
  clearAllClientMemory,
  deleteSavedClient,
  deleteSavedService,
  deleteTradeBundle,
  getSavedClients,
  getSavedServices,
  getTradeBundles,
  saveTradeBundle
} from "../lib/localStore";
import type { InvoiceThemeId, LineItemType } from "../lib/types";

export function BrandPage() {
  const { session, plan, profile, updateProfile, openAuthModal, handleSignOut, refreshAuth, showToast } = useApp();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState(() => getSavedClients());
  const [services, setServices] = useState(() => getSavedServices());
  const [bundles, setBundles] = useState(() => getTradeBundles());
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundlePrice, setNewBundlePrice] = useState("");
  const [newBundleType, setNewBundleType] = useState<LineItemType>("labor");
  const [billingBusy, setBillingBusy] = useState(false);
  const [contractBusy, setContractBusy] = useState(false);
  const [contractMsg, setContractMsg] = useState<string | null>(null);

  const isUpgradeSuccess = searchParams.get("upgrade") === "success" || searchParams.get("billing") === "success";
  const acceptedTermsVersion = searchParams.get("acceptedTermsVersion")?.trim() || "2026-11-03.1";

  useEffect(() => {
    if (isUpgradeSuccess) {
      void refreshAuth();
    }
    // refreshAuth is stable in AppContext
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpgradeSuccess]);

  const handleEmailContractCopy = async () => {
    if (!session) {
      openAuthModal("Sign in to email your NoteBill Pro contract copy.", `/brand?upgrade=success&acceptedTermsVersion=${encodeURIComponent(acceptedTermsVersion)}`);
      return;
    }
    setContractBusy(true);
    setContractMsg(null);
    try {
      const res = await requestContractCopy(acceptedTermsVersion);
      if (res.delivered) {
        setContractMsg(
          res.coalesced
            ? "Contract copy was already sent recently to your account email."
            : "Contract copy emailed to your signed-in account address."
        );
      } else {
        setContractMsg("Email delivery is unavailable right now. Use Download Terms (.txt) to save a copy.");
      }
    } catch (err) {
      setContractMsg(err instanceof Error ? err.message : "Could not send contract copy email.");
    } finally {
      setContractBusy(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateProfile({ ...profile, logoDataUrl: reader.result });
        showToast("Logo updated.", "success");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOpenBillingPortal = async () => {
    setBillingBusy(true);
    try {
      const { portalUrl } = await openStripeBillingPortal();
      if (portalUrl) window.location.href = portalUrl;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not open billing portal.", "error");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleAddBundle = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBundleName.trim();
    const price = Number.parseFloat(newBundlePrice);
    if (!name || !Number.isFinite(price) || price < 0) return;
    const next = saveTradeBundle({
      id: `bnd_${Date.now().toString(36)}`,
      name,
      description: name,
      type: newBundleType,
      quantity: 1,
      unitPrice: price
    });
    setBundles(next);
    setNewBundleName("");
    setNewBundlePrice("");
    showToast("Saved quick-bundle!", "success");
  };

  const themeLabels: Array<{ id: InvoiceThemeId; name: string; desc: string }> = useMemo(
    () => [
      { id: "field_pro", name: "Field Pro", desc: "Emerald rule, high-readability trade layout" },
      { id: "editorial", name: "Editorial", desc: "Fraunces serif header, timeless studio feel" },
      { id: "bold_trade", name: "Bold Trade", desc: "Charcoal header bar, punchy contrast" },
      { id: "clean_minimal", name: "Clean Minimal", desc: "Lightweight hairline grid" }
    ],
    []
  );

  return (
    <AppShell mode="workspace">
      {isUpgradeSuccess && (
        <div className="mb-6 rounded-2xl border border-[#0F5132]/30 bg-[#E8F5EE] p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0F5132]" />
              <div>
                <h2 className="font-serif text-lg font-bold text-[#101915]">NoteBill Pro checkout completed</h2>
                <p className="mt-0.5 text-xs text-[#47554E]">
                  Your subscription is syncing. Accepted Terms version:{" "}
                  <span className="font-mono font-semibold text-[#101915]">{acceptedTermsVersion}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/terms?version=${encodeURIComponent(acceptedTermsVersion)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F5132]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                <ExternalLink className="h-3.5 w-3.5 text-[#0F5132]" />
                <span>Open versioned Terms</span>
              </Link>
              <a
                href={`/api/legal/documents/terms?version=${encodeURIComponent(acceptedTermsVersion)}&format=txt`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F5132]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                <Download className="h-3.5 w-3.5 text-[#0F5132]" />
                <span>Download Terms (.txt)</span>
              </a>
              <button
                type="button"
                disabled={contractBusy}
                onClick={() => void handleEmailContractCopy()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5132] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#146C43] disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>{contractBusy ? "Sending..." : "Email me a copy"}</span>
              </button>
            </div>
          </div>
          {contractMsg && <p className="mt-3 text-xs font-medium text-[#0F5132]">{contractMsg}</p>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Business Identity, Payment Methods, Defaults & Theme */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card">
            <h1 className="font-serif text-2xl font-bold text-[#101915]">Business Identity & Defaults</h1>
            <p className="mt-1 text-xs text-[#6B7A72]">
              Appears on your invoices, quotes, and PDFs. Saved automatically on this device.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#47554E]">Business Name</label>
                <input
                  type="text"
                  value={profile.businessName}
                  onChange={(e) => updateProfile({ ...profile, businessName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#47554E]">Business Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => updateProfile({ ...profile, email: e.target.value })}
                  placeholder="billing@yourtrade.com"
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#47554E]">Phone</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => updateProfile({ ...profile, phone: e.target.value })}
                  placeholder="(555) 012-3456"
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#47554E]">Address</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={(e) => updateProfile({ ...profile, address: e.target.value })}
                  placeholder="123 Main St, City, State/Province"
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#47554E]">Tax ID Label</label>
                <input
                  type="text"
                  value={profile.taxIdLabel}
                  onChange={(e) => updateProfile({ ...profile, taxIdLabel: e.target.value })}
                  placeholder="GST / EIN / ABN"
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#47554E]">Tax ID Value</label>
                <input
                  type="text"
                  value={profile.taxIdValue}
                  onChange={(e) => updateProfile({ ...profile, taxIdValue: e.target.value })}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#47554E]">Default Hourly Rate ($)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={profile.defaultHourlyRate ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...profile,
                      defaultHourlyRate: e.target.value === "" ? undefined : Number(e.target.value)
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#47554E]">Default Tax %</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  value={profile.defaultTaxRate}
                  onChange={(e) =>
                    updateProfile({
                      ...profile,
                      defaultTaxRate: Math.max(0, Number.parseFloat(e.target.value) || 0)
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-sm outline-none focus:border-[#0F5132]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#47554E]">
                  <Star className="h-3.5 w-3.5 text-[#0F5132]" />
                  <span>Google Business Review Link (Auto-attached to Paid Receipts)</span>
                </label>
                <input
                  type="url"
                  value={profile.googleReviewUrl}
                  onChange={(e) => updateProfile({ ...profile, googleReviewUrl: e.target.value })}
                  placeholder="https://g.page/r/your-business/review"
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[#E2E7E3] pt-4">
              {profile.logoDataUrl && (
                <img
                  src={profile.logoDataUrl}
                  alt="Business logo"
                  className="h-12 w-12 rounded-lg border border-[#E2E7E3] object-contain p-1"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D9E0DC] bg-white px-3.5 py-2 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]">
                <Upload className="h-3.5 w-3.5 text-[#0F5132]" />
                <span>{profile.logoDataUrl ? "Replace Logo" : "Upload Logo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              {profile.logoDataUrl && (
                <button
                  type="button"
                  onClick={() => updateProfile({ ...profile, logoDataUrl: undefined })}
                  className="text-xs font-semibold text-[#9F1239] hover:underline"
                >
                  Remove Logo
                </button>
              )}
            </div>
          </section>

          {/* Payment Methods Accepted */}
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#0F5132]" />
              <h2 className="text-base font-bold text-[#101915]">Accepted Payment Methods</h2>
            </div>
            <p className="mt-1 text-xs text-[#6B7A72]">
              Toggle which non-card methods appear on your invoices & Client Portal with 1-tap copy buttons.
            </p>
            <div className="mt-4 space-y-2.5">
              {profile.defaultPaymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-col gap-2 rounded-xl border border-[#E2E7E3] p-3 sm:flex-row sm:items-center"
                >
                  <label className="flex min-w-[155px] items-center gap-2 text-xs font-bold text-[#101915]">
                    <input
                      type="checkbox"
                      checked={Boolean(method.enabled)}
                      onChange={(e) =>
                        updateProfile({
                          ...profile,
                          defaultPaymentMethods: profile.defaultPaymentMethods.map((m) =>
                            m.id === method.id ? { ...m, enabled: e.target.checked } : m
                          )
                        })
                      }
                      className="rounded border-[#D9E0DC] text-[#0F5132]"
                    />
                    <span>{method.label || method.kind}</span>
                  </label>
                  <input
                    type="text"
                    value={method.details || ""}
                    onChange={(e) =>
                      updateProfile({
                        ...profile,
                        defaultPaymentMethods: profile.defaultPaymentMethods.map((m) =>
                          m.id === method.id ? { ...m, details: e.target.value } : m
                        )
                      })
                    }
                    placeholder={`Enter ${method.label || method.kind} handle, email, or instructions`}
                    className="flex-1 rounded-lg border border-[#D9E0DC] px-2.5 py-1.5 text-xs outline-none focus:border-[#0F5132]"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Default Theme */}
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card">
            <h2 className="text-base font-bold text-[#101915]">Default Invoice Theme</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {themeLabels.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateProfile({ ...profile, defaultTheme: t.id })}
                  className={`rounded-xl border p-3.5 text-left transition ${
                    profile.defaultTheme === t.id
                      ? "border-[#0F5132] bg-[#E8F5EE]/50 ring-2 ring-[#0F5132]/20"
                      : "border-[#E2E7E3] bg-white hover:bg-[#F5F6F2]"
                  }`}
                >
                  <div className="text-sm font-bold text-[#101915]">{t.name}</div>
                  <div className="mt-0.5 text-xs text-[#6B7A72]">{t.desc}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Account, Quick-Bundles Manager & Memory Trust Controls */}
        <div className="space-y-6 lg:col-span-5">
          {/* Account & Plan */}
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card">
            <h2 className="text-base font-bold text-[#101915]">Account & Subscription</h2>
            {session ? (
              <div className="mt-3 space-y-4">
                <div className="rounded-xl bg-[#F5F6F2] p-3.5">
                  <div className="text-xs text-[#6B7A72]">Signed in as</div>
                  <div className="text-sm font-bold text-[#101915]">{session.email}</div>
                  {plan && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#0F5132]">
                      <span>Plan: {plan.plan.toUpperCase()}</span>
                      {plan.limits.invoicesPerMonth && (
                        <span className="font-mono text-[#47554E]">
                          ({plan.usage.invoicesCreated}/{plan.limits.invoicesPerMonth} this mo)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {plan?.plan === "pro" ? (
                    <button
                      type="button"
                      disabled={billingBusy}
                      onClick={() => void handleOpenBillingPortal()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#101915] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F5132]"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Manage Billing</span>
                    </button>
                  ) : (
                    <Link
                      to="/pricing"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F5132] px-4 py-2 text-xs font-semibold text-white hover:bg-[#146C43]"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Upgrade to Pro ($19/mo)</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0DC] bg-white px-3.5 py-2 text-xs font-semibold text-[#47554E] hover:bg-[#F5F6F2]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-[#47554E]">
                  You are currently using NoteBill in local device mode. Sign in to sync invoices and unlock Pro
                  sending & payment tools.
                </p>
                <button
                  type="button"
                  onClick={() => openAuthModal(undefined, "/brand")}
                  className="rounded-xl bg-[#0F5132] px-4 py-2 text-xs font-semibold text-white hover:bg-[#146C43]"
                >
                  Sign In
                </button>
              </div>
            )}
          </section>

          {/* Trade Quick-Bundles Manager */}
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-[#0F5132]" />
              <h2 className="text-base font-bold text-[#101915]">1-Tap Trade Quick-Bundles</h2>
            </div>
            <p className="mt-1 text-xs text-[#6B7A72]">
              Saved shortcuts available inside the Create workbench.
            </p>

            <form onSubmit={handleAddBundle} className="mt-3 flex flex-wrap gap-2">
              <input
                type="text"
                value={newBundleName}
                onChange={(e) => setNewBundleName(e.target.value)}
                placeholder="Item name (e.g. Trip Fee)"
                className="min-w-[140px] flex-1 rounded-xl border border-[#D9E0DC] px-2.5 py-1.5 text-xs outline-none focus:border-[#0F5132]"
              />
              <input
                type="number"
                step="any"
                min="0"
                value={newBundlePrice}
                onChange={(e) => setNewBundlePrice(e.target.value)}
                placeholder="$ Price"
                className="w-20 rounded-xl border border-[#D9E0DC] px-2.5 py-1.5 font-mono text-xs outline-none focus:border-[#0F5132]"
              />
              <select
                value={newBundleType}
                onChange={(e) => setNewBundleType(e.target.value as LineItemType)}
                className="rounded-xl border border-[#D9E0DC] bg-white px-2 py-1.5 text-xs"
              >
                <option value="labor">Labor</option>
                <option value="material">Material</option>
                <option value="other">Other</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl bg-[#101915] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F5132]"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </form>

            <div className="mt-3 space-y-2">
              {bundles.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-[#E2E7E3] px-3 py-2"
                >
                  <div className="text-xs font-semibold text-[#101915]">
                    {b.name} <span className="ml-1 font-mono text-[#0F5132]">${b.unitPrice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBundles(deleteTradeBundle(b.id))}
                    className="rounded p-1 text-[#6B7A72] hover:text-[#9F1239]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Remembered Client & Service Memory */}
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#0F5132]" />
                <h2 className="text-base font-bold text-[#101915]">Client & Rate Memory</h2>
              </div>
              {(clients.length > 0 || services.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    clearAllClientMemory();
                    setClients([]);
                    setServices([]);
                    showToast("Cleared all remembered clients and services.", "info");
                  }}
                  className="text-xs font-semibold text-[#9F1239] hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-[#6B7A72]">
              Inspectable repeat-client shortcuts stored on this device. Remove any entry anytime.
            </p>

            {clients.length === 0 && services.length === 0 ? (
              <p className="mt-4 text-xs text-[#6B7A72]">
                No remembered clients yet — they appear automatically as you save invoices.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {clients.map((cli) => (
                  <div
                    key={cli.id}
                    className="flex items-center justify-between rounded-xl border border-[#E2E7E3] px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#101915]">{cli.name}</div>
                      <div className="text-[11px] text-[#6B7A72]">
                        {cli.lastHourlyRate ? `$${cli.lastHourlyRate}/hr · ` : ""}
                        {cli.lastServices.length} saved line(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClients(deleteSavedClient(cli.id))}
                      className="rounded p-1 text-[#6B7A72] hover:text-[#9F1239]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {services.slice(0, 6).map((svc) => (
                  <div
                    key={svc.id}
                    className="flex items-center justify-between rounded-xl bg-[#F5F6F2] px-3 py-2"
                  >
                    <div className="text-xs font-medium text-[#101915]">
                      {svc.description}
                      {typeof svc.defaultRate === "number" && (
                        <span className="ml-2 font-mono text-[11px] text-[#0F5132]">${svc.defaultRate}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setServices(deleteSavedService(svc.id))}
                      className="rounded p-1 text-[#6B7A72] hover:text-[#9F1239]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
