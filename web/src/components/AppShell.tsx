import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Briefcase, FilePlus2, Palette, Plus, Sparkles, UserCheck } from "lucide-react";
import { useApp } from "./AppContext";
import { AuthModal } from "./AuthModal";

export function NoteBillMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F5132] text-white shadow-sm">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="font-serif text-xl font-bold tracking-tight text-[#101915]">NoteBill</span>
    </span>
  );
}

export function AppShell({
  mode = "workspace",
  children
}: {
  mode?: "marketing" | "workspace" | "portal";
  children: React.ReactNode;
}) {
  const { session, plan, openAuthModal } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  if (mode === "portal") {
    return (
      <div className="min-h-screen bg-[#F5F6F2] text-[#101915]">
        <header className="no-print border-b border-[#E2E7E3] bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link to="/" className="hover:opacity-90">
              <NoteBillMark />
            </Link>
            <span className="rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-semibold text-[#0F5132]">
              Secure Client Invoice
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">{children}</main>
        <AuthModal />
      </div>
    );
  }

  if (mode === "marketing") {
    return (
      <div className="min-h-screen bg-[#F5F6F2] text-[#101915]">
        <header className="no-print sticky top-0 z-40 border-b border-[#E2E7E3]/90 bg-[#F5F6F2]/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link to="/" className="shrink-0">
              <NoteBillMark />
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <a
                href="/#sandbox"
                className="text-sm font-semibold text-[#47554E] transition hover:text-[#101915]"
              >
                Live Demo
              </a>
              <Link
                to="/free-invoice-generator"
                className="text-sm font-semibold text-[#47554E] transition hover:text-[#101915]"
              >
                Free Tools
              </Link>
              <Link
                to="/pricing"
                className="text-sm font-semibold text-[#47554E] transition hover:text-[#101915]"
              >
                Pricing
              </Link>
              <Link
                to="/jobs"
                className="text-sm font-semibold text-[#47554E] transition hover:text-[#101915]"
              >
                Scratchpad & Jobs
              </Link>
            </nav>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                to="/pricing"
                className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-[#47554E] hover:bg-white md:hidden"
              >
                Pricing
              </Link>
              {session ? (
                <Link
                  to="/create"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-[#146C43]"
                >
                  Open Workbench
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openAuthModal("Sign in to sync your invoices and Pro tools.", "/create")}
                    className="whitespace-nowrap rounded-xl px-2.5 py-2 text-xs sm:text-sm font-semibold text-[#47554E] transition hover:bg-white hover:text-[#101915]"
                  >
                    Sign In
                  </button>
                  <Link
                    to="/create"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-[#146C43]"
                  >
                    Start Free
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
        <FooterBar />
        <AuthModal />
      </div>
    );
  }

  const navItems = [
    { to: "/create", label: "Create", icon: FilePlus2 },
    { to: "/jobs", label: "Jobs", icon: Briefcase },
    { to: "/brand", label: "Brand", icon: Palette }
  ];

  const isActiveTab = (to: string) => {
    const p = location.pathname;
    if (to === "/create") return p === "/create" || p === "/ai-intake" || p === "/manual" || p === "/import";
    if (to === "/jobs") return p === "/jobs" || p === "/invoices" || p === "/scratchpad" || p === "/dashboard" || p === "/clients";
    if (to === "/brand") return p === "/brand" || p.startsWith("/settings");
    return p === to;
  };

  return (
    <div className="min-h-screen bg-[#F5F6F2] text-[#101915] pb-20 md:pb-8">
      <header className="no-print sticky top-0 z-40 h-16 border-b border-[#E2E7E3] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="shrink-0">
              <NoteBillMark />
            </Link>

            <nav className="hidden items-center gap-1 rounded-xl bg-[#F5F6F2] p-1 md:flex" aria-label="Workspace navigation">
              {navItems.map(({ to, label, icon: Icon }) => {
                const active = isActiveTab(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                      active
                        ? "bg-white text-[#101915] shadow-sm"
                        : "text-[#47554E] hover:text-[#101915]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-[#0F5132]" : "text-[#6B7A72]"}`} />
                    {label}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/pricing"
              className="hidden text-xs font-semibold text-[#47554E] hover:text-[#0F5132] sm:inline-block"
            >
              {plan?.plan === "pro" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F5EE] px-2.5 py-1 text-[#0F5132]">
                  Pro Active
                </span>
              ) : (
                "Pricing"
              )}
            </Link>

            <button
              type="button"
              onClick={() => navigate("/create?new=1")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F5132] px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-[#146C43]"
            >
              <Plus className="h-4 w-4" />
              <span>New</span>
            </button>

            {session ? (
              <Link
                to="/brand"
                title={session.email}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E7E3] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                <UserCheck className="h-3.5 w-3.5 text-[#0F5132]" />
                <span className="hidden max-w-[140px] truncate sm:inline">{session.email}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal(undefined, location.pathname)}
                className="rounded-xl border border-[#D9E0DC] bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#101915] transition hover:border-[#0F5132]/40 hover:bg-[#F5F6F2]"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Mobile navigation"
        className="no-print fixed bottom-0 left-0 right-0 z-40 grid grid-cols-3 border-t border-[#E2E7E3] bg-white/95 backdrop-blur-md md:hidden"
      >
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = isActiveTab(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                active ? "text-[#0F5132]" : "text-[#6B7A72]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <AuthModal />
    </div>
  );
}

function FooterBar() {
  return (
    <footer className="no-print border-t border-[#E2E7E3] bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-8 text-xs text-[#6B7A72] sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <span className="font-serif text-sm font-bold text-[#101915]">NoteBill</span>
          <span>·</span>
          <span>Built for solo trades & small service pros</span>
        </div>
        <div className="flex flex-wrap items-center gap-5 font-medium">
          <Link to="/free-invoice-generator" className="hover:text-[#101915]">
            Free Invoice Generator
          </Link>
          <Link to="/contractor-estimate-template" className="hover:text-[#101915]">
            Estimate Template
          </Link>
          <Link to="/materials-markup-calculator" className="hover:text-[#101915]">
            Markup Calculator
          </Link>
          <Link to="/pricing" className="hover:text-[#101915]">
            Pricing
          </Link>
          <Link to="/terms" className="hover:text-[#101915]">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-[#101915]">
            Privacy
          </Link>
          <Link to="/support" className="hover:text-[#101915]">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
