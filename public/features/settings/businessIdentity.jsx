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

  const {
    TAX_REGION_PRESETS,
    getBusinessProfile,
    saveBusinessProfile,
    clearBusinessProfile,
    normalizeBusinessProfile,
    resolveTaxRegionPresets
  } = businessProfileUtils;
  const { DEFAULT_ACCENT_COLOR, normalizeAccentColor, buildAccentPalette } = brandThemeUtils;
  const {
    STYLE_OPTIONS,
    STYLE_PRESETS,
    HEADER_LAYOUT_OPTIONS,
    SPACING_DENSITY_OPTIONS
  } = styleCatalogUtils;
  const { readLogoFileForStorage } = logoImageUtils;

  function BusinessIdentitySettings() {
    const navigate = useNavigate();
    const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
    const [fromDetails, setFromDetails] = useState("");
    const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
    const [stylePreset, setStylePreset] = useState("default");
    const [headerLayout, setHeaderLayout] = useState("split");
    const [spacingDensity, setSpacingDensity] = useState("balanced");
    const [logoUrl, setLogoUrl] = useState(null);
    const [logoVisible, setLogoVisible] = useState(true);
    const [notesVisible, setNotesVisible] = useState(true);
    const [defaultTaxRate, setDefaultTaxRate] = useState("0");
    const [taxRegionRates, setTaxRegionRates] = useState({});
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
      setHeaderLayout(profile.headerLayout ?? "split");
      setSpacingDensity(profile.spacingDensity ?? "balanced");
      setLogoUrl(profile.logoUrl ?? null);
      setLogoVisible(profile.logoVisible !== false);
      setNotesVisible(profile.notesVisible !== false);
      setDefaultTaxRate(profile.defaultTaxRate ?? "0");
      setTaxRegionRates(profile.taxRegionRates ?? {});
    }, []);

    const activePreset = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.default;
    const accent = useMemo(() => buildAccentPalette(accentColor), [accentColor]);
    const regionPresetPreview = useMemo(
      () => resolveTaxRegionPresets({ taxRegionRates }),
      [resolveTaxRegionPresets, taxRegionRates]
    );

    const handleSave = () => {
      try {
        const profile = saveBusinessProfile({
          fromDetails,
          accentColor,
          stylePreset,
          headerLayout,
          spacingDensity,
          logoUrl,
          logoVisible,
          notesVisible,
          defaultTaxRate,
          taxRegionRates
        });
        setFromDetails(profile.fromDetails);
        setAccentColor(profile.accentColor);
        setStylePreset(profile.stylePreset);
        setHeaderLayout(profile.headerLayout);
        setSpacingDensity(profile.spacingDensity);
        setLogoUrl(profile.logoUrl);
        setLogoVisible(profile.logoVisible !== false);
        setNotesVisible(profile.notesVisible !== false);
        setDefaultTaxRate(profile.defaultTaxRate);
        setTaxRegionRates(profile.taxRegionRates ?? {});
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
      setHeaderLayout(resetProfile.headerLayout ?? "split");
      setSpacingDensity(resetProfile.spacingDensity ?? "balanced");
      setLogoUrl(resetProfile.logoUrl);
      setLogoVisible(resetProfile.logoVisible !== false);
      setNotesVisible(resetProfile.notesVisible !== false);
      setDefaultTaxRate(resetProfile.defaultTaxRate);
      setTaxRegionRates(resetProfile.taxRegionRates ?? {});
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
                <label className="text-sm font-semibold text-slate-900">Header layout</label>
                <div className="flex flex-wrap gap-2">
                  {HEADER_LAYOUT_OPTIONS.map((option) => {
                    const selected = option.id === headerLayout;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-label={`Header layout ${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          selected
                            ? "border-blue-300 bg-blue-100 text-blue-900"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() => setHeaderLayout(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Spacing density</label>
                <div className="flex flex-wrap gap-2">
                  {SPACING_DENSITY_OPTIONS.map((option) => {
                    const selected = option.id === spacingDensity;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-label={`Spacing density ${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          selected
                            ? "border-blue-300 bg-blue-100 text-blue-900"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() => setSpacingDensity(option.id)}
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
                <label className="text-sm font-semibold text-slate-900" htmlFor="business-default-tax-rate">
                  Default tax rate (%)
                </label>
                <p className="text-xs text-slate-500">
                  Applied to new drafts only. You can still change tax per invoice anytime.
                </p>
                <input
                  id="business-default-tax-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="nb-input w-32 rounded-xl px-3 py-2"
                  value={defaultTaxRate}
                  onChange={(event) => setDefaultTaxRate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Regional tax presets</label>
                <p className="text-xs text-slate-500">
                  Auto-applies when bill-to details include a matching province.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TAX_REGION_PRESETS.map((preset) => (
                    <label
                      key={preset.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      htmlFor={`business-tax-region-${preset.key}`}
                    >
                      <span className="font-semibold text-slate-700">{preset.label}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <input
                          id={`business-tax-region-${preset.key}`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="nb-input w-20 rounded-lg px-2 py-1 text-right"
                          value={taxRegionRates?.[preset.key] ?? preset.defaultRate}
                          onChange={(event) =>
                            setTaxRegionRates((current) => ({
                              ...(current && typeof current === "object" ? current : {}),
                              [preset.key]: event.target.value
                            }))
                          }
                          aria-label={`${preset.label} tax preset (%)`}
                        />
                        <span>%</span>
                      </span>
                    </label>
                  ))}
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
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={logoVisible}
                    onChange={(event) => setLogoVisible(event.target.checked)}
                  />
                  Show logo on invoices by default
                </label>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={notesVisible}
                    onChange={(event) => setNotesVisible(event.target.checked)}
                  />
                  Show notes on invoices by default
                </label>
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
                  <p className="mt-2 text-xs text-slate-500">
                    Default tax: <span className="font-semibold text-slate-700">{defaultTaxRate || "0"}%</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Layout:{" "}
                    <span className="font-semibold text-slate-700">
                      {HEADER_LAYOUT_OPTIONS.find((option) => option.id === headerLayout)?.label ?? "Split"} /{" "}
                      {SPACING_DENSITY_OPTIONS.find((option) => option.id === spacingDensity)?.label ?? "Standard"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Visibility:{" "}
                    <span className="font-semibold text-slate-700">
                      Logo {logoVisible ? "shown" : "hidden"}, notes {notesVisible ? "shown" : "hidden"}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {regionPresetPreview.map((preset) => (
                      <span
                        key={preset.key}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                      >
                        {preset.label} {preset.rate}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  window.InvoiceBusinessIdentityFeature = { BusinessIdentitySettings };
})();
