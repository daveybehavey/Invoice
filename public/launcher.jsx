const { BrowserRouter, Routes, Route, useNavigate } = ReactRouterDOM;
const { useEffect, useState } = React;

const uiPrimitives = window.InvoiceUIPrimitives;
if (!uiPrimitives) {
  throw new Error("Missing /ui/primitives.jsx load. Ensure it is loaded before /launcher.jsx.");
}

const { SparklesIcon, PencilIcon, UploadIcon, ArchiveIcon, SwatchIcon, LauncherCard } = uiPrimitives;

const intakeFeatureUtils = window.InvoiceIntakeFeature;
if (!intakeFeatureUtils) {
  throw new Error(
    "Missing /features/intake/aiIntake.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { AIIntake } = intakeFeatureUtils;

const importFeatureUtils = window.InvoiceImportFeature;
if (!importFeatureUtils) {
  throw new Error(
    "Missing /features/import/importInvoice.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { ImportInvoice } = importFeatureUtils;

const libraryFeatureUtils = window.InvoiceLibraryFeature;
if (!libraryFeatureUtils) {
  throw new Error(
    "Missing /features/library/invoiceLibrary.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { InvoiceLibrary } = libraryFeatureUtils;

const diagnosticsFeatureUtils = window.InvoiceDiagnosticsFeature;
if (!diagnosticsFeatureUtils) {
  throw new Error(
    "Missing /features/diagnostics/intakeDiagnostics.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { IntakeDiagnostics } = diagnosticsFeatureUtils;

const businessIdentityFeatureUtils = window.InvoiceBusinessIdentityFeature;
if (!businessIdentityFeatureUtils) {
  throw new Error(
    "Missing /features/settings/businessIdentity.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { BusinessIdentitySettings } = businessIdentityFeatureUtils;

const manualCanvasUtils = window.InvoiceManualCanvas;
if (!manualCanvasUtils) {
  throw new Error(
    "Missing /features/manual/manualInvoiceCanvas.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { ManualInvoiceCanvas } = manualCanvasUtils;

const requestIdentity = window.InvoiceRequestIdentity;
if (!requestIdentity) {
  throw new Error("Missing /utils/requestIdentity.js load. Ensure it is loaded before /launcher.jsx.");
}

const { getAuthSession, refreshSession, signInWithEmail, signOut } = requestIdentity;

function Launcher() {
  const navigate = useNavigate();
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authEmailError, setAuthEmailError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const showDiagnosticsLink =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  useEffect(() => {
    let active = true;
    refreshSession()
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
    if (!authModalOpen) {
      return undefined;
    }
    const handleKeydown = (event) => {
      if (event.key === "Escape" && !authBusy) {
        setAuthModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [authModalOpen, authBusy]);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSignIn = async () => {
    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthEmailError("Enter your email.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setAuthEmailError("Enter a valid email address.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthEmailError("");
    try {
      const session = await signInWithEmail(normalizedEmail);
      setAuthSession(session);
      setAuthModalOpen(false);
      setAuthEmail("");
    } catch (error) {
      const message = error?.message || "Sign in failed.";
      setAuthError(message);
      setAuthEmailError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const openSignInModal = () => {
    setAuthError("");
    setAuthEmailError("");
    setAuthEmail(authSession?.email ?? "");
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signOut();
      setAuthSession(null);
    } catch (error) {
      setAuthError(error?.message || "Sign out failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const options = [
    {
      key: "ai",
      title: "Let Billie Build",
      description: "Paste notes or describe the job for Billie.",
      icon: <SparklesIcon />,
      onClick: () => navigate("/ai-intake"),
      disabled: false
    },
    {
      key: "import",
      title: "Import Existing Invoice",
      description: "Upload a PDF or text invoice to edit.",
      icon: <UploadIcon />,
      onClick: () => navigate("/import"),
      disabled: false
    },
    {
      key: "manual",
      title: "Build It Yourself",
      description: "Start with a clean, editable invoice.",
      icon: <PencilIcon />,
      onClick: () => navigate("/manual"),
      disabled: false
    },
    {
      key: "library",
      title: "Invoice Library",
      description: "Reopen saved invoices and drafts.",
      icon: <ArchiveIcon />,
      onClick: () => navigate("/invoices"),
      disabled: false
    },
    {
      key: "identity",
      title: "Business Identity",
      description: "Set your logo, style, and default From details.",
      icon: <SwatchIcon />,
      onClick: () => navigate("/settings/business"),
      disabled: false
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-10 md:max-w-5xl md:py-16">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">NoteBill</p>
          <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Create a New Invoice</h1>
          <p className="text-sm text-slate-600 md:text-base">
            Choose how you want to start. Billie can turn messy notes into a clean draft in seconds.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">
            {authSession?.email ? `Signed in as ${authSession.email}` : "Not signed in (local mode)"}
          </p>
          {authSession?.email ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
              onClick={handleSignOut}
              disabled={authBusy}
            >
              {authBusy ? "Signing out..." : "Sign out"}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 disabled:opacity-60"
              onClick={openSignInModal}
              disabled={authBusy}
            >
              Sign in
            </button>
          )}
        </div>
        {authError ? <p className="mt-2 text-sm text-rose-600">{authError}</p> : null}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {options.map((option) => (
            <LauncherCard
              key={option.key}
              title={option.title}
              description={option.description}
              icon={option.icon}
              onClick={option.onClick}
              disabled={option.disabled}
              badge={option.badge}
            />
          ))}
        </div>
        {showDiagnosticsLink ? (
          <button
            type="button"
            className="mt-6 text-sm font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            onClick={() => navigate("/diagnostics")}
          >
            Internal diagnostics
          </button>
        ) : null}
      </main>
      {authModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-600">
              Enter your email to keep invoices scoped to your account.
            </p>
            <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="launcher-auth-email">
              Email
            </label>
            <input
              id="launcher-auth-email"
              type="email"
              autoFocus
              value={authEmail}
              onChange={(event) => {
                setAuthEmail(event.target.value);
                setAuthEmailError("");
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-200 focus:border-emerald-500 focus:ring-2"
              placeholder="you@example.com"
              disabled={authBusy}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !authBusy) {
                  event.preventDefault();
                  handleSignIn();
                }
              }}
            />
            {authEmailError ? <p className="mt-2 text-sm text-rose-600">{authEmailError}</p> : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                onClick={() => setAuthModalOpen(false)}
                disabled={authBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 disabled:opacity-60"
                onClick={handleSignIn}
                disabled={authBusy}
              >
                {authBusy ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Placeholder({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-10">
        <button
          type="button"
          className="text-sm font-semibold text-emerald-700"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/ai-intake" element={<AIIntake />} />
        <Route path="/invoices" element={<InvoiceLibrary />} />
        <Route path="/manual" element={<ManualInvoiceCanvas />} />
        <Route path="/import" element={<ImportInvoice />} />
        <Route path="/diagnostics" element={<IntakeDiagnostics />} />
        <Route path="/settings/business" element={<BusinessIdentitySettings />} />
        <Route
          path="*"
          element={<Placeholder title="Page not found" description="Return to the launcher to continue." />}
        />
      </Routes>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
