import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const rootDir = process.cwd();

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

function sanitizeCustomerId(value) {
  return String(value || "").replace(/-/g, "").trim();
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

async function getGoogleOAuthAccessToken(requiredScope = "") {
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
  if (!requiredScope || !accessToken) {
    return accessToken;
  }
  const tokenInfo = await fetchTokenInfo(accessToken);
  const scopes = String(tokenInfo.payload?.scope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!scopes.includes(requiredScope)) {
    throw new Error(
      `Google OAuth token is missing required scope ${requiredScope}. Current scopes: ${scopes.join(", ") || "none"}. Regenerate GOOGLE_ADS_REFRESH_TOKEN with the Analytics scope included.`
    );
  }
  return accessToken;
}

async function fetchGa4Summary(accessToken) {
  const propertyId = envValue("GOOGLE_ANALYTICS_PROPERTY_ID");
  const summary = await fetchJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "eventCount" }
        ]
      })
    }
  );
  if (!summary.ok) {
    throw new Error(summary.payload?.error?.message || `GA4 summary failed (${summary.status}).`);
  }

  const landingPages = await fetchJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5
      })
    }
  );
  if (!landingPages.ok) {
    throw new Error(landingPages.payload?.error?.message || `GA4 landing pages failed (${landingPages.status}).`);
  }

  return {
    propertyId,
    totals: {
      sessions: summary.payload?.rows?.[0]?.metricValues?.[0]?.value || "0",
      activeUsers: summary.payload?.rows?.[0]?.metricValues?.[1]?.value || "0",
      pageViews: summary.payload?.rows?.[0]?.metricValues?.[2]?.value || "0",
      eventCount: summary.payload?.rows?.[0]?.metricValues?.[3]?.value || "0"
    },
    topPages:
      landingPages.payload?.rows?.map((row) => ({
        path: row.dimensionValues?.[0]?.value || "",
        views: row.metricValues?.[0]?.value || "0"
      })) ?? []
  };
}

async function fetchAdsSummary(accessToken) {
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json"
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const summary = await fetchJson(
    `https://googleads.googleapis.com/v22/customers/${encodeURIComponent(customerId)}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        query:
          "SELECT customer.descriptive_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date DURING LAST_30_DAYS"
      })
    }
  );
  if (!summary.ok) {
    throw new Error(summary.payload?.error?.message || `Google Ads summary failed (${summary.status}).`);
  }

  const campaigns = await fetchJson(
    `https://googleads.googleapis.com/v22/customers/${encodeURIComponent(customerId)}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        query:
          "SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 5"
      })
    }
  );
  if (!campaigns.ok) {
    throw new Error(campaigns.payload?.error?.message || `Google Ads campaigns failed (${campaigns.status}).`);
  }

  const summaryRow = summary.payload?.results?.[0] ?? {};
  return {
    customerId,
    totals: {
      accountName: summaryRow.customer?.descriptiveName || "",
      impressions: summaryRow.metrics?.impressions || "0",
      clicks: summaryRow.metrics?.clicks || "0",
      costMicros: summaryRow.metrics?.costMicros || "0",
      conversions: summaryRow.metrics?.conversions || "0"
    },
    topCampaigns:
      campaigns.payload?.results?.map((row) => ({
        campaignName: row.campaign?.name || "",
        impressions: row.metrics?.impressions || "0",
        clicks: row.metrics?.clicks || "0",
        costMicros: row.metrics?.costMicros || "0",
        conversions: row.metrics?.conversions || "0"
      })) ?? []
  };
}

async function main() {
  const accessToken = await getGoogleOAuthAccessToken("https://www.googleapis.com/auth/analytics.readonly");
  const [ga4, googleAds] = await Promise.all([fetchGa4Summary(accessToken), fetchAdsSummary(accessToken)]);
  console.log(JSON.stringify({ ok: true, ga4, googleAds }, null, 2));
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
