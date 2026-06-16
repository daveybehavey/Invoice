import { httpServerHandler } from "cloudflare:node";
import "./server.js";
import { PUBLIC_PAGE_METADATA, injectPageMetadata } from "./publicPageMetadata.js";

const nodeHandler = httpServerHandler({ port: 3000 });

type WorkerEnv = {
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
};

async function renderPublicMarketingPage(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const metadata = PUBLIC_PAGE_METADATA[url.pathname as keyof typeof PUBLIC_PAGE_METADATA];
  if (!metadata || !env.ASSETS) {
    return null;
  }

  const assetRequest = new Request(new URL("/spa-shell.html", url).toString(), request);
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  const contentType = assetResponse.headers.get("content-type") ?? "";
  if (!assetResponse.ok || !contentType.includes("text/html")) {
    return assetResponse;
  }

  const html = await assetResponse.text();
  const nextHtml = injectPageMetadata(html, url.pathname, metadata);
  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  const responseBody = request.method === "HEAD" ? null : nextHtml;
  return new Response(responseBody, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: { waitUntil?: (promise: Promise<unknown>) => void }) {
    const url = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname in PUBLIC_PAGE_METADATA) {
      const marketingResponse = await renderPublicMarketingPage(request, env);
      if (marketingResponse) {
        return marketingResponse;
      }
    }
    return nodeHandler.fetch(request, env, ctx);
  }
};
