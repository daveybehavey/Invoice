import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const billingActionsSource = await fs.readFile(
  path.resolve(process.cwd(), "public/utils/billingActions.js"),
  "utf8"
);

type BillingActionsHarness = {
  hasStripeCheckout(plan: unknown): boolean;
  hasGooglePlayLifetimePurchase(plan: unknown): boolean;
  hasGooglePlayRestore(plan: unknown): boolean;
  getGooglePlaySubscriptionPlans(plan: unknown): Array<{
    basePlanId: string;
    label: string;
    offerId?: string;
    isDefault?: boolean;
  }>;
  restoreGooglePlayPurchases(plan: unknown, options?: unknown): Promise<{
    restoredCount: number;
    message: string;
  }>;
  startUpgradeCheckout(plan: unknown, options?: unknown): Promise<unknown>;
};

function loadBillingActions({
  androidNative = true,
  playBillingPlugin,
  apiFetch,
  locationAssign
}: {
  androidNative?: boolean;
  playBillingPlugin?: Record<string, unknown>;
  apiFetch?: (input: string, init?: RequestInit) => Promise<Response>;
  locationAssign?: (url: string) => void;
} = {}): BillingActionsHarness {
  const windowObject = {
    InvoiceRequestIdentity: {
      apiFetch:
        apiFetch ??
        (async (input) =>
          new Response(
            JSON.stringify(
              input === "/api/account/plan"
                ? { plan: "pro" }
                : { ok: true, result: { productId: "notebill_premium", subscriptionState: "SUBSCRIPTION_STATE_ACTIVE" } }
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          ))
    },
    Capacitor: androidNative
      ? {
          getPlatform: () => "android",
          isNativePlatform: () => true,
          Plugins: playBillingPlugin ? { PlayBilling: playBillingPlugin } : {}
        }
      : undefined,
    location: {
      origin: "https://app.notebill.app",
      pathname: "/",
      search: "",
      hash: "",
      assign:
        locationAssign ??
        function assign() {
          throw new Error("location.assign should not be called in this test.");
        }
    },
    history: {
      replaceState() {}
    }
  };
  const context = {
    window: windowObject,
    navigator: {
      userAgent: androidNative ? "Android" : "Desktop"
    },
    URL,
    URLSearchParams,
    Response
  };
  vm.createContext(context);
  vm.runInContext(billingActionsSource, context);
  return (windowObject as typeof windowObject & { InvoiceBillingActions: BillingActionsHarness })
    .InvoiceBillingActions;
}

test("Android billing helper hides Google Play checkout until backend verification is configured", () => {
  const billingActions = loadBillingActions();
  const plan = {
    billing: {
      provider: "stripe",
      checkoutAvailable: true,
      googlePlay: {
        available: false,
        verificationAvailable: false,
        packageName: "",
        subscriptionProductId: "notebill_premium",
        lifetimeProductId: "notebill_premium_lifetime"
      }
    }
  };

  assert.equal(billingActions.hasStripeCheckout(plan), false);
  assert.equal(billingActions.hasGooglePlayLifetimePurchase(plan), false);
  assert.equal(billingActions.hasGooglePlayRestore(plan), false);
});

test("Android billing helper enables Google Play checkout when verification is configured", () => {
  const billingActions = loadBillingActions();
  const plan = {
    billing: {
      provider: "stripe",
      checkoutAvailable: true,
      googlePlay: {
        available: true,
        verificationAvailable: true,
        packageName: "app.notebill.app",
        subscriptionProductId: "notebill_premium",
        lifetimeProductId: "notebill_premium_lifetime"
      }
    }
  };

  assert.equal(billingActions.hasStripeCheckout(plan), true);
  assert.equal(billingActions.hasGooglePlayLifetimePurchase(plan), true);
  assert.equal(billingActions.hasGooglePlayRestore(plan), true);
});

test("Android billing helper exposes multiple configured Google Play subscription plans", () => {
  const billingActions = loadBillingActions();
  const plan = {
    billing: {
      googlePlay: {
        subscriptionPlans: [
          { basePlanId: "premium-weekly", label: "Weekly", isDefault: false },
          { basePlanId: "premium-monthly", label: "Monthly", isDefault: true, offerId: "free-week-trial" },
          { basePlanId: "premium-yearly", label: "Yearly", isDefault: false }
        ]
      }
    }
  };

  assert.deepEqual(billingActions.getGooglePlaySubscriptionPlans(plan).map((item) => item.basePlanId), [
    "premium-weekly",
    "premium-monthly",
    "premium-yearly"
  ]);
  assert.equal(billingActions.getGooglePlaySubscriptionPlans(plan)[1]?.offerId, "free-week-trial");
});

test("Android billing helper restores subscription and lifetime purchases through backend verification", async () => {
  const requests: Array<{ input: string; body: unknown }> = [];
  const billingActions = loadBillingActions({
    playBillingPlugin: {
      restorePurchases: async () => ({
        packageName: "app.notebill.app",
        purchases: [
          {
            purchaseToken: "sub-token",
            productId: "notebill_premium",
            productType: "subscription",
            packageName: "app.notebill.app"
          },
          {
            purchaseToken: "life-token",
            productId: "notebill_premium_lifetime",
            productType: "one_time",
            packageName: "app.notebill.app"
          }
        ]
      })
    },
    apiFetch: async (input, init) => {
      requests.push({
        input,
        body: JSON.parse(String(init?.body ?? "{}"))
      });
      return new Response(
        JSON.stringify(
          input === "/api/account/plan"
            ? { plan: "pro" }
            : { ok: true, result: { productId: "notebill_premium", subscriptionState: "SUBSCRIPTION_STATE_ACTIVE" } }
        ),
        {
        status: 200,
        headers: { "Content-Type": "application/json" }
        }
      );
    }
  });
  const plan = {
    billing: {
      googlePlay: {
        available: true,
        verificationAvailable: true,
        packageName: "app.notebill.app",
        subscriptionProductId: "notebill_premium",
        subscriptionBasePlanId: "premium-monthly",
        lifetimeProductId: "notebill_premium_lifetime"
      }
    }
  };

  const result = await billingActions.restoreGooglePlayPurchases(plan);
  const verificationRequests = requests.filter((request) => request.input.includes("/api/billing/google-play"));

  assert.equal(result.restoredCount, 2);
  assert.equal(verificationRequests.some((request) => request.input === "/api/billing/google-play/verify"), true);
  assert.equal(verificationRequests.some((request) => request.input === "/api/billing/google-play/lifetime/verify"), true);
  assert.deepEqual(
    verificationRequests.map((request) => (request.body as { purchaseToken?: string }).purchaseToken),
    ["sub-token", "life-token"]
  );
});

test("Android billing helper reports when restore finds no active purchases", async () => {
  const billingActions = loadBillingActions({
    playBillingPlugin: {
      restorePurchases: async () => ({
        purchases: []
      })
    }
  });
  const plan = {
    billing: {
      googlePlay: {
        available: true,
        verificationAvailable: true,
        packageName: "app.notebill.app",
        subscriptionProductId: "notebill_premium"
      }
    }
  };

  const result = await billingActions.restoreGooglePlayPurchases(plan);

  assert.equal(result.restoredCount, 0);
  assert.match(result.message, /No active Google Play purchases/i);
});

test("Android billing helper resolves request identity lazily after script boot order", async () => {
  const requests: Array<string> = [];
  let requestIdentity:
    | {
        apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
        getAuthSession?: () => { userId: string } | null;
        getInvoiceOwnerId?: () => string;
      }
    | undefined;
  const windowObject = {
    get InvoiceRequestIdentity() {
      return requestIdentity;
    },
    set InvoiceRequestIdentity(value) {
      requestIdentity = value;
    },
    InvoiceRevenueAnalytics: undefined,
    InvoicePublicConfig: {},
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    Capacitor: {
      getPlatform: () => "android",
      isNativePlatform: () => true,
      Plugins: {
        PlayBilling: {
          restorePurchases: async () => ({
            packageName: "app.notebill.app",
            purchases: [
              {
                purchaseToken: "life-token",
                productId: "notebill_premium_lifetime",
                productType: "one_time",
                packageName: "app.notebill.app"
              }
            ]
          })
        }
      }
    },
    location: {
      origin: "capacitor://localhost",
      pathname: "/",
      search: "",
      hash: "",
      assign() {
        throw new Error("location.assign should not be called in this test.");
      }
    },
    history: {
      replaceState() {}
    },
    fetch: async () =>
      new Response("<!doctype html><html><body>wrong origin</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      })
  };
  const context = {
    window: windowObject,
    navigator: {
      userAgent: "Android"
    },
    URL,
    URLSearchParams,
    Response
  };
  vm.createContext(context);
  vm.runInContext(billingActionsSource, context);
  windowObject.InvoiceRequestIdentity = {
    apiFetch: async (input) => {
      requests.push(input);
      return new Response(
        JSON.stringify(
          input === "/api/account/plan"
            ? { plan: "pro" }
            : { ok: true, result: { productId: "notebill_premium_lifetime", subscriptionState: "PURCHASED" } }
        ),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    },
    getAuthSession: () => ({ userId: "owner-123" }),
    getInvoiceOwnerId: () => "owner-123"
  };

  const billingActions = (windowObject as typeof windowObject & { InvoiceBillingActions: BillingActionsHarness })
    .InvoiceBillingActions;
  const plan = {
    billing: {
      googlePlay: {
        available: true,
        verificationAvailable: true,
        packageName: "app.notebill.app",
        subscriptionProductId: "notebill_premium",
        lifetimeProductId: "notebill_premium_lifetime"
      }
    }
  };

  const result = await billingActions.restoreGooglePlayPurchases(plan);

  assert.equal(result.restoredCount, 1);
  assert.equal(requests.includes("/api/billing/google-play/lifetime/verify"), true);
  assert.equal(requests.includes("/api/account/plan"), true);
});

test("Android billing helper recovers ITEM_ALREADY_OWNED purchases by restoring and unlocking", async () => {
  const requests: Array<{ input: string; body: unknown }> = [];
  let redirectUrl = "";
  const billingActions = loadBillingActions({
    playBillingPlugin: {
      purchaseSubscription: async () => {
        throw new Error("Google Play billing failed (code ITEM_ALREADY_OWNED): You already own this item.");
      },
      restorePurchases: async () => ({
        packageName: "app.notebill.app",
        purchases: [
          {
            purchaseToken: "restored-token",
            productId: "notebill_premium",
            productType: "subscription",
            packageName: "app.notebill.app"
          }
        ]
      })
    },
    apiFetch: async (input, init) => {
      requests.push({
        input,
        body: JSON.parse(String(init?.body ?? "{}"))
      });
      return new Response(
        JSON.stringify(
          input === "/api/account/plan"
            ? { plan: "pro" }
            : { ok: true, result: { productId: "notebill_premium", subscriptionState: "SUBSCRIPTION_STATE_ACTIVE" } }
        ),
        {
        status: 200,
        headers: { "Content-Type": "application/json" }
        }
      );
    },
    locationAssign: (url) => {
      redirectUrl = url;
    }
  });
  const plan = {
    billing: {
      googlePlay: {
        available: true,
        verificationAvailable: true,
        packageName: "app.notebill.app",
        subscriptionProductId: "notebill_premium",
        subscriptionBasePlanId: "premium-monthly"
      }
    }
  };

  const result = (await billingActions.startUpgradeCheckout(plan, { successPath: "/manual" })) as {
    restoredCount?: number;
  };

  assert.equal(result?.restoredCount, 1);
  assert.equal(
    requests.some((request) => request.input === "/api/billing/google-play/verify"),
    true
  );
  assert.match(redirectUrl, /\?billing=success/);
});
