(() => {
  const { useNavigate } = ReactRouterDOM;
  const { useEffect, useMemo, useState } = React;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }

  const businessProfileUtils = window.InvoiceBusinessProfile;
  if (!businessProfileUtils) {
    throw new Error(
      "Missing /utils/businessProfile.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }

  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }
  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }

  const brandThemeUtils = window.InvoiceBrandTheme;
  if (!brandThemeUtils) {
    throw new Error(
      "Missing /utils/brandTheme.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }

  const styleCatalogUtils = window.InvoiceManualStyleCatalog;
  if (!styleCatalogUtils) {
    throw new Error(
      "Missing /utils/manualStyleCatalog.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }

  const logoImageUtils = window.InvoiceLogoImage;
  if (!logoImageUtils) {
    throw new Error(
      "Missing /utils/logoImage.js load. Ensure it is loaded before /features/settings/businessIdentity.jsx."
    );
  }

  const { getBusinessProfile, saveBusinessProfile, clearBusinessProfile, normalizeBusinessProfile } =
    businessProfileUtils;
  const { getClientMemory, deleteClientMemoryEntry, clearClientMemory } = clientMemoryUtils;
  const { getLineItemLibrary, saveLineItemLibrary } = lineItemLibraryUtils;
  const { DEFAULT_ACCENT_COLOR, normalizeAccentColor, buildAccentPalette } = brandThemeUtils;
  const { STYLE_OPTIONS, STYLE_PRESETS } = styleCatalogUtils;
  const { readLogoFileForStorage } = logoImageUtils;

  const formatMemoryDate = (value) => {
    if (!value) {
      return "Saved recently";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "Saved recently";
    }
    return `Updated ${parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const formatRecurringCadence = (intervalDays) => {
    const days = Number(intervalDays);
    if (!Number.isFinite(days) || days <= 0) {
      return "";
    }
    if (days === 7) {
      return "Weekly";
    }
    if (days === 14) {
      return "Biweekly";
    }
    if (days === 30) {
      return "Monthly";
    }
    if (days === 90) {
      return "Quarterly";
    }
    return `Every ${Math.round(days)} days`;
  };

  const buildMemoryStats = (memory) => {
    const entries = Array.isArray(memory) ? memory : [];
    return {
      total: entries.length,
      withEmail: entries.filter((entry) => entry.recipientEmail).length,
      withNotes: entries.filter((entry) => entry.defaultNotes).length,
      withCadence: entries.filter((entry) => entry.recurringIntervalDays).length
    };
  };

  const formatServiceMoney = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount === 0) {
      return "";
    }
    return new Intl.NumberFormat([], {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(amount);
  };

  const buildServiceStats = (entries) => {
    const items = Array.isArray(entries) ? entries : [];
    return {
      total: items.length,
      withRate: items.filter((entry) => Number(entry?.rate) > 0).length,
      withQty: items.filter((entry) => Number(entry?.qty) > 0).length,
      withClient: items.filter((entry) => Boolean(entry?.clientName)).length
    };
  };

  function BusinessIdentitySettings() {
    const navigate = useNavigate();
    const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
    const [fromDetails, setFromDetails] = useState("");
    const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
    const [stylePreset, setStylePreset] = useState("default");
    const [logoUrl, setLogoUrl] = useState(null);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
      let active = true;
      requestIdentity
        .refreshSession()
        .then((session) => {
          if (!active) {
            return;
          }
          setAuthSession(session);
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setAuthSession(null);
        });
      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      const profile = getBusinessProfile();
      setFromDetails(profile.fromDetails ?? "");
      setAccentColor(normalizeAccentColor(profile.accentColor ?? DEFAULT_ACCENT_COLOR));
      setStylePreset(profile.stylePreset ?? "default");
      setLogoUrl(profile.logoUrl ?? null);
    }, []);

    const activePreset = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.default;
    const accent = useMemo(() => buildAccentPalette(accentColor), [accentColor]);

    const handleSave = () => {
      try {
        const profile = saveBusinessProfile({
          fromDetails,
          accentColor,
          stylePreset,
          logoUrl
        });
        setFromDetails(profile.fromDetails);
        setAccentColor(profile.accentColor);
        setStylePreset(profile.stylePreset);
        setLogoUrl(profile.logoUrl);
        setStatus("Business identity saved.");
        setError("");
      } catch (_error) {
        setError("Couldn't save identity. Try again.");
      }
    };

    const handleReset = () => {
      clearBusinessProfile();
      const resetProfile = normalizeBusinessProfile({});
      setFromDetails(resetProfile.fromDetails);
      setAccentColor(resetProfile.accentColor);
      setStylePreset(resetProfile.stylePreset);
      setLogoUrl(resetProfile.logoUrl);
      setStatus("Defaults reset.");
      setError("");
    };

    const handleLogoChange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const result = await readLogoFileForStorage(file);
        setLogoUrl(result.dataUrl);
        setStatus(result.convertedFromSvg ? "SVG logo converted to PNG for PDF compatibility." : "");
        setError("");
      } catch (_error) {
        setError("Couldn't read that image.");
      }
      event.target.value = "";
    };

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-4xl py-8 md:py-10">
          <button
            type="button"
            className="nb-btn-ghost"
            onClick={() => navigate("/")}
          >
            Back to launcher
          </button>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Business identity</p>
            <h1 className="nb-section-title text-2xl md:text-3xl">
              Set your default invoice branding
            </h1>
            <p className="text-sm text-slate-600">
              This auto-fills new drafts in AI intake and manual mode.
            </p>
            <p className="text-xs text-slate-500">
              Account: {authSession?.email ? authSession.email : "local mode"}
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="nb-surface nb-surface--elevated space-y-4 rounded-[28px] p-4 md:p-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900" htmlFor="business-from-details">
                  From details
                </label>
                <p className="text-xs text-slate-500">
                  Company name, address, phone, email. One line per detail.
                </p>
                <textarea
                  id="business-from-details"
                  rows={5}
                  className="nb-textarea w-full resize-y rounded-xl px-3 py-2"
                  placeholder={"Acme Plumbing\n123 Main St\n(555) 555-1234\nbilling@acme.com"}
                  value={fromDetails}
                  onChange={(event) => setFromDetails(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Template style</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {STYLE_OPTIONS.map((option) => {
                    const selected = option.id === stylePreset;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          selected
                            ? "border-blue-300 bg-blue-100 text-blue-900"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() => setStylePreset(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Accent color</label>
                <div className="flex flex-wrap items-center gap-2">
                  {["#093064", "#6993D2", "#ACCCF0", "#1d4ed8", "#be123c", "#111827"].map(
                    (swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        className={`h-8 w-8 rounded-full border ${
                          accentColor === swatch ? "border-slate-900" : "border-slate-200"
                        }`}
                        style={{ backgroundColor: swatch }}
                        onClick={() => setAccentColor(swatch)}
                        aria-label={`Choose ${swatch}`}
                      />
                    )
                  )}
                  <input
                    type="color"
                    className="h-8 w-10 rounded border border-slate-200 bg-white p-1"
                    value={accentColor}
                    onChange={(event) => setAccentColor(normalizeAccentColor(event.target.value))}
                    aria-label="Choose custom accent color"
                  />
                  <span className="font-mono text-xs text-slate-500">{accentColor}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Logo</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="block w-full text-sm text-slate-600"
                  onChange={handleLogoChange}
                />
                {logoUrl ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500"
                    onClick={() => setLogoUrl(null)}
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: accent.primary }}
                  onClick={handleSave}
                >
                  Save defaults
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
              {status ? <p className="text-xs text-blue-800">{status}</p> : null}
              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            </section>

            <section className={`rounded-2xl border p-4 ${activePreset.shellClass}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Preview</p>
              <div className="mt-3 space-y-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo preview" className="h-10 w-auto max-w-[160px] object-contain" />
                ) : null}
                <div>
                  <p className={activePreset.titleClass}>INVOICE</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: accent.text }}>
                    NoteBill
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <p className={`text-xs uppercase tracking-[0.2em] ${activePreset.labelClass}`}>From</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                    {fromDetails.trim() || "Your business details will appear here."}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <p className="text-xs text-slate-500">Accent sample</p>
                  <div
                    className="mt-2 h-3 rounded-full"
                    style={{ backgroundColor: accent.primary }}
                  />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  function ClientMemorySettings() {
    const navigate = useNavigate();
    const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
    const [clientMemory, setClientMemory] = useState(() => getClientMemory());
    const [status, setStatus] = useState("");
    const [clearArmed, setClearArmed] = useState(false);

    useEffect(() => {
      let active = true;
      requestIdentity
        .refreshSession()
        .then((session) => {
          if (active) {
            setAuthSession(session);
          }
        })
        .catch(() => {
          if (active) {
            setAuthSession(null);
          }
        });
      return () => {
        active = false;
      };
    }, []);

    const stats = useMemo(() => buildMemoryStats(clientMemory), [clientMemory]);

    const handleDeleteClient = (entry) => {
      setClientMemory(deleteClientMemoryEntry(entry.name));
      setStatus(`${entry.name} removed from memory.`);
      setClearArmed(false);
    };

    const handleClearAll = () => {
      if (!clearArmed) {
        setClearArmed(true);
        setStatus("Tap confirm to clear all remembered clients on this device.");
        return;
      }
      setClientMemory(clearClientMemory());
      setStatus("Client memory cleared.");
      setClearArmed(false);
    };

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-5xl py-6 md:py-10">
          <button
            type="button"
            className="nb-btn-ghost"
            onClick={() => navigate("/")}
          >
            Back to launcher
          </button>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
            <section className="nb-surface nb-surface--elevated rounded-[26px] p-4 md:rounded-[30px] md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Memory controls</p>
              <h1 className="nb-section-title mt-2 text-2xl md:text-3xl">
                Review and clear repeat-client memory
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                NoteBill can remember repeat-client details to save typing. You can review or clear that memory
                anytime. It never silently changes invoice totals or auto-applies hidden changes.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Account: {authSession?.email ? authSession.email : "local mode"}
              </p>
            </section>

            <aside className="nb-surface nb-surface--muted rounded-[26px] p-4 md:rounded-[30px] md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Trust note</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Memory stays visible and removable. Billie can suggest repeat details, but money changes still
                require explicit user action.
              </p>
            </aside>
          </div>

          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Clients", stats.total],
              ["Send emails", stats.withEmail],
              ["Prior notes", stats.withNotes],
              ["Cadences", stats.withCadence]
            ].map(([label, value]) => (
              <div key={label} className="nb-subcard bg-white/85 p-3 text-center md:p-4">
                <p className="text-xl font-semibold text-[#093064] md:text-2xl">{value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {label}
                </p>
              </div>
            ))}
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-4 md:rounded-[30px] md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Remembered client data</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Clear anything that feels stale, private, or no longer useful.
                </p>
              </div>
              {clientMemory.length > 0 ? (
                <button
                  type="button"
                  className={`min-h-11 w-full rounded-full px-4 py-2 text-sm font-semibold sm:w-auto ${
                    clearArmed
                      ? "bg-rose-600 text-white"
                      : "border border-rose-200 bg-white text-rose-700"
                  }`}
                  onClick={handleClearAll}
                >
                  {clearArmed ? "Confirm clear all" : "Clear all remembered clients"}
                </button>
              ) : null}
            </div>

            {status ? <p className="mt-3 text-sm font-semibold text-[#093064]">{status}</p> : null}

            {clientMemory.length === 0 ? (
                <div className="nb-subcard mt-5 bg-slate-50/90 p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">No remembered clients yet.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  NoteBill will start building memory as you save invoices, reuse client details, or send to a
                  client email. It only remembers what you already chose to reuse.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                {clientMemory.map((entry) => {
                  const cadenceLabel = formatRecurringCadence(entry.recurringIntervalDays);
                  const tags = [
                    entry.recipientEmail ? "Saved email" : "",
                    entry.defaultNotes ? "Saved note" : "",
                    cadenceLabel ? cadenceLabel : ""
                  ].filter(Boolean);
                  return (
                    <article key={entry.lookupKey} className="nb-subcard bg-white/90 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-slate-900">{entry.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatMemoryDate(entry.updatedAt)}</p>
                          {tags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-[#edf5ff] px-2.5 py-1 text-xs font-semibold text-[#093064]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="min-h-10 w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 sm:w-auto"
                          onClick={() => handleDeleteClient(entry)}
                          aria-label={`Delete remembered client ${entry.name}`}
                        >
                          Delete
                        </button>
                      </div>

                      <details className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-[#093064]">
                          Show saved details
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Client details
                            </p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                              {entry.details || entry.name}
                            </p>
                          </div>
                          <div className="space-y-3">
                            {entry.recipientEmail ? (
                              <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Saved email
                                </p>
                                <p className="mt-2 break-all text-sm font-semibold text-slate-700">
                                  {entry.recipientEmail}
                                </p>
                              </div>
                            ) : null}
                            {entry.defaultNotes ? (
                              <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Saved note
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-700">{entry.defaultNotes}</p>
                              </div>
                            ) : null}
                            {cadenceLabel ? (
                              <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Recurring cadence
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-700">{cadenceLabel}</p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  function ServiceCatalogSettings() {
    const navigate = useNavigate();
    const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
    const [serviceCatalog, setServiceCatalog] = useState(() => getLineItemLibrary());
    const [status, setStatus] = useState("");
    const [clearArmed, setClearArmed] = useState(false);

    useEffect(() => {
      let active = true;
      requestIdentity
        .refreshSession()
        .then((session) => {
          if (active) {
            setAuthSession(session);
          }
        })
        .catch(() => {
          if (active) {
            setAuthSession(null);
          }
        });
      return () => {
        active = false;
      };
    }, []);

    const stats = useMemo(() => buildServiceStats(serviceCatalog), [serviceCatalog]);

    const handleDeleteService = (entry) => {
      setServiceCatalog((current) => {
        const next = current.filter((candidate) => candidate.lookupKey !== entry.lookupKey);
        saveLineItemLibrary(next);
        return next;
      });
      setStatus(`Removed ${entry.description} from service catalog.`);
      setClearArmed(false);
    };

    const handleClearAll = () => {
      if (!clearArmed) {
        setClearArmed(true);
        setStatus("Tap confirm to clear all saved services on this device.");
        return;
      }
      setServiceCatalog(saveLineItemLibrary([]));
      setStatus("Service catalog cleared.");
      setClearArmed(false);
    };

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-5xl py-6 md:py-10">
          <button
            type="button"
            className="nb-btn-ghost"
            onClick={() => navigate("/manual")}
          >
            Back to invoice editor
          </button>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
            <section className="nb-surface nb-surface--elevated rounded-[26px] p-4 md:rounded-[30px] md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Saved services</p>
              <h1 className="nb-section-title mt-2 text-2xl md:text-3xl">
                Review and reuse your service catalog
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                NoteBill saves line-item descriptions, quantities, rates, and client context you already chose to
                reuse. You can review or clear those saved services anytime.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Account: {authSession?.email ? authSession.email : "local mode"}
              </p>
            </section>

            <aside className="nb-surface nb-surface--muted rounded-[26px] p-4 md:rounded-[30px] md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Trust note</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Saved services are visible and removable. They can speed up repeat work, but they never change
                totals automatically.
              </p>
            </aside>
          </div>

          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Services", stats.total],
              ["With rates", stats.withRate],
              ["With qty", stats.withQty],
              ["With client", stats.withClient]
            ].map(([label, value]) => (
              <div key={label} className="nb-subcard bg-white/85 p-3 text-center md:p-4">
                <p className="text-xl font-semibold text-[#093064] md:text-2xl">{value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {label}
                </p>
              </div>
            ))}
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-4 md:rounded-[30px] md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Saved service items</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Clear anything stale, private, or no longer useful.
                </p>
              </div>
              {serviceCatalog.length > 0 ? (
                <button
                  type="button"
                  className={`min-h-11 w-full rounded-full px-4 py-2 text-sm font-semibold sm:w-auto ${
                    clearArmed
                      ? "bg-rose-600 text-white"
                      : "border border-rose-200 bg-white text-rose-700"
                  }`}
                  onClick={handleClearAll}
                >
                  {clearArmed ? "Confirm clear all" : "Clear all saved services"}
                </button>
              ) : null}
            </div>

            {status ? <p className="mt-3 text-sm font-semibold text-[#093064]">{status}</p> : null}

            {serviceCatalog.length === 0 ? (
              <div className="nb-subcard mt-5 bg-slate-50/90 p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">No saved services yet.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  NoteBill will start building a service catalog as you save line items from invoices.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                {serviceCatalog.map((entry) => {
                  const tags = [
                    entry.clientName ? entry.clientName : "",
                    entry.qty ? `Qty ${entry.qty}` : "",
                    entry.rate ? `Rate ${formatServiceMoney(entry.rate)}` : ""
                  ].filter(Boolean);
                  return (
                    <article key={entry.lookupKey} className="nb-subcard bg-white/90 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-slate-900">{entry.description}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.updatedAt ? `Saved ${formatMemoryDate(entry.updatedAt)}` : "Saved recently"}
                          </p>
                          {tags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-[#edf5ff] px-2.5 py-1 text-xs font-semibold text-[#093064]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="min-h-10 w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 sm:w-auto"
                          onClick={() => handleDeleteService(entry)}
                          aria-label={`Delete saved service ${entry.description}`}
                        >
                          Delete
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Usage
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {Number(entry.usageCount) > 1 ? `${entry.usageCount} uses` : "1 use"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Quantity
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {entry.qty || "Not set"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Rate
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {entry.rate ? formatServiceMoney(entry.rate) : "Not set"}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  window.InvoiceBusinessIdentityFeature = { BusinessIdentitySettings, ClientMemorySettings, ServiceCatalogSettings };
})();
