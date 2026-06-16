const SW_URL = new URL(self.location.href);
const BUILD_VERSION = SW_URL.searchParams.get("v") || "dev";
const CACHE_NAME = `notebill-shell-${BUILD_VERSION}`;
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/dist/app.css",
  "/dist/build-meta.js",
  "/dist/runtime-config.js",
  "/manifest.webmanifest"
];

function isCacheableResponse(response) {
  return Boolean(response && response.status === 200 && response.type === "basic");
}

async function cacheResponse(request, response) {
  if (!isCacheableResponse(response)) {
    return response;
  }
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone()).catch(() => undefined);
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return await cacheResponse(request, response);
  } catch (_error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    if (request.mode === "navigate") {
      const shell = await caches.match("/index.html");
      if (shell) {
        return shell;
      }
    }
    throw _error;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => cacheResponse(request, response))
    .catch(() => null);
  if (cached) {
    return cached;
  }
  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }
  throw new Error("offline");
}

function shouldUseNetworkFirst(requestUrl, request) {
  if (request.mode === "navigate") {
    return true;
  }
  return (
    requestUrl.pathname === "/index.html" ||
    requestUrl.pathname.endsWith(".js") ||
    requestUrl.pathname.endsWith(".css") ||
    requestUrl.pathname.endsWith(".html") ||
    requestUrl.pathname.endsWith(".webmanifest")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    shouldUseNetworkFirst(requestUrl, request)
      ? networkFirst(request)
      : staleWhileRevalidate(request)
  );
});
