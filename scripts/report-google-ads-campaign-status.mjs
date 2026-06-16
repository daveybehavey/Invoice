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

async function main() {
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!envValue("GOOGLE_ADS_DEVELOPER_TOKEN") || !customerId) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID.");
  }

  const accessToken = await getGoogleOAuthAccessToken();
  const campaignQuery =
    "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.serving_status, campaign_budget.amount_micros FROM campaign WHERE campaign.name LIKE 'NB | Search | High Intent | %' ORDER BY campaign.id DESC LIMIT 1";
  const campaignPayload = await googleAdsSearch(customerId, accessToken, loginCustomerId, campaignQuery);
  const campaignRow = flattenResults(campaignPayload)[0] || null;
  if (!campaignRow) {
    throw new Error("No NoteBill campaign found with the expected prefix.");
  }

  const campaignId = String(campaignRow.campaign?.id || "");
  const adGroupPayload = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons FROM ad_group WHERE campaign.id = ${campaignId} ORDER BY ad_group.id`
  );

  const adPayload = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.status, ad_group_ad.primary_status, ad_group_ad.primary_status_reasons, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status FROM ad_group_ad WHERE campaign.id = ${campaignId} ORDER BY ad_group_ad.ad.id`
  );

  const keywordPayload = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = KEYWORD ORDER BY ad_group_criterion.criterion_id`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        customerId,
        loginCustomerId: loginCustomerId || null,
        campaign: {
          id: campaignRow.campaign?.id || "",
          name: campaignRow.campaign?.name || "",
          status: campaignRow.campaign?.status || "",
          primaryStatus: campaignRow.campaign?.primaryStatus || "",
          primaryStatusReasons: campaignRow.campaign?.primaryStatusReasons || [],
          servingStatus: campaignRow.campaign?.servingStatus || "",
          budgetMicros: campaignRow.campaignBudget?.amountMicros || "0"
        },
        adGroups: flattenResults(adGroupPayload).map((row) => ({
          id: row.adGroup?.id || "",
          name: row.adGroup?.name || "",
          status: row.adGroup?.status || "",
          primaryStatus: row.adGroup?.primaryStatus || "",
          primaryStatusReasons: row.adGroup?.primaryStatusReasons || []
        })),
        ads: flattenResults(adPayload).map((row) => ({
          id: row.adGroupAd?.ad?.id || "",
          type: row.adGroupAd?.ad?.type || "",
          status: row.adGroupAd?.status || "",
          primaryStatus: row.adGroupAd?.primaryStatus || "",
          primaryStatusReasons: row.adGroupAd?.primaryStatusReasons || [],
          approvalStatus: row.adGroupAd?.policySummary?.approvalStatus || "",
          reviewStatus: row.adGroupAd?.policySummary?.reviewStatus || ""
        })),
        keywords: flattenResults(keywordPayload).map((row) => ({
          criterionId: row.adGroupCriterion?.criterionId || "",
          text: row.adGroupCriterion?.keyword?.text || "",
          matchType: row.adGroupCriterion?.keyword?.matchType || "",
          status: row.adGroupCriterion?.status || "",
          primaryStatus: row.adGroupCriterion?.primaryStatus || "",
          primaryStatusReasons: row.adGroupCriterion?.primaryStatusReasons || []
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
