import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const API_VERSION = "v22";
const rootDir = process.cwd();
const TARGET_URL_BY_GROUP = {
  "NB | Contractors": "https://app.notebill.app/invoice-app-for-contractors",
  "NB | Service Businesses": "https://app.notebill.app/invoice-app-for-service-businesses",
  "NB | Mobile": "https://app.notebill.app/invoice-app-on-phone",
  "NB | Statements": "https://app.notebill.app/client-statements-and-follow-up"
};

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

async function googleAdsRequest(customerId, accessToken, loginCustomerId, method, pathname, body) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json"
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetchJson(`https://googleads.googleapis.com/${API_VERSION}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const message = response.payload?.error?.message || `Google Ads request failed (${response.status}) for ${pathname}`;
    const details = response.payload?.error?.details ? JSON.stringify(response.payload.error.details) : "";
    throw new Error(details ? `${message} :: ${details}` : message);
  }
  return response.payload;
}

async function googleAdsSearch(customerId, accessToken, loginCustomerId, query) {
  const payload = await googleAdsRequest(
    customerId,
    accessToken,
    loginCustomerId,
    "POST",
    `/customers/${encodeURIComponent(customerId)}/googleAds:search`,
    { query }
  );
  return Array.isArray(payload?.results) ? payload.results : [];
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

async function main() {
  const previewOnly = process.argv.slice(2).includes("--preview");
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!envValue("GOOGLE_ADS_DEVELOPER_TOKEN") || !customerId) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID.");
  }

  const accessToken = await getGoogleOAuthAccessToken();
  const campaignRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    "SELECT campaign.id, campaign.name FROM campaign WHERE campaign.name LIKE 'NB | Search | High Intent | %' ORDER BY campaign.id DESC LIMIT 1"
  );
  const campaign = campaignRows[0]?.campaign || null;
  if (!campaign) {
    throw new Error("No NoteBill campaign found with the expected prefix.");
  }

  const campaignId = String(campaign.id || "");
  const adRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group.name, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'`
  );

  const updates = adRows
    .map((row) => {
      const adGroupName = String(row.adGroup?.name || "");
      const resourceName = String(row.adGroupAd?.ad?.resourceName || "");
      const currentFinalUrl = normalizeUrl(row.adGroupAd?.ad?.finalUrls?.[0] || "");
      const targetFinalUrl = normalizeUrl(TARGET_URL_BY_GROUP[adGroupName] || "");
      if (!resourceName || !targetFinalUrl || currentFinalUrl === targetFinalUrl) {
        return null;
      }
      return {
        adGroupName,
        resourceName,
        currentFinalUrl,
        targetFinalUrl
      };
    })
    .filter(Boolean);

  const plan = {
    previewOnly,
    customerId,
    loginCustomerId: loginCustomerId || null,
    campaign: {
      id: campaignId,
      name: String(campaign.name || "")
    },
    updates
  };

  if (previewOnly) {
    console.log(JSON.stringify({ ok: true, plan }, null, 2));
    return;
  }

  if (updates.length > 0) {
    await googleAdsRequest(
      customerId,
      accessToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/ads:mutate`,
      {
        operations: updates.map((item) => ({
          update: {
            resourceName: item.resourceName,
            finalUrls: [item.targetFinalUrl]
          },
          updateMask: "finalUrls"
        }))
      }
    );
  }

  const verifyRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group.name, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        updatedCount: updates.length,
        finalUrls: verifyRows.map((row) => ({
          adGroupName: String(row.adGroup?.name || ""),
          resourceName: String(row.adGroupAd?.ad?.resourceName || ""),
          finalUrl: normalizeUrl(row.adGroupAd?.ad?.finalUrls?.[0] || "")
        }))
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
