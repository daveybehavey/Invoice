(() => {
  const { useState } = React;

  const billingActions = window.InvoiceBillingActions;
  if (!billingActions?.requestContractCopy) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /ui/contractCopyControls.jsx."
    );
  }
  const { requestContractCopy } = billingActions;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity?.getAuthSession) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /ui/contractCopyControls.jsx."
    );
  }
  const { getAuthSession } = requestIdentity;

  function ContractCopyControls({ termsVersion, termsHref, downloadHref, compact = false }) {
    const legal = window.InvoiceLegalFoundation;
    const resolvedVersion = typeof termsVersion === "string" ? termsVersion.trim() : "";
    if (!resolvedVersion) {
      return null;
    }
    const resolvedTermsHref =
      (typeof termsHref === "string" && termsHref.trim()) ||
      (typeof legal?.buildVersionedTermsPath === "function"
        ? legal.buildVersionedTermsPath(resolvedVersion)
        : `/terms?version=${encodeURIComponent(resolvedVersion)}`);
    const resolvedDownloadHref =
      (typeof downloadHref === "string" && downloadHref.trim()) ||
      (typeof legal?.buildTermsDownloadPath === "function"
        ? legal.buildTermsDownloadPath(resolvedVersion)
        : `/api/legal/documents/terms?version=${encodeURIComponent(resolvedVersion)}&format=txt`);
    const [status, setStatus] = useState({ tone: "", message: "" });
    const [busy, setBusy] = useState(false);
    const authSession = typeof getAuthSession === "function" ? getAuthSession() : null;
    const signedIn = Boolean(authSession?.userId && authSession?.email);

    const handleEmailCopy = async () => {
      setBusy(true);
      setStatus({ tone: "", message: "" });
      try {
        if (!signedIn) {
          setStatus({
            tone: "amber",
            message: "Sign in to email a contract copy to your account address."
          });
          return;
        }
        const result = await requestContractCopy({ termsVersion: resolvedVersion });
        if (result?.delivered && result?.channel === "email") {
          setStatus({
            tone: "green",
            message: result.coalesced
              ? "Email already requested recently — reusing that delivery without sending another copy."
              : "Contract copy emailed to your signed-in address."
          });
          return;
        }
        setStatus({
          tone: "amber",
          message:
            "Email delivery is unavailable right now. Use Download/print for a retainable copy, then retry email later."
        });
      } catch (error) {
        setStatus({
          tone: "rose",
          message: error?.message || "Unable to email a contract copy. You can still download/print."
        });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div
        className={compact ? "mt-3 space-y-2" : "mt-4 space-y-3"}
        data-testid="contract-copy-controls"
      >
        <div className="flex flex-wrap gap-2">
          <a
            href={resolvedTermsHref}
            className="nb-btn-ghost inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold"
          >
            Open versioned Terms
          </a>
          <a
            href={resolvedDownloadHref}
            className="nb-btn-ghost inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold"
            data-testid="contract-copy-download"
          >
            Download/print Terms
          </a>
          <button
            type="button"
            className="nb-btn-secondary inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold"
            onClick={() => void handleEmailCopy()}
            disabled={busy}
            data-testid="contract-copy-email"
          >
            {busy ? "Requesting…" : "Email me a copy"}
          </button>
        </div>
        <p className="text-xs leading-5 text-slate-600">
          Download/print always works. Email goes only to your signed-in account address when transactional email is
          configured.
        </p>
        {status.message ? (
          <p
            className={`text-sm ${
              status.tone === "green"
                ? "text-emerald-800"
                : status.tone === "rose"
                  ? "text-rose-700"
                  : "text-amber-800"
            }`}
            role="status"
            data-testid="contract-copy-status"
          >
            {status.message}
            {status.tone === "rose" || status.tone === "amber" ? (
              <>
                {" "}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-4"
                  onClick={() => void handleEmailCopy()}
                  disabled={busy}
                >
                  Retry email
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }

  function BillingNoticeActions({ notice, compact = false }) {
    if (!notice) {
      return null;
    }
    const acceptedVersion =
      typeof notice.termsVersion === "string" ? notice.termsVersion.trim() : "";
    if (notice.contractCopyAvailable && acceptedVersion) {
      return (
        <ContractCopyControls
          termsVersion={acceptedVersion}
          termsHref={notice.termsHref}
          downloadHref={notice.downloadHref}
          compact={compact}
        />
      );
    }
    if (notice.termsHref) {
      return (
        <p className="mt-2 text-sm">
          <a
            href={notice.termsHref}
            className="font-semibold underline underline-offset-4"
          >
            {notice.termsLabel || "Open Terms"}
          </a>
        </p>
      );
    }
    return null;
  }

  window.InvoiceContractCopyControls = {
    ContractCopyControls,
    BillingNoticeActions
  };
})();
