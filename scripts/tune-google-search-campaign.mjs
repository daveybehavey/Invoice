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

function parseBool(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
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

async function googleAdsRequest(customerId, accessToken, loginCustomerId, method, pathname, body, extraQuery = {}) {
  const url = new URL(`https://googleads.googleapis.com/${API_VERSION}${pathname}`);
  for (const [key, value] of Object.entries(extraQuery)) {
    url.searchParams.set(key, String(value));
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json"
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetchJson(url.toString(), {
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

function buildUpdateMask(fields) {
  return Array.from(new Set(fields)).join(",");
}

async function main() {
  const previewOnly = parseBool(process.argv.slice(2).includes("--preview"));
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
    "SELECT campaign.id, campaign.name, campaign.resource_name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.serving_status FROM campaign WHERE campaign.name LIKE 'NB | Search | High Intent | %' ORDER BY campaign.id DESC LIMIT 1"
  );
  const campaign = campaignRows[0]?.campaign || null;
  if (!campaign) {
    throw new Error("No NoteBill campaign found with the expected prefix.");
  }

  const campaignId = String(campaign.id || "");
  const adGroupRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group.id, ad_group.name, ad_group.resource_name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons FROM ad_group WHERE campaign.id = ${campaignId} ORDER BY ad_group.id`
  );

  const keywordRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group.id, ad_group.name, ad_group.resource_name, ad_group_criterion.resource_name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.cpc_bid_micros, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = KEYWORD ORDER BY ad_group.id, ad_group_criterion.criterion_id`
  );

  const mobileGroup = adGroupRows.find((row) => String(row.adGroup?.name || "") === "NB | Mobile") || null;
  if (!mobileGroup) {
    throw new Error("Could not find the mobile ad group to focus.");
  }

  const mobileGroupId = String(mobileGroup.adGroup?.id || "");
  const mobileExactPrimary = {
    text: "invoice app on phone",
    matchType: "EXACT",
    bidMicros: 750000
  };
  const mobileExactBackup = {
    text: "mobile invoice app",
    matchType: "EXACT",
    bidMicros: 500000
  };
  const retainedKeywordPairs = new Set([
    `${mobileExactPrimary.text}::${mobileExactPrimary.matchType}`,
    `${mobileExactBackup.text}::${mobileExactBackup.matchType}`
  ]);

  const plannedAdGroupUpdates = adGroupRows
    .map((row) => ({
      resourceName: String(row.adGroup?.resourceName || ""),
      name: String(row.adGroup?.name || ""),
      status: String(row.adGroup?.status || "")
    }))
    .filter((row) => row.resourceName)
    .map((row) => ({
      resourceName: row.resourceName,
      name: row.name,
      nextStatus: row.name === "NB | Mobile" ? "ENABLED" : "PAUSED"
    }))
    .filter((row) => row.status !== row.nextStatus);

  const plannedKeywordUpdates = keywordRows
    .map((row) => ({
      resourceName: String(row.adGroupCriterion?.resourceName || ""),
      groupName: String(row.adGroup?.name || ""),
      text: String(row.adGroupCriterion?.keyword?.text || ""),
      matchType: String(row.adGroupCriterion?.keyword?.matchType || ""),
      status: String(row.adGroupCriterion?.status || ""),
      currentBidMicros: String(row.adGroupCriterion?.cpcBidMicros || "0")
    }))
    .filter((row) => row.resourceName)
    .map((row) => {
      const key = `${row.text}::${row.matchType}`;
      const isMobileGroup = row.groupName === "NB | Mobile";
      if (isMobileGroup && retainedKeywordPairs.has(key)) {
        const targetBidMicros =
          key === `${mobileExactPrimary.text}::${mobileExactPrimary.matchType}`
            ? String(mobileExactPrimary.bidMicros)
            : String(mobileExactBackup.bidMicros);
        return {
          resourceName: row.resourceName,
          text: row.text,
          matchType: row.matchType,
          nextStatus: "ENABLED",
          nextBidMicros: targetBidMicros,
          currentStatus: row.status,
          currentBidMicros: row.currentBidMicros
        };
      }
      return {
        resourceName: row.resourceName,
        text: row.text,
        matchType: row.matchType,
        nextStatus: "PAUSED",
        nextBidMicros: null,
        currentStatus: row.status,
        currentBidMicros: row.currentBidMicros
      };
    })
    .filter((row) => row.currentStatus !== row.nextStatus || (row.nextBidMicros && row.currentBidMicros !== row.nextBidMicros));

  const preview = {
    ok: true,
    previewOnly,
    customerId,
    loginCustomerId: loginCustomerId || null,
    campaign: {
      id: campaign.id || "",
      name: campaign.name || "",
      status: campaign.status || "",
      primaryStatus: campaign.primaryStatus || campaign.primary_status || "",
      primaryStatusReasons: campaign.primaryStatusReasons || campaign.primary_status_reasons || [],
      servingStatus: campaign.servingStatus || campaign.serving_status || ""
    },
    adGroupUpdates: plannedAdGroupUpdates,
    keywordUpdates: plannedKeywordUpdates
  };

  if (previewOnly) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  if (plannedAdGroupUpdates.length > 0) {
    await googleAdsRequest(
      customerId,
      accessToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/adGroups:mutate`,
      {
        operations: plannedAdGroupUpdates.map((item) => ({
          update: {
            resourceName: item.resourceName,
            status: item.nextStatus
          },
          updateMask: buildUpdateMask(["status"])
        }))
      }
    );
  }

  if (plannedKeywordUpdates.length > 0) {
    await googleAdsRequest(
      customerId,
      accessToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/adGroupCriteria:mutate`,
      {
        operations: plannedKeywordUpdates.map((item) => {
          const update = {
            resourceName: item.resourceName,
            status: item.nextStatus
          };
          const fields = ["status"];
          if (item.nextBidMicros) {
            update.cpcBidMicros = String(item.nextBidMicros);
            fields.push("cpcBidMicros");
          }
          return {
            update,
            updateMask: buildUpdateMask(fields)
          };
        })
      }
    );
  }

  console.log(
    JSON.stringify(
      {
        ...preview,
        applied: true,
        adGroupCount: plannedAdGroupUpdates.length,
        keywordCount: plannedKeywordUpdates.length,
        mobileGroupId
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
