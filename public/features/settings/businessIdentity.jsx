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

  const { getBusinessProfile, saveBusinessProfile, clearBusinessProfile, normalizeBusinessProfile } =
    businessProfileUtils;
  const { DEFAULT_ACCENT_COLOR, normalizeAccentColor, buildAccentPalette } = brandThemeUtils;
  const { STYLE_OPTIONS, STYLE_PRESETS } = styleCatalogUtils;
  const { readLogoFileForStorage } = logoImageUtils;

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
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-4xl px-4 py-8 md:py-10">
          <button
            type="button"
            className="text-sm font-semibold text-blue-800"
            onClick={() => navigate("/")}
          >
            Back to launcher
          </button>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Business identity</p>
            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
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
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
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
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 focus:border-blue-700 focus:ring-2"
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

  window.InvoiceBusinessIdentityFeature = { BusinessIdentitySettings };
})();
