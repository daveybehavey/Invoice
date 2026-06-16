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

function uniqueByResourceName(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const resourceName = String(row?.conversionAction?.resourceName || "");
    if (!resourceName || seen.has(resourceName)) {
      continue;
    }
    seen.add(resourceName);
    deduped.push(row);
  }
  return deduped;
}

const LOW_SIGNAL_NAME_SNIPPETS = [
  "session_start",
  "close_convert_lead",
  "qualify_lead",
  "app_store_subscription_convert",
  "app_store_subscription_renew",
  "first open",
  "first_open",
  "checkout_started",
  "account_signed_in",
  "login",
  "billing_plan_viewed",
  "billing_plan_selected"
];

function shouldDemoteConversionAction(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return LOW_SIGNAL_NAME_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

async function main() {
  const previewOnly = process.argv.slice(2).includes("--preview");
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!envValue("GOOGLE_ADS_DEVELOPER_TOKEN") || !customerId) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID.");
  }

  const accessToken = await getGoogleOAuthAccessToken();
  const conversionRows = uniqueByResourceName(
    await googleAdsSearch(
      customerId,
      accessToken,
      loginCustomerId,
      `SELECT conversion_action.resource_name, conversion_action.name, conversion_action.type, conversion_action.status, conversion_action.origin, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.name LIKE 'notebill-tracking%' ORDER BY conversion_action.id`
    )
  );

  const actionsToDemote = conversionRows.filter(
    (row) =>
      Boolean(row.conversionAction?.primaryForGoal) &&
      shouldDemoteConversionAction(String(row.conversionAction?.name || ""))
  );

  const plan = {
    previewOnly,
    customerId,
    loginCustomerId: loginCustomerId || null,
    actionsToDemote: actionsToDemote.map((row) => ({
      resourceName: String(row.conversionAction?.resourceName || ""),
      name: String(row.conversionAction?.name || ""),
      type: String(row.conversionAction?.type || ""),
      origin: String(row.conversionAction?.origin || "")
    })),
    currentActions: conversionRows.map((row) => ({
      resourceName: String(row.conversionAction?.resourceName || ""),
      name: String(row.conversionAction?.name || ""),
      type: String(row.conversionAction?.type || ""),
      origin: String(row.conversionAction?.origin || ""),
      status: String(row.conversionAction?.status || ""),
      primaryForGoal: Boolean(row.conversionAction?.primaryForGoal)
    }))
  };

  if (previewOnly) {
    console.log(JSON.stringify({ ok: true, plan }, null, 2));
    return;
  }

  if (actionsToDemote.length > 0) {
    await googleAdsRequest(
      customerId,
      accessToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/conversionActions:mutate`,
      {
        operations: actionsToDemote.map((row) => ({
          update: {
            resourceName: String(row.conversionAction?.resourceName || ""),
            primaryForGoal: false
          },
          updateMask: "primaryForGoal"
        }))
      }
    );
  }

  const verifyRows = uniqueByResourceName(
    await googleAdsSearch(
      customerId,
      accessToken,
      loginCustomerId,
      `SELECT conversion_action.resource_name, conversion_action.name, conversion_action.type, conversion_action.status, conversion_action.origin, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.name LIKE 'notebill-tracking%' ORDER BY conversion_action.id`
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        demotedActions: actionsToDemote.length,
        currentActions: verifyRows.map((row) => ({
          resourceName: String(row.conversionAction?.resourceName || ""),
          name: String(row.conversionAction?.name || ""),
          type: String(row.conversionAction?.type || ""),
          origin: String(row.conversionAction?.origin || ""),
          status: String(row.conversionAction?.status || ""),
          primaryForGoal: Boolean(row.conversionAction?.primaryForGoal)
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
