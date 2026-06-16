import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const API_VERSION = "v22";
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
  if (!accessToken) {
    throw new Error("Google OAuth token refresh returned no access token.");
  }
  return accessToken;
}

async function googleAdsSearch(customerId, accessToken, loginCustomerId, query) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json"
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetchJson(`https://googleads.googleapis.com/${API_VERSION}/customers/${encodeURIComponent(customerId)}/googleAds:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query })
  });
  if (!response.ok) {
    const message = response.payload?.error?.message || `Google Ads search failed (${response.status}).`;
    const details = response.payload?.error?.details ? JSON.stringify(response.payload.error.details) : "";
    throw new Error(details ? `${message} :: ${details}` : message);
  }
  return response.payload;
}

function flattenResults(payload) {
  return Array.isArray(payload?.results) ? payload.results : [];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flagSearchTerm(term) {
  const normalized = String(term || "").trim().toLowerCase();
  const junkPatterns = [
    "free",
    "template",
    "templates",
    "spreadsheet",
    "excel",
    "word",
    "download",
    "pdf",
    "receipt",
    "payroll",
    "jobs",
    "careers",
    "salary",
    "resume",
    "sample",
    "example",
    "invoice generator",
    "invoice template"
  ];
  return junkPatterns.filter((pattern) => normalized.includes(pattern));
}

async function main() {
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!envValue("GOOGLE_ADS_DEVELOPER_TOKEN") || !customerId) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID.");
  }

  const accessToken = await getGoogleOAuthAccessToken();
  const campaignQuery =
    "SELECT campaign.id, campaign.name FROM campaign WHERE campaign.name LIKE 'NB | Search | High Intent | %' ORDER BY campaign.id DESC LIMIT 1";
  const campaignPayload = await googleAdsSearch(customerId, accessToken, loginCustomerId, campaignQuery);
  const campaignRow = flattenResults(campaignPayload)[0] || null;
  if (!campaignRow) {
    throw new Error("No NoteBill campaign found with the expected prefix.");
  }

  const campaignId = String(campaignRow.campaign?.id || "");
  const searchTermPayload = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS ORDER BY metrics.clicks DESC, metrics.impressions DESC`
  );

  const rows = flattenResults(searchTermPayload).map((row) => {
    const searchTerm = String(row.searchTermView?.searchTerm || "");
    const flags = flagSearchTerm(searchTerm);
    return {
      campaignName: String(row.campaign?.name || ""),
      adGroupName: String(row.adGroup?.name || ""),
      searchTerm,
      impressions: String(row.metrics?.impressions || "0"),
      clicks: String(row.metrics?.clicks || "0"),
      costMicros: String(row.metrics?.costMicros || "0"),
      conversions: String(row.metrics?.conversions || "0"),
      junkFlags: flags
    };
  });

  const junkRows = rows.filter((row) => row.junkFlags.length > 0);
  const zeroClickRows = rows.filter((row) => toNumber(row.impressions) > 0 && toNumber(row.clicks) === 0);
  const totalClicks = rows.reduce((sum, row) => sum + toNumber(row.clicks), 0);
  const totalImpressions = rows.reduce((sum, row) => sum + toNumber(row.impressions), 0);
  const totalConversions = rows.reduce((sum, row) => sum + toNumber(row.conversions), 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        customerId,
        loginCustomerId: loginCustomerId || null,
        campaign: {
          id: campaignRow.campaign?.id || "",
          name: campaignRow.campaign?.name || ""
        },
        totals: {
          impressions: String(totalImpressions),
          clicks: String(totalClicks),
          conversions: String(totalConversions),
          termCount: rows.length
        },
        searchTerms: rows,
        summary: {
          junkTermCount: junkRows.length,
          junkTerms: junkRows.slice(0, 20).map((row) => row.searchTerm),
          zeroClickTermCount: zeroClickRows.length,
          shouldAddNegatives: junkRows.length > 0
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
