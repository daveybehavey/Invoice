import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const API_VERSION = "v22";
const CAMPAIGN_PREFIX = "NB | Search | High Intent |";
const TARGET_BIDDABLE_GOALS = new Set(["PURCHASE~WEBSITE", "SUBSCRIBE_PAID~WEBSITE"]);

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

function getArgs() {
  const args = process.argv.slice(2);
  const flags = new Set();
  const values = new Map();
  for (const arg of args) {
    const trimmed = String(arg || "").trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      values.set(key, rest.join("=").trim());
    } else {
      flags.add(trimmed);
    }
  }
  return { flags, values };
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

function quoteGaql(input) {
  return String(input || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function dedupeCampaigns(rows) {
  const seen = new Set();
  const campaigns = [];
  for (const row of rows) {
    const id = String(row?.campaign?.id || "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    campaigns.push({
      id,
      resourceName: String(row.campaign?.resourceName || ""),
      name: String(row.campaign?.name || ""),
      status: String(row.campaign?.status || ""),
      primaryStatus: String(row.campaign?.primaryStatus || ""),
      impressions: String(row.metrics?.impressions || "0"),
      clicks: String(row.metrics?.clicks || "0"),
      costMicros: String(row.metrics?.costMicros || "0"),
      conversions: String(row.metrics?.conversions || "0")
    });
  }
  return campaigns;
}

function summarizeGoals(rows) {
  return rows.map((row) => {
    const category = String(row?.campaignConversionGoal?.category || "");
    const origin = String(row?.campaignConversionGoal?.origin || "");
    return {
      resourceName: String(row?.campaignConversionGoal?.resourceName || ""),
      campaign: String(row?.campaignConversionGoal?.campaign || ""),
      category,
      origin,
      goalKey: `${category}~${origin}`,
      biddable: row?.campaignConversionGoal?.biddable === true
    };
  });
}

async function fetchTopConversionActions(customerId, accessToken, loginCustomerId) {
  const rows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    [
      "SELECT",
      "segments.conversion_action_name,",
      "segments.conversion_action,",
      "metrics.conversions,",
      "metrics.all_conversions",
      "FROM customer",
      "WHERE segments.date DURING LAST_30_DAYS",
      "AND metrics.all_conversions > 0",
      "ORDER BY metrics.all_conversions DESC"
    ].join(" ")
  );
  return rows.map((row) => ({
    resourceName: String(row?.segments?.conversionAction || ""),
    name: String(row?.segments?.conversionActionName || ""),
    conversions: String(row?.metrics?.conversions || "0"),
    allConversions: String(row?.metrics?.allConversions || "0")
  }));
}

async function main() {
  const { flags, values } = getArgs();
  const apply = flags.has("--apply");
  const previewOnly = !apply;
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!envValue("GOOGLE_ADS_DEVELOPER_TOKEN") || !customerId) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID.");
  }

  const requestedCampaignId = sanitizeCustomerId(values.get("--campaign-id") || "");
  const accessToken = await getGoogleOAuthAccessToken();

  const campaignRows = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    [
      "SELECT",
      "campaign.id,",
      "campaign.resource_name,",
      "campaign.name,",
      "campaign.status,",
      "campaign.primary_status,",
      "metrics.impressions,",
      "metrics.clicks,",
      "metrics.cost_micros,",
      "metrics.conversions",
      "FROM campaign",
      requestedCampaignId
        ? `WHERE campaign.id = ${requestedCampaignId} AND segments.date DURING LAST_30_DAYS`
        : `WHERE campaign.name LIKE '${quoteGaql(CAMPAIGN_PREFIX)}%' AND campaign.status != 'REMOVED' AND segments.date DURING LAST_30_DAYS`,
      "ORDER BY campaign.id DESC"
    ].join(" ")
  );

  const campaigns = dedupeCampaigns(campaignRows);
  if (campaigns.length === 0) {
    throw new Error(
      requestedCampaignId
        ? `No Google Ads campaign found for id ${requestedCampaignId}.`
        : `No non-removed Google Ads campaign found matching prefix "${CAMPAIGN_PREFIX}".`
    );
  }

  const selectedCampaigns = campaigns;
  const goalReports = [];
  const operations = [];

  for (const campaign of selectedCampaigns) {
    const configRows = await googleAdsSearch(
      customerId,
      accessToken,
      loginCustomerId,
      [
        "SELECT",
        "conversion_goal_campaign_config.campaign,",
        "conversion_goal_campaign_config.goal_config_level,",
        "conversion_goal_campaign_config.custom_conversion_goal,",
        "campaign.id,",
        "campaign.name",
        "FROM conversion_goal_campaign_config",
        `WHERE campaign.id = ${campaign.id}`
      ].join(" ")
    );
    const goalConfig = configRows[0]?.conversionGoalCampaignConfig || {};

    const goalRows = await googleAdsSearch(
      customerId,
      accessToken,
      loginCustomerId,
      [
        "SELECT",
        "campaign_conversion_goal.resource_name,",
        "campaign_conversion_goal.campaign,",
        "campaign_conversion_goal.category,",
        "campaign_conversion_goal.origin,",
        "campaign_conversion_goal.biddable,",
        "campaign.id,",
        "campaign.name",
        "FROM campaign_conversion_goal",
        `WHERE campaign.id = ${campaign.id}`,
        "ORDER BY campaign_conversion_goal.category, campaign_conversion_goal.origin"
      ].join(" ")
    );

    const goals = summarizeGoals(goalRows);
    const changes = [];

    for (const goal of goals) {
      if (!goal.resourceName) {
        continue;
      }
      const shouldBeBiddable = TARGET_BIDDABLE_GOALS.has(goal.goalKey);
      if (goal.biddable !== shouldBeBiddable) {
        changes.push({
          resourceName: goal.resourceName,
          goalKey: goal.goalKey,
          from: goal.biddable,
          to: shouldBeBiddable
        });
        operations.push({
          update: {
            resourceName: goal.resourceName,
            biddable: shouldBeBiddable
          },
          updateMask: "biddable"
        });
      }
    }

    goalReports.push({
      campaign,
      goalConfigLevel: String(goalConfig.goalConfigLevel || ""),
      customConversionGoal: String(goalConfig.customConversionGoal || ""),
      goals,
      changes
    });
  }

  const topConversionActions = await fetchTopConversionActions(customerId, accessToken, loginCustomerId);

  const report = {
    ok: true,
    previewOnly,
    targetBiddableGoals: Array.from(TARGET_BIDDABLE_GOALS),
    campaigns: goalReports,
    topConversionActionsLast30Days: topConversionActions
  };

  if (previewOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (operations.length > 0) {
    await googleAdsRequest(
      customerId,
      accessToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/campaignConversionGoals:mutate`,
      { operations }
    );
  }

  const verifyReports = [];
  for (const campaign of selectedCampaigns) {
    const goalRows = await googleAdsSearch(
      customerId,
      accessToken,
      loginCustomerId,
      [
        "SELECT",
        "campaign_conversion_goal.resource_name,",
        "campaign_conversion_goal.campaign,",
        "campaign_conversion_goal.category,",
        "campaign_conversion_goal.origin,",
        "campaign_conversion_goal.biddable,",
        "campaign.id,",
        "campaign.name",
        "FROM campaign_conversion_goal",
        `WHERE campaign.id = ${campaign.id}`,
        "ORDER BY campaign_conversion_goal.category, campaign_conversion_goal.origin"
      ].join(" ")
    );
    verifyReports.push({
      campaign,
      goals: summarizeGoals(goalRows)
    });
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        appliedOperations: operations.length,
        verifiedCampaigns: verifyReports
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
