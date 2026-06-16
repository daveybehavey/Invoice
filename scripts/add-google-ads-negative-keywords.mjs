import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const API_VERSION = "v22";
const rootDir = process.cwd();
const DEFAULT_NEGATIVE_TERMS = [
  "invoice generator app",
  "mobile invoice generator",
  "online mobile invoice generator"
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
    "SELECT campaign.id, campaign.name, campaign.resource_name FROM campaign WHERE campaign.name LIKE 'NB | Search | High Intent | %' ORDER BY campaign.id DESC LIMIT 1"
  );
  const campaign = campaignRows[0]?.campaign || null;
  if (!campaign) {
    throw new Error("No NoteBill campaign found with the expected prefix.");
  }

  const campaignId = String(campaign.id || "");
  const negativeRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = KEYWORD`
  );

  const existingNegatives = new Set(
    negativeRows.map((row) => {
      const text = String(row.campaignCriterion?.keyword?.text || "").trim().toLowerCase();
      const matchType = String(row.campaignCriterion?.keyword?.matchType || "").trim().toUpperCase();
      return `${text}::${matchType}`;
    })
  );

  const termsToCreate = DEFAULT_NEGATIVE_TERMS.filter(
    (term) => !existingNegatives.has(`${term.toLowerCase()}::EXACT`)
  );

  const plan = {
    previewOnly,
    customerId,
    loginCustomerId: loginCustomerId || null,
    campaign: {
      id: campaignId,
      name: String(campaign.name || "")
    },
    existingNegatives: Array.from(existingNegatives),
    termsToCreate
  };

  if (previewOnly) {
    console.log(JSON.stringify({ ok: true, plan }, null, 2));
    return;
  }

  if (termsToCreate.length > 0) {
    await googleAdsRequest(
      customerId,
      accessToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/campaignCriteria:mutate`,
      {
        operations: termsToCreate.map((term) => ({
          create: {
            campaign: String(campaign.resourceName || ""),
            negative: true,
            keyword: {
              text: term,
              matchType: "EXACT"
            }
          }
        }))
      }
    );
  }

  const verifyRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = KEYWORD`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        createdCount: termsToCreate.length,
        negatives: verifyRows.map((row) => ({
          resourceName: String(row.campaignCriterion?.resourceName || ""),
          text: String(row.campaignCriterion?.keyword?.text || ""),
          matchType: String(row.campaignCriterion?.keyword?.matchType || "")
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
