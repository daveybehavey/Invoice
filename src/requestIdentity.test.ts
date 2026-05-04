import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const requestIdentitySource = await fs.readFile(
  path.resolve(process.cwd(), "public/utils/requestIdentity.js"),
  "utf8"
);

type StorageSeed = Record<string, string>;

type StorageHarness = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  dump(): Record<string, string>;
};

type FetchCall = {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
};

type RequestIdentityHarness = {
  getAuthSession(): { userId: string; email: string; expiresAt: string } | null;
  getSessionToken(): string | null;
  resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL;
  apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getGoogleAuthStartUrl(returnTo?: string): RequestInfo | URL;
  loadAuthProviders(): Promise<Array<{ id: string; available: boolean }>>;
  requestSignInLink(email: string, provider?: string): Promise<unknown>;
  completeRedirectSignIn(
    token: string,
    session: { userId: string; email: string; expiresAt: string }
  ): { userId: string; email: string; expiresAt: string };
};

type WindowHarness = {
  localStorage: StorageHarness;
  crypto: { randomUUID(): string };
  location: { origin: string };
  Capacitor?: { isNativePlatform?: () => boolean };
  WEBVIEW_SERVER_URL?: string;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  InvoiceRequestIdentity?: RequestIdentityHarness;
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

function loadRequestIdentity({
  storageSeed = {},
  fetchImpl,
  windowOverrides = {}
}: {
  storageSeed?: StorageSeed;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  windowOverrides?: Partial<WindowHarness>;
} = {}): {
  requestIdentity: RequestIdentityHarness;
  localStorage: StorageHarness;
  fetchCalls: FetchCall[];
} {
  const localStorage = createStorage(storageSeed);
  const fetchCalls: FetchCall[] = [];
  const windowObject: WindowHarness = {
    localStorage,
    crypto: { randomUUID: () => "generated-owner-id" },
    location: { origin: "https://example.com" },
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
    ...windowOverrides
  };

  const context = {
    window: windowObject,
    Headers,
    Request,
    Response,
    URLSearchParams,
    console
  };
  vm.createContext(context);
  vm.runInContext(requestIdentitySource, context);
  return {
    requestIdentity: windowObject.InvoiceRequestIdentity as RequestIdentityHarness,
    localStorage,
    fetchCalls
  };
}

test("request identity clears expired stored sessions before reusing them", () => {
  const expiredSession = {
    userId: "usr_expired",
    email: "expired@example.com",
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  };
  const { requestIdentity, localStorage } = loadRequestIdentity({
    storageSeed: {
      invoiceSessionToken: "expired-token",
      invoiceAuthSession: JSON.stringify(expiredSession)
    }
  });

  assert.equal(requestIdentity.getAuthSession(), null);
  assert.equal(requestIdentity.getSessionToken(), null);

  const stored = localStorage.dump();
  assert.equal(stored.invoiceSessionToken, undefined);
  assert.equal(stored.invoiceAuthSession, undefined);
});

test("request identity rewrites local Capacitor API calls to the production API origin", async () => {
  const { requestIdentity, fetchCalls } = loadRequestIdentity({
    windowOverrides: {
      location: { origin: "https://localhost" },
      Capacitor: {},
      WEBVIEW_SERVER_URL: "https://localhost"
    }
  });

  assert.equal(
    requestIdentity.resolveApiUrl("/api/invoices/from-input"),
    "https://app.notebill.app/api/invoices/from-input"
  );

  await requestIdentity.apiFetch("/api/invoices/from-input?debug=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "test" })
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "https://app.notebill.app/api/invoices/from-input?debug=1");
  assert.equal(fetchCalls[0].init?.method, "POST");
});

test("request identity keeps relative API calls relative outside Capacitor local origin", async () => {
  const { requestIdentity, fetchCalls } = loadRequestIdentity();

  assert.equal(requestIdentity.resolveApiUrl("/api/invoices/from-input"), "/api/invoices/from-input");

  await requestIdentity.apiFetch("/api/invoices/from-input");

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "/api/invoices/from-input");
});

test("request identity apiFetch attaches auth and owner headers for Request inputs", async () => {
  const activeSession = {
    userId: "usr_active",
    email: "owner@example.com",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
  const { requestIdentity, fetchCalls } = loadRequestIdentity({
    storageSeed: {
      invoiceSessionToken: "active-token",
      invoiceAuthSession: JSON.stringify(activeSession)
    }
  });

  const request = new Request("https://example.com/api/test", {
    headers: {
      "x-test-header": "present"
    }
  });

  await requestIdentity.apiFetch(request);

  assert.equal(fetchCalls.length, 1);
  const forwardedRequest = fetchCalls[0].input as Request;
  assert.equal(forwardedRequest instanceof Request, true);
  assert.equal(forwardedRequest.headers.get("authorization"), "Bearer active-token");
  assert.equal(forwardedRequest.headers.get("x-invoice-user-id"), "usr_active");
  assert.equal(forwardedRequest.headers.get("x-test-header"), "present");
});

test("request identity loads auth providers from the auth providers endpoint", async () => {
  const { requestIdentity, fetchCalls } = loadRequestIdentity({
    fetchImpl: async () =>
      new Response(JSON.stringify({ providers: [{ id: "email_link", available: true }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
  });

  const providers = await requestIdentity.loadAuthProviders();

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "/api/auth/providers");
  assert.deepEqual(providers, [{ id: "email_link", available: true }]);
});

test("request identity resolves Google auth start URL through the shared API origin helper", () => {
  const { requestIdentity } = loadRequestIdentity({
    windowOverrides: {
      location: { origin: "https://localhost" },
      Capacitor: {},
      WEBVIEW_SERVER_URL: "https://localhost"
    }
  });

  assert.equal(
    requestIdentity.getGoogleAuthStartUrl("/manual"),
    "https://app.notebill.app/api/auth/google/start?returnTo=%2Fmanual"
  );
});

test("request identity can store a hosted redirect sign-in session", () => {
  const { requestIdentity, localStorage } = loadRequestIdentity();

  const session = requestIdentity.completeRedirectSignIn("redirect-token", {
    userId: "usr_google_owner",
    email: "Owner@Example.com",
    expiresAt: "2030-01-01T00:00:00.000Z"
  });

  assert.equal(JSON.stringify(session), JSON.stringify({
    userId: "usr_google_owner",
    email: "owner@example.com",
    expiresAt: "2030-01-01T00:00:00.000Z"
  }));
  assert.equal(JSON.stringify(requestIdentity.getAuthSession()), JSON.stringify(session));
  const stored = localStorage.dump();
  assert.equal(stored.invoiceSessionToken, "redirect-token");
  assert.equal(typeof stored.invoiceAuthSession, "string");
  assert.match(stored.invoiceAuthSession, /owner@example\.com/);
});
