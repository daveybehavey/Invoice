import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const rootDir = process.cwd();
const targetEvents = [
  "pro_unlock_verified",
  "checkout_started",
  "billing_plan_selected",
  "account_signed_in",
  "billing_plan_viewed",
  "begin_checkout",
  "login",
  "select_item",
  "view_item_list",
  "landing_invoice_sample_opened"
];

function loadRepoEnv() {
  const merged = {};
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    Object.assign(merged, dotenv.parse(readFileSync(filePath, "utf8")));
  }
  return merged;
}

const repoEnv = loadRepoEnv();

function envValue(name) {
  const direct = process.env[name];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const repo = repoEnv[name];
  return typeof repo === "string" && repo.trim() ? repo.trim() : "";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

async function fetchTokenInfo(accessToken) {
  return fetchJson(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
}

async function getGoogleOAuthAccessToken() {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: envValue("GOOGLE_ADS_CLIENT_ID"),
    client_secret: envValue("GOOGLE_ADS_CLIENT_SECRET"),
    refresh_token: envValue("GOOGLE_ADS_REFRESH_TOKEN")
  });
  const tokenResponse = await fetchJson("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!tokenResponse.ok) {
    throw new Error(
      tokenResponse.payload?.error_description ||
        tokenResponse.payload?.error ||
        `Unable to refresh Google OAuth token (${tokenResponse.status}).`
    );
  }
  const accessToken = tokenResponse.payload?.access_token || "";
  const tokenInfo = await fetchTokenInfo(accessToken);
  const scopes = String(tokenInfo.payload?.scope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const requiredScope = "https://www.googleapis.com/auth/analytics.readonly";
  if (!scopes.includes(requiredScope)) {
    throw new Error(
      `Google OAuth token is missing required scope ${requiredScope}. Current scopes: ${scopes.join(", ") || "none"}. Regenerate GOOGLE_ADS_REFRESH_TOKEN with the Analytics scope included.`
    );
  }
  return accessToken;
}

async function fetchEventCounts(accessToken, propertyId) {
  const response = await fetchJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: {
            fieldName: "eventName",
            inListFilter: {
              values: targetEvents
            }
          }
        },
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 20
      })
    }
  );
  if (!response.ok) {
    throw new Error(response.payload?.error?.message || `GA4 conversion readiness failed (${response.status}).`);
  }

  const counts = new Map();
  for (const row of response.payload?.rows ?? []) {
    const eventName = row.dimensionValues?.[0]?.value || "";
    const eventCount = row.metricValues?.[0]?.value || "0";
    if (eventName) {
      counts.set(eventName, eventCount);
    }
  }

  return targetEvents.map((eventName) => ({
    eventName,
    eventCount: counts.get(eventName) || "0",
    seen: counts.has(eventName)
  }));
}

async function main() {
  const propertyId = envValue("GOOGLE_ANALYTICS_PROPERTY_ID");
  if (!propertyId) {
    throw new Error("Missing GOOGLE_ANALYTICS_PROPERTY_ID.");
  }
  const accessToken = await getGoogleOAuthAccessToken();
  const events = await fetchEventCounts(accessToken, propertyId);
  const seenEvents = events.filter((entry) => entry.seen).map((entry) => entry.eventName);
  const missingEvents = events.filter((entry) => !entry.seen).map((entry) => entry.eventName);

  console.log(
    JSON.stringify(
      {
        ok: true,
        propertyId,
        lookback: "7daysAgo..today",
        events,
        summary: {
          seenEvents,
          missingEvents
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
