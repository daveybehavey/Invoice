(() => {
  const storageKey = "invoiceOwnerId";
  const sessionTokenStorageKey = "invoiceSessionToken";
  const sessionStorageKey = "invoiceAuthSession";
  const ownerHeader = "x-invoice-user-id";
  const authHeader = "authorization";
  const productionApiOrigin = "https://app.notebill.app";
  let cachedOwnerId = null;
  let cachedSessionToken = null;
  let cachedSession = null;

  const isCapacitorLocalApiOrigin = () => {
    const origin = window.location?.origin || "";
    return origin === "https://localhost" && Boolean(window.Capacitor || window.WEBVIEW_SERVER_URL);
  };

  const resolveApiUrl = (value) => {
    if (!isCapacitorLocalApiOrigin()) {
      return value;
    }
    try {
      const currentOrigin = window.location?.origin || "https://localhost";
      if (typeof value === "string") {
        if (value.startsWith("/api/")) {
          return `${productionApiOrigin}${value}`;
        }
        const parsed = new URL(value, currentOrigin);
        if (parsed.origin === currentOrigin && parsed.pathname.startsWith("/api/")) {
          return `${productionApiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        return value;
      }
      if (value instanceof URL) {
        if (value.origin === currentOrigin && value.pathname.startsWith("/api/")) {
          return new URL(`${productionApiOrigin}${value.pathname}${value.search}${value.hash}`);
        }
        return value;
      }
    } catch (_error) {
      return value;
    }
    return value;
  };

  const isExpiredSession = (session) => {
    if (!session || typeof session !== "object") {
      return false;
    }
    const expiresAt = typeof session.expiresAt === "string" ? session.expiresAt.trim() : "";
    if (!expiresAt) {
      return false;
    }
    const expiresAtMs = Date.parse(expiresAt);
    return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
  };

  const readStoredOwnerId = () => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return typeof stored === "string" && stored.trim().length > 0 ? stored.trim() : null;
    } catch (_error) {
      return null;
    }
  };

  const writeStoredOwnerId = (ownerId) => {
    try {
      window.localStorage.setItem(storageKey, ownerId);
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const readStoredSessionToken = () => {
    try {
      const token = window.localStorage.getItem(sessionTokenStorageKey);
      return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
    } catch (_error) {
      return null;
    }
  };

  const writeStoredSessionToken = (token) => {
    try {
      if (!token) {
        window.localStorage.removeItem(sessionTokenStorageKey);
        return;
      }
      window.localStorage.setItem(sessionTokenStorageKey, token);
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const readStoredSession = () => {
    try {
      const raw = window.localStorage.getItem(sessionStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      if (typeof parsed.userId !== "string" || typeof parsed.email !== "string") {
        return null;
      }
      return {
        userId: parsed.userId,
        email: parsed.email,
        expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : ""
      };
    } catch (_error) {
      return null;
    }
  };

  const writeStoredSession = (session) => {
    try {
      if (!session) {
        window.localStorage.removeItem(sessionStorageKey);
        return;
      }
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const getSessionToken = () => {
    const session = getAuthSession();
    if (!session?.userId) {
      if (cachedSessionToken || readStoredSessionToken()) {
        clearAuthSession();
      }
      return null;
    }
    if (cachedSessionToken) {
      return cachedSessionToken;
    }
    cachedSessionToken = readStoredSessionToken();
    return cachedSessionToken;
  };

  const getAuthSession = () => {
    if (cachedSession && isExpiredSession(cachedSession)) {
      clearAuthSession();
      return null;
    }
    if (cachedSession) {
      return cachedSession;
    }
    cachedSession = readStoredSession();
    if (isExpiredSession(cachedSession)) {
      clearAuthSession();
      return null;
    }
    return cachedSession;
  };

  const setAuthSession = (token, session) => {
    cachedSessionToken = token || null;
    cachedSession = session || null;
    writeStoredSessionToken(cachedSessionToken);
    writeStoredSession(cachedSession);
    if (cachedSession?.userId) {
      cachedOwnerId = cachedSession.userId;
      writeStoredOwnerId(cachedOwnerId);
    }
  };

  const clearAuthSession = () => {
    setAuthSession(null, null);
  };

  const createOwnerId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const getInvoiceOwnerId = () => {
    const session = getAuthSession();
    if (session?.userId) {
      cachedOwnerId = session.userId;
      return cachedOwnerId;
    }
    if (cachedOwnerId) {
      return cachedOwnerId;
    }
    const storedOwnerId = readStoredOwnerId();
    if (storedOwnerId) {
      cachedOwnerId = storedOwnerId;
      return cachedOwnerId;
    }
    cachedOwnerId = createOwnerId();
    writeStoredOwnerId(cachedOwnerId);
    return cachedOwnerId;
  };

  const getStorageScopeId = () => {
    const session = getAuthSession();
    if (session?.userId) {
      return `user:${session.userId}`;
    }
    return `owner:${getInvoiceOwnerId()}`;
  };

  const getScopedStorageKey = (baseKey) => {
    const normalized = typeof baseKey === "string" ? baseKey.trim() : "";
    if (!normalized) {
      return "";
    }
    return `${normalized}::${getStorageScopeId()}`;
  };

  const mergeHeaders = (baseHeaders, nextHeaders) => {
    const merged = new Headers(baseHeaders || undefined);
    if (!nextHeaders) {
      return merged;
    }
    new Headers(nextHeaders).forEach((value, key) => {
      merged.set(key, value);
    });
    return merged;
  };

  const withOwnerHeaders = (requestInit = {}) => {
    const headers = mergeHeaders(undefined, requestInit.headers);
    const sessionToken = getSessionToken();
    const session = getAuthSession();
    if (sessionToken && !headers.has(authHeader)) {
      headers.set(authHeader, `Bearer ${sessionToken}`);
    }
    if (!headers.has(ownerHeader)) {
      headers.set(ownerHeader, session?.userId || getInvoiceOwnerId());
    }
    return { ...requestInit, headers };
  };

  const apiFetch = (input, init) => {
    if (input instanceof Request) {
      const resolvedInput = resolveApiUrl(input.url);
      const requestInit = withOwnerHeaders({
        ...(init || {}),
        headers: mergeHeaders(input.headers, init?.headers)
      });
      if (resolvedInput === input.url) {
        return window.fetch(new Request(input, requestInit));
      }
      const requestWithHeaders = new Request(input, requestInit);
      return window.fetch(
        new Request(resolvedInput, {
          method: requestWithHeaders.method,
          headers: requestWithHeaders.headers,
          body:
            requestWithHeaders.method === "GET" || requestWithHeaders.method === "HEAD"
              ? undefined
              : requestWithHeaders.clone().body,
          credentials: requestWithHeaders.credentials,
          cache: requestWithHeaders.cache,
          redirect: requestWithHeaders.redirect,
          referrer: requestWithHeaders.referrer,
          referrerPolicy: requestWithHeaders.referrerPolicy,
          integrity: requestWithHeaders.integrity,
          keepalive: requestWithHeaders.keepalive,
          mode: requestWithHeaders.mode
        })
      );
    }
    return window.fetch(resolveApiUrl(input), withOwnerHeaders(init || {}));
  };

  const requestSignInLink = async (email) => {
    const response = await apiFetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Sign in failed.");
    }
    return payload;
  };

  const completeEmailLinkSignIn = async (linkToken) => {
    const response = await apiFetch("/api/auth/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: linkToken })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Sign in failed.");
    }
    const token = typeof payload?.token === "string" ? payload.token : null;
    const session = payload?.session ?? null;
    if (!token || !session?.userId) {
      throw new Error("Sign in failed.");
    }
    setAuthSession(token, session);
    return session;
  };

  const refreshSession = async () => {
    const token = getSessionToken();
    if (!token) {
      clearAuthSession();
      return null;
    }
    const response = await apiFetch("/api/auth/session", {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      clearAuthSession();
      return null;
    }
    const payload = await response.json();
    const session = payload?.session ?? null;
    if (!session?.userId) {
      clearAuthSession();
      return null;
    }
    setAuthSession(token, session);
    return session;
  };

  const signOut = async () => {
    const token = getSessionToken();
    try {
      if (token) {
        await apiFetch("/api/auth/session", {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${token}`
          }
        });
      }
    } catch (_error) {
      // Best-effort remote sign out.
    } finally {
      clearAuthSession();
    }
  };

  window.InvoiceRequestIdentity = {
    ownerHeader,
    authHeader,
    storageKey,
    sessionTokenStorageKey,
    sessionStorageKey,
    getScopedStorageKey,
    getInvoiceOwnerId,
    getSessionToken,
    getAuthSession,
    requestSignInLink,
    completeEmailLinkSignIn,
    signOut,
    refreshSession,
    withOwnerHeaders,
    resolveApiUrl,
    apiFetch
  };
})();
