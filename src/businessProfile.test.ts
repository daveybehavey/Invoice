import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync("public/utils/businessProfile.js", "utf8");
function harness(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  let failWrites = false;
  const window: any = {
    InvoiceRequestIdentity: { getScopedStorageKey: () => "scoped-profile" },
    InvoiceBrandTheme: { DEFAULT_ACCENT_COLOR: "#123456", normalizeAccentColor: (value: string) => value },
    InvoiceManualStyleCatalog: { STYLE_PRESETS: { default: {} } },
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("Storage unavailable");
        data.set(key, value);
      }
    }
  };
  vm.runInNewContext(source, { window });
  return { api: window.InvoiceBusinessProfile, data, fail: () => { failWrites = true; } };
}

test("failed identity save throws and retains previous identity and logo", () => {
  const h = harness();
  h.api.saveBusinessProfile({ fromDetails: "Previous", logoUrl: "data:image/png;base64,previous" });
  const before = h.data.get("scoped-profile");
  h.fail();
  assert.throws(() => h.api.saveBusinessProfile({ fromDetails: "New", logoUrl: "data:image/png;base64,new" }), /Storage unavailable/);
  assert.equal(h.data.get("scoped-profile"), before);
  assert.equal(h.api.getBusinessProfile().fromDetails, "Previous");
});

test("successful identity save normalizes, merges and persists the full logo", () => {
  const h = harness();
  h.api.saveBusinessProfile({ accentColor: "#abcdef", logoUrl: "data:image/png;base64,complete" });
  const saved = h.api.saveBusinessProfile({ fromDetails: "  Company  " });
  assert.equal(saved.fromDetails, "Company");
  assert.equal(saved.accentColor, "#abcdef");
  assert.equal(saved.logoUrl, "data:image/png;base64,complete");
  assert.equal(h.api.getBusinessProfile().fromDetails, "Company");
});

test("legacy reads remain usable when migration cannot write, but explicit save fails", () => {
  const h = harness({ invoiceBusinessProfile: JSON.stringify({ fromDetails: "Legacy" }) });
  h.fail();
  assert.equal(h.api.getBusinessProfile().fromDetails, "Legacy");
  assert.throws(() => h.api.saveBusinessProfile({ fromDetails: "New" }), /Storage unavailable/);
  assert.equal(h.api.getBusinessProfile().fromDetails, "Legacy");
});

test("settings save reports failure without success or setup completion, then allows retry", () => {
  const settings = readFileSync("public/features/settings/businessIdentity.jsx", "utf8");
  const handler = settings.slice(settings.indexOf("    const handleSave = () => {"), settings.indexOf("    const handleReset = () => {"));
  const h = harness();
  let blocked = true;
  let status = "Business identity saved.";
  let error = "";
  let completed = 0;
  const context = vm.createContext({
    fromDetails: "Company", accentColor: "#abcdef", stylePreset: "default",
    logoUrl: "data:image/png;base64,complete", businessRegistrations: [], registrationBlockVisible: true,
    saveBusinessProfile: (profile: unknown) => {
      if (blocked) throw new Error("Quota exceeded");
      return h.api.saveBusinessProfile(profile);
    },
    markSetupStep: () => { completed++; },
    setStatus: (value: string) => { status = value; },
    setError: (value: string) => { error = value; },
    setFromDetails() {}, setAccentColor() {}, setStylePreset() {}, setLogoUrl() {},
    setBusinessRegistrations() {}, setRegistrationBlockVisible() {}
  });
  vm.runInContext(`${handler}\nhandleSave();`, context);
  assert.equal(status, "");
  assert.equal(error, "Couldn't save identity. Try again.");
  assert.equal(completed, 0);
  blocked = false;
  vm.runInContext("handleSave();", context);
  assert.equal(status, "Business identity saved.");
  assert.equal(error, "");
  assert.equal(completed, 1);
  assert.equal(h.api.getBusinessProfile().logoUrl, "data:image/png;base64,complete");
});
