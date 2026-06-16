import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { JWT } from "google-auth-library";

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

async function getServiceAccountAccessToken(rawJson, scopes) {
  const parsed = JSON.parse(rawJson);
  const authClient = new JWT({
    email: parsed.client_email,
    key: parsed.private_key,
    scopes
  });
  const accessToken = await authClient.getAccessToken();
  return typeof accessToken === "string" ? accessToken : accessToken?.token ?? "";
}

async function checkGa4() {
  const propertyId = envValue("GOOGLE_ANALYTICS_PROPERTY_ID");
  if (!propertyId) {
    return {
      ok: false,
      skipped: true,
      detail: "Missing GOOGLE_ANALYTICS_PROPERTY_ID."
    };
  }

  const accessToken = await getGoogleOAuthAccessToken({
    scopeHint: "analytics.readonly",
    requiredScope: "https://www.googleapis.com/auth/analytics.readonly"
  });
  if (!accessToken) {
    throw new Error("Unable to obtain GA4 access token.");
  }

  const report = await fetchJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        limit: 1
      })
    }
  );

  if (!report.ok) {
    return {
      ok: false,
      detail: report.payload?.error?.message || `GA4 API failed with status ${report.status}.`,
      status: report.status
    };
  }

  return {
    ok: true,
    detail: `GA4 runReport succeeded for property ${propertyId}.`,
    sampleRowCount: Array.isArray(report.payload?.rows) ? report.payload.rows.length : 0,
    propertyId
  };
}

async function getAdsAccessToken() {
  const clientId = envValue("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = envValue("GOOGLE_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google Ads OAuth credentials.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
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
        `Unable to refresh Google Ads OAuth token (${tokenResponse.status}).`
    );
  }
  return tokenResponse.payload?.access_token || "";
}

async function getGoogleOAuthAccessToken(input = {}) {
  const clientId = envValue("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = envValue("GOOGLE_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Missing Google OAuth credentials${input.scopeHint ? ` for ${input.scopeHint}` : ""}.`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
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
  if (!input.requiredScope || !accessToken) {
    return accessToken;
  }
  const tokenInfo = await fetchTokenInfo(accessToken);
  const scopes = String(tokenInfo.payload?.scope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!scopes.includes(input.requiredScope)) {
    throw new Error(
      `Google OAuth token is missing required scope ${input.requiredScope}. Current scopes: ${scopes.join(", ") || "none"}. Regenerate GOOGLE_ADS_REFRESH_TOKEN with the missing scope included.`
    );
  }
  return accessToken;
}

async function checkGoogleAds() {
  const developerToken = envValue("GOOGLE_ADS_DEVELOPER_TOKEN");
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!developerToken || !customerId) {
    return {
      ok: false,
      skipped: true,
      detail: "Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID."
    };
  }

  const accessToken = await getGoogleOAuthAccessToken({
    scopeHint: "adwords",
    requiredScope: "https://www.googleapis.com/auth/adwords"
  });
  if (!accessToken) {
    throw new Error("Unable to obtain Google Ads access token.");
  }

  const commonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json"
  };

  const accessibleCustomers = await fetchJson("https://googleads.googleapis.com/v22/customers:listAccessibleCustomers", {
    method: "GET",
    headers: commonHeaders
  });

  if (!accessibleCustomers.ok) {
    return {
      ok: false,
      detail:
        accessibleCustomers.payload?.error?.message ||
        `Google Ads accessible customer lookup failed (${accessibleCustomers.status}).`,
      status: accessibleCustomers.status
    };
  }

  const queryHeaders = {
    ...commonHeaders
  };
  if (loginCustomerId) {
    queryHeaders["login-customer-id"] = loginCustomerId;
  }

  const customerQuery = await fetchJson(
    `https://googleads.googleapis.com/v22/customers/${encodeURIComponent(customerId)}/googleAds:searchStream`,
    {
      method: "POST",
      headers: queryHeaders,
      body: JSON.stringify({
        query:
          "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1"
      })
    }
  );

  if (!customerQuery.ok) {
    return {
      ok: false,
      detail:
        customerQuery.payload?.error?.message ||
        `Google Ads customer query failed (${customerQuery.status}).`,
      status: customerQuery.status,
      accessibleCustomers: accessibleCustomers.payload?.resourceNames ?? []
    };
  }

  return {
    ok: true,
    detail: `Google Ads auth and customer query succeeded for customer ${customerId}.`,
    accessibleCustomerCount: Array.isArray(accessibleCustomers.payload?.resourceNames)
      ? accessibleCustomers.payload.resourceNames.length
      : 0,
    customerId,
    loginCustomerId: loginCustomerId || null
  };
}

async function checkGooglePlay() {
  const packageName = envValue("GOOGLE_PLAY_PACKAGE_NAME");
  const rawServiceAccount = envValue("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!packageName || !rawServiceAccount) {
    return {
      ok: false,
      skipped: true,
      detail: "Missing GOOGLE_PLAY_PACKAGE_NAME or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON."
    };
  }

  const accessToken = await getServiceAccountAccessToken(rawServiceAccount, [
    "https://www.googleapis.com/auth/androidpublisher"
  ]);
  if (!accessToken) {
    throw new Error("Unable to obtain Google Play access token.");
  }

  // Purchase verification still requires a real purchase token, so this smoke
  // test proves auth readiness rather than a specific entitlement lookup.
  return {
    ok: true,
    detail: `Google Play service account auth succeeded for ${packageName}.`,
    packageName
  };
}

async function main() {
  const results = {};
  try {
    results.ga4 = await checkGa4();
  } catch (error) {
    results.ga4 = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  try {
    results.googleAds = await checkGoogleAds();
  } catch (error) {
    results.googleAds = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  try {
    results.googlePlay = await checkGooglePlay();
  } catch (error) {
    results.googlePlay = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  const ok = Object.values(results).every((result) => result?.ok);
  console.log(JSON.stringify({ ok, results }, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
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
