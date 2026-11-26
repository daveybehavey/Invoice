import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  fetchAccountPlanIfSignedIn,
  fetchAuthPolicy,
  signOutAccount,
  verifyCurrentSession
} from "../lib/api";
import {
  getActiveDraft,
  getBusinessProfile,
  getStoredAuthSession,
  saveActiveDraft,
  saveBusinessProfile
} from "../lib/localStore";
import type {
  AccountPlanSummary,
  ActiveDraft,
  AuthPolicy,
  AuthSession,
  BusinessProfile
} from "../lib/types";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "success" | "info" | "warning" | "error";
}

interface AppContextValue {
  session: AuthSession | null;
  authPolicy: AuthPolicy | null;
  plan: AccountPlanSummary | null;
  profile: BusinessProfile;
  updateProfile: (next: BusinessProfile) => void;
  draft: ActiveDraft;
  updateDraft: (updater: ActiveDraft | ((prev: ActiveDraft) => ActiveDraft)) => void;
  authModal: { open: boolean; reason?: string; returnPath?: string };
  openAuthModal: (reason?: string, returnPath?: string) => void;
  closeAuthModal: () => void;
  refreshAuth: () => Promise<void>;
  handleSignOut: () => Promise<void>;
  toast: ToastMessage | null;
  showToast: (text: string, tone?: ToastMessage["tone"]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [authPolicy, setAuthPolicy] = useState<AuthPolicy | null>(null);
  const [plan, setPlan] = useState<AccountPlanSummary | null>(null);
  const [profile, setProfile] = useState<BusinessProfile>(() => getBusinessProfile());
  const [draft, setDraft] = useState<ActiveDraft>(() => getActiveDraft());
  const [authModal, setAuthModal] = useState<{ open: boolean; reason?: string; returnPath?: string }>({
    open: false
  });
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastMessage["tone"] = "info") => {
    const id = Date.now();
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4200);
  }, []);

  const refreshAuth = useCallback(async () => {
    const [policyResult, sessionResult] = await Promise.all([
      fetchAuthPolicy().catch(() => null),
      verifyCurrentSession()
    ]);
    if (policyResult) setAuthPolicy(policyResult);
    setSession(sessionResult);
    const planResult = await fetchAccountPlanIfSignedIn(sessionResult, policyResult);
    setPlan(planResult);
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const updateProfile = useCallback((next: BusinessProfile) => {
    setProfile(next);
    saveBusinessProfile(next);
  }, []);

  const updateDraft = useCallback(
    (updater: ActiveDraft | ((prev: ActiveDraft) => ActiveDraft)) => {
      setDraft((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveActiveDraft(next);
        return next;
      });
    },
    []
  );

  const openAuthModal = useCallback((reason?: string, returnPath?: string) => {
    setAuthModal({ open: true, reason, returnPath });
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal({ open: false });
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOutAccount();
    setSession(null);
    setPlan(null);
    showToast("Signed out. Your local draft and scratchpad stay on this device.", "info");
  }, [showToast]);

  return (
    <AppContext.Provider
      value={{
        session,
        authPolicy,
        plan,
        profile,
        updateProfile,
        draft,
        updateDraft,
        authModal,
        openAuthModal,
        closeAuthModal,
        refreshAuth,
        handleSignOut,
        toast,
        showToast
      }}
    >
      {children}
      {toast && (
        <div
          role="status"
          className={`no-print pointer-events-none fixed top-20 right-4 left-4 md:left-auto md:max-w-md z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.tone === "success"
              ? "bg-[#0F5132] text-white border-[#0F5132]"
              : toast.tone === "warning"
                ? "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]"
                : toast.tone === "error"
                  ? "bg-[#FFF1F2] text-[#9F1239] border-[#FDA4AF]"
                  : "bg-[#101915] text-white border-[#101915]"
          }`}
        >
          {toast.text}
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used inside AppProvider");
  }
  return ctx;
}
