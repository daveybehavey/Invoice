(() => {
  if (typeof window === "undefined") {
    return;
  }
  if (!("serviceWorker" in navigator)) {
    return;
  }
  if (navigator.webdriver) {
    return;
  }
  const protocol = window.location.protocol;
  if (protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return;
  }
  const buildId =
    window.InvoiceBuildMeta && typeof window.InvoiceBuildMeta === "object"
      ? String(window.InvoiceBuildMeta.buildId || "").trim()
      : "";
  const serviceWorkerUrl = buildId ? `/sw.js?v=${encodeURIComponent(buildId)}` : "/sw.js";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => undefined);
  });
})();
