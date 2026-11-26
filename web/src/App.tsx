import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./components/AppContext";
import { EmailVerifyPage, GoogleAuthCallbackPage } from "./pages/AuthCallbackPages";
import { BrandPage } from "./pages/BrandPage";
import { CreatePage } from "./pages/CreatePage";
import { JobsPage } from "./pages/JobsPage";
import { LandingPage } from "./pages/LandingPage";
import { LegalPage } from "./pages/LegalPage";
import { PortalPage } from "./pages/PortalPage";
import { PricingPage } from "./pages/PricingPage";
import {
  ContractorEstimateTemplatePage,
  FreeInvoiceGeneratorPage,
  MaterialsMarkupCalculatorPage
} from "./pages/ToolPages";
import { RouteSeoSync } from "./lib/seo";

export function App() {
  return (
    <BrowserRouter>
      <RouteSeoSync />
      <AppProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/free-invoice-generator" element={<FreeInvoiceGeneratorPage />} />
          <Route path="/contractor-estimate-template" element={<ContractorEstimateTemplatePage />} />
          <Route path="/materials-markup-calculator" element={<MaterialsMarkupCalculatorPage />} />

          {/* Unified V3 Create + Legacy Intake/Manual/Import Aliases */}
          <Route path="/create" element={<CreatePage />} />
          <Route path="/ai-intake" element={<CreatePage />} />
          <Route path="/manual" element={<CreatePage />} />
          <Route path="/import" element={<CreatePage />} />

          {/* Unified V3 Jobs + Legacy Library/Scratchpad/Dashboard/Clients Aliases */}
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/invoices" element={<JobsPage />} />
          <Route path="/scratchpad" element={<JobsPage />} />
          <Route path="/dashboard" element={<JobsPage />} />
          <Route path="/clients" element={<JobsPage />} />

          {/* Unified V3 Brand & Settings */}
          <Route path="/brand" element={<BrandPage />} />
          <Route path="/settings" element={<BrandPage />} />
          <Route path="/settings/business" element={<BrandPage />} />
          <Route path="/settings/memory" element={<BrandPage />} />
          <Route path="/settings/services" element={<BrandPage />} />

          {/* Client Portal & Auth Callbacks */}
          <Route path="/portal/:invoiceId/:token" element={<PortalPage />} />
          <Route path="/auth/verify" element={<EmailVerifyPage />} />
          <Route path="/auth/google" element={<GoogleAuthCallbackPage />} />

          {/* Legal & Support */}
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/support" element={<LegalPage kind="support" />} />
          <Route path="/help" element={<LegalPage kind="support" />} />
          <Route path="/feedback" element={<LegalPage kind="support" />} />
          <Route path="/data-deletion" element={<LegalPage kind="data_deletion" />} />
          <Route path="/delete-account" element={<LegalPage kind="data_deletion" />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
