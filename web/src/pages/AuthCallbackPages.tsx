import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { verifyEmailSignInToken } from "../lib/api";
import {
  consumeAuthReturnDraft,
  consumeAuthReturnPath,
  setStoredAuthSession
} from "../lib/localStore";

export function EmailVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshAuth, updateDraft } = useApp();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Verifying your sign-in link...");

  useEffect(() => {
    let active = true;
    const token = searchParams.get("token")?.trim();
    if (!token) {
      setStatus("error");
      setMessage("This sign-in link is missing a token.");
      return;
    }

    verifyEmailSignInToken(token)
      .then(async () => {
        if (!active) return;
        const restored = consumeAuthReturnDraft();
        if (restored) {
          updateDraft(restored);
        }
        await refreshAuth();
        setStatus("success");
        setMessage("Signed in! Returning to your workspace...");
        const nextPath = consumeAuthReturnPath();
        window.setTimeout(() => {
          if (active) navigate(nextPath, { replace: true });
        }, 650);
      })
      .catch((err) => {
        if (!active) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "This sign-in link is invalid or expired.");
      });

    return () => {
      active = false;
    };
  }, [searchParams, navigate, refreshAuth, updateDraft]);

  return (
    <AppShell mode="portal">
      <div className="mx-auto max-w-md rounded-2xl border border-[#E2E7E3] bg-white p-8 text-center shadow-card">
        {status === "verifying" && <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0F5132]" />}
        {status === "success" && <CheckCircle2 className="mx-auto h-8 w-8 text-[#0F5132]" />}
        {status === "error" && <XCircle className="mx-auto h-8 w-8 text-[#9F1239]" />}
        <h1 className="mt-4 font-serif text-2xl font-bold text-[#101915]">
          {status === "verifying" ? "Signing you in" : status === "success" ? "You're in" : "Sign-in failed"}
        </h1>
        <p className="mt-2 text-sm text-[#47554E]">{message}</p>
        {status === "error" && (
          <Link
            to="/create"
            className="mt-5 inline-block rounded-xl bg-[#0F5132] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to Workbench
          </Link>
        )}
      </div>
    </AppShell>
  );
}

export function GoogleAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshAuth, updateDraft } = useApp();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Completing Google Sign-In...");

  useEffect(() => {
    let active = true;
    const errorMsg = searchParams.get("error")?.trim();
    if (errorMsg) {
      setStatus("error");
      setMessage(errorMsg);
      return;
    }

    const hashStr = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hashStr);
    const token = hashParams.get("token")?.trim();
    const userId = hashParams.get("userId")?.trim();
    const email = hashParams.get("email")?.trim();
    const expiresAt = hashParams.get("expiresAt")?.trim() || "";
    const nextFromHash = hashParams.get("next")?.trim();

    if (!token || !userId || !email) {
      setStatus("error");
      setMessage("Google Sign-In did not return a complete session.");
      return;
    }

    setStoredAuthSession(token, { userId, email, expiresAt });
    const restored = consumeAuthReturnDraft();
    if (restored) {
      updateDraft(restored);
    }
    window.history.replaceState({}, document.title, "/auth/google");

    void refreshAuth().then(() => {
      if (!active) return;
      setStatus("success");
      setMessage("Signed in with Google! Taking you back...");
      const nextPath =
        nextFromHash && nextFromHash.startsWith("/") ? nextFromHash : consumeAuthReturnPath();
      window.setTimeout(() => {
        if (active) navigate(nextPath, { replace: true });
      }, 500);
    });

    return () => {
      active = false;
    };
  }, [searchParams, navigate, refreshAuth, updateDraft]);

  return (
    <AppShell mode="portal">
      <div className="mx-auto max-w-md rounded-2xl border border-[#E2E7E3] bg-white p-8 text-center shadow-card">
        {status === "verifying" && <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0F5132]" />}
        {status === "success" && <CheckCircle2 className="mx-auto h-8 w-8 text-[#0F5132]" />}
        {status === "error" && <XCircle className="mx-auto h-8 w-8 text-[#9F1239]" />}
        <h1 className="mt-4 font-serif text-2xl font-bold text-[#101915]">
          {status === "verifying" ? "Google Sign-In" : status === "success" ? "Signed In" : "Google Sign-In Failed"}
        </h1>
        <p className="mt-2 text-sm text-[#47554E]">{message}</p>
        {status === "error" && (
          <Link
            to="/create"
            className="mt-5 inline-block rounded-xl bg-[#0F5132] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to Workbench
          </Link>
        )}
      </div>
    </AppShell>
  );
}
