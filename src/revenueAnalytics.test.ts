import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const revenueAnalyticsSource = await fs.readFile(
  path.resolve(process.cwd(), "public/utils/revenueAnalytics.js"),
  "utf8"
);

type StorageSeed = Record<string, string>;

type StorageHarness = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  dump(): Record<string, string>;
};

function createStorage(seed: StorageSeed = {}): StorageHarness {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
    dump() {
      return Object.fromEntries(data.entries());
    }
  };
}

function loadRevenueAnalytics({
  storageSeed = {},
  scopedKeyPrefix = "scope",
  fetchImpl
}: {
  storageSeed?: StorageSeed;
  scopedKeyPrefix?: string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} = {}) {
  const localStorage = createStorage(storageSeed);
  const capturedEvents: Array<{ event: string; source?: string }> = [];
  const fetchCalls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  const windowObject = {
    localStorage,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init });
      if (fetchImpl) {
        return fetchImpl(input, init);
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    },
    InvoiceRequestIdentity: {
      getScopedStorageKey(key: string) {
        return `${scopedKeyPrefix}:${key}`;
      }
    },
    InvoiceAnalytics: {
      trackRevenueSignal(event: string, input?: { source?: string }) {
        capturedEvents.push({
          event,
          source: input?.source
        });
      }
    }
  };

  const context = vm.createContext({
    window: windowObject,
    Response,
    Headers,
    Request,
    URLSearchParams,
    console,
    Date,
    JSON
  });
  vm.runInContext(revenueAnalyticsSource, context);

  const runtimeWindow = windowObject as typeof windowObject & {
    InvoiceRevenueAnalytics?: {
      trackRevenueSignal(event: string, source?: string): void;
      trackRevenueSignalOnce(event: string, source?: string): boolean;
      trackRevenueSignalWithCooldown(event: string, source?: string, cooldownMs?: number): boolean;
    };
  };

  return {
    analytics: runtimeWindow.InvoiceRevenueAnalytics as {
      trackRevenueSignal(event: string, source?: string): void;
      trackRevenueSignalOnce(event: string, source?: string): boolean;
      trackRevenueSignalWithCooldown(event: string, source?: string, cooldownMs?: number): boolean;
    },
    localStorage,
    capturedEvents,
    fetchCalls
  };
}

test("revenue analytics records app open events with cooldown and first-open dedupe", () => {
  const { analytics, capturedEvents, localStorage } = loadRevenueAnalytics();
  const cooldownKey = "scope:revenueMilestone:cooldown:app_opened";
  const firstOpenKey = "scope:revenueMilestone:first_app_opened";

  assert.equal(analytics.trackRevenueSignalWithCooldown("app_opened", "app_lifecycle:launch", 30_000), true);
  assert.equal(analytics.trackRevenueSignalWithCooldown("app_opened", "app_lifecycle:resume", 30_000), false);
  localStorage.setItem(cooldownKey, String(Date.now() - 31_000));
  assert.equal(analytics.trackRevenueSignalWithCooldown("app_opened", "app_lifecycle:resume", 30_000), true);

  assert.equal(analytics.trackRevenueSignalOnce("first_app_opened", "app_lifecycle:launch"), true);
  assert.equal(analytics.trackRevenueSignalOnce("first_app_opened", "app_lifecycle:resume"), false);

  assert.deepEqual(
    capturedEvents.map((entry) => entry.event),
    ["app_opened", "app_opened", "first_app_opened"]
  );
  assert.equal(localStorage.getItem(cooldownKey) !== null, true);
  assert.equal(localStorage.getItem(firstOpenKey) !== null, true);
});
