import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Mail, Printer, ShieldAlert } from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { AuthRequiredError, fetchLegalDocument, requestContractCopy } from "../lib/api";

export function LegalPage({
  kind
}: {
  kind: "terms" | "privacy" | "support" | "data_deletion";
}) {
  const { session, openAuthModal } = useApp();
  const [searchParams] = useSearchParams();
  const requestedVersion = searchParams.get("version")?.trim() || undefined;

  const [doc, setDoc] = useState<{
    version: string;
    effectiveDate: string;
    isCurrent: boolean;
    sections: Array<{ title: string; paragraphs: string[]; items?: string[] }>;
    downloadPath?: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    setDoc(null);
    setLoadError(null);
    setCopyStatus(null);
    if (kind === "terms" || kind === "privacy") {
      fetchLegalDocument(kind, requestedVersion)
        .then((res) => setDoc(res))
        .catch((err) => {
          setDoc(null);
          setLoadError(err instanceof Error ? err.message : "Could not load legal document.");
        });
    }
  }, [kind, requestedVersion]);

  const handleEmailContractCopy = async () => {
    if (!doc?.version) return;
    if (!session) {
      openAuthModal("Sign in to email a copy of the Terms to your account address.", `/terms?version=${encodeURIComponent(doc.version)}`);
      return;
    }
    setCopyBusy(true);
    setCopyStatus(null);
    try {
      const result = await requestContractCopy(doc.version);
      if (result.delivered) {
        setCopyStatus({
          tone: "success",
          text: result.coalesced
            ? "Contract copy was already sent recently to your account email."
            : "Contract copy emailed to your signed-in account address."
        });
      } else {
        setCopyStatus({
          tone: "info",
          text: "Email delivery is unavailable right now. Use Download Terms (.txt) or Print above to keep a copy."
        });
      }
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal(err.message, `/terms?version=${encodeURIComponent(doc.version)}`);
      } else {
        setCopyStatus({
          tone: "error",
          text: err instanceof Error ? err.message : "Could not email a contract copy."
        });
      }
    } finally {
      setCopyBusy(false);
    }
  };

  return (
    <AppShell mode="marketing">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-card sm:p-8">
          {kind === "support" ? (
            <>
              <h1 className="font-serif text-3xl font-bold text-[#101915]">NoteBill Support</h1>
              <p className="mt-3 text-sm text-[#47554E]">
                Need help with an invoice, billing, or your account? Reach us directly at{" "}
                <a href="mailto:support@notebill.app" className="font-semibold text-[#0F5132] underline">
                  support@notebill.app
                </a>
                .
              </p>
            </>
          ) : kind === "data_deletion" ? (
            <>
              <h1 className="font-serif text-3xl font-bold text-[#101915]">Account & Data Deletion</h1>
              <p className="mt-3 text-sm leading-relaxed text-[#47554E]">
                To request deletion of your NoteBill cloud account and saved invoices, email{" "}
                <a href="mailto:support@notebill.app" className="font-semibold text-[#0F5132] underline">
                  support@notebill.app
                </a>{" "}
                from the email address associated with your account. Local device drafts and client memory can also be
                cleared immediately from the Brand & Settings tab.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-serif text-3xl font-bold text-[#101915]">
                {kind === "terms" ? "Terms of Service" : "Privacy Policy"}
              </h1>
              {loadError ? (
                <div className="mt-6 rounded-xl border border-[#FDA4AF] bg-[#FFF1F2] p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#9F1239]">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Version not found</span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#47554E]">{loadError}</p>
                  <Link
                    to={kind === "terms" ? "/terms" : "/privacy"}
                    className="mt-3 inline-block rounded-lg bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#146C43]"
                  >
                    View current {kind === "terms" ? "Terms of Service" : "Privacy Policy"}
                  </Link>
                </div>
              ) : doc ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-mono text-[#6B7A72]">
                      Version {doc.version} · Effective {doc.effectiveDate}
                    </p>
                    {doc.isCurrent === false && (
                      <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                        Archived version — preserved for contract records
                      </span>
                    )}
                  </div>

                  {kind === "terms" && (
                    <div className="no-print mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/70 p-3">
                      <a
                        href={doc.downloadPath || `/api/legal/documents/terms?version=${encodeURIComponent(doc.version)}&format=txt`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D9E0DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#E8F5EE]"
                      >
                        <Download className="h-3.5 w-3.5 text-[#0F5132]" />
                        <span>Download Terms (.txt)</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D9E0DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#E8F5EE]"
                      >
                        <Printer className="h-3.5 w-3.5 text-[#0F5132]" />
                        <span>Print</span>
                      </button>
                      <button
                        type="button"
                        disabled={copyBusy}
                        onClick={() => void handleEmailContractCopy()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5132] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#146C43] disabled:opacity-60"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>{copyBusy ? "Sending..." : "Email me a copy"}</span>
                      </button>
                      {copyStatus && (
                        <p
                          role="status"
                          className={`mt-1 w-full text-xs font-medium ${
                            copyStatus.tone === "success"
                              ? "text-[#0F5132]"
                              : copyStatus.tone === "error"
                                ? "text-[#9F1239]"
                                : "text-[#92400E]"
                          }`}
                        >
                          {copyStatus.text}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-6 space-y-6">
                    {doc.sections.map((sec) => (
                      <section key={sec.title}>
                        <h2 className="text-base font-bold text-[#101915]">{sec.title}</h2>
                        {sec.paragraphs.map((p, idx) => (
                          <p key={idx} className="mt-2 text-sm leading-relaxed text-[#47554E]">
                            {p}
                          </p>
                        ))}
                        {sec.items && sec.items.length > 0 && (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#47554E]">
                            {sec.items.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-[#47554E]">Loading document...</p>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
