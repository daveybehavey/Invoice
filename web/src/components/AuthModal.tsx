import React, { useState } from "react";
import { CheckCircle2, Lock, Mail, X } from "lucide-react";
import { getGoogleAuthUrl, requestEmailSignInLink } from "../lib/api";
import { saveAuthReturnHandoff } from "../lib/localStore";
import { useApp } from "./AppContext";

export function AuthModal() {
  const { authModal, closeAuthModal, authPolicy, draft } = useApp();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!authModal.open) {
    return null;
  }

  const returnPath = authModal.returnPath || "/create";
  const providers = authPolicy?.authProviders ?? [
    { id: "google" as const, label: "Continue with Google", available: true },
    { id: "email_link" as const, label: "Email sign-in link", available: true }
  ];
  const googleProvider = providers.find((p) => p.id === "google");
  const emailProvider = providers.find((p) => p.id === "email_link");

  const handleGoogleSignIn = () => {
    saveAuthReturnHandoff(draft, returnPath);
    window.location.href = getGoogleAuthUrl(returnPath);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      saveAuthReturnHandoff(draft, returnPath);
      await requestEmailSignInLink(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sign-in link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#101915]/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={closeAuthModal}
          aria-label="Close sign in dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#F5F6F2] hover:text-[#101915]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-semibold text-[#0F5132]">
          <Lock className="h-3.5 w-3.5" />
          Your draft is saved on this device
        </div>

        <h2 id="auth-modal-title" className="font-serif text-2xl font-bold text-[#101915]">
          Sign in to NoteBill
        </h2>
        <p className="mt-1.5 text-sm text-[#47554E]">
          {authModal.reason ||
            "Sync your invoices across devices, run Billie AI cleanup, email clients, and create Stripe payment links. Your current notes and draft come right back with you."}
        </p>

        {sentTo ? (
          <div className="mt-5 rounded-xl border border-[#198754]/30 bg-[#E8F5EE] p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0F5132]" />
              <div>
                <p className="text-sm font-semibold text-[#101915]">Check your inbox</p>
                <p className="mt-1 text-xs text-[#47554E]">
                  We sent a one-tap sign-in link to <span className="font-semibold">{sentTo}</span>. Open it to return right back to your draft.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="mt-3 text-xs font-semibold text-[#0F5132] hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {googleProvider?.available && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#D9E0DC] bg-white px-4 py-3 text-sm font-semibold text-[#101915] shadow-sm transition hover:border-[#0F5132]/40 hover:bg-[#F5F6F2]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Continue with Google
              </button>
            )}

            {googleProvider?.available && emailProvider?.available && (
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-[#E2E7E3]" />
                <span className="mx-3 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">or</span>
                <div className="flex-grow border-t border-[#E2E7E3]" />
              </div>
            )}

            {emailProvider?.available ? (
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div>
                  <label htmlFor="auth-email-input" className="block text-xs font-semibold text-[#47554E]">
                    Work or personal email
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]" />
                    <input
                      id="auth-email-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourtrade.com"
                      className="w-full rounded-xl border border-[#D9E0DC] bg-white py-2.5 pl-9 pr-3 text-sm text-[#101915] outline-none transition focus:border-[#0F5132] focus:ring-2 focus:ring-[#0F5132]/15"
                    />
                  </div>
                </div>
                {error && <p className="text-xs font-medium text-[#9F1239]">{error}</p>}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full rounded-xl bg-[#0F5132] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#146C43] disabled:opacity-60"
                >
                  {sending ? "Sending sign-in link..." : "Send one-tap sign-in link"}
                </button>
              </form>
            ) : (
              <p className="rounded-xl bg-[#F5F6F2] p-3 text-xs text-[#47554E]">
                {emailProvider?.warning || "Email sign-in is not configured on this server."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
