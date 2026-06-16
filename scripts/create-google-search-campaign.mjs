import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const API_VERSION = "v22";
const DEFAULT_BUDGET_MICROS = 10_000_000;

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

function parseMicros(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid micros value: ${value}`);
  }
  return Math.floor(parsed);
}

function getArgs() {
  return new Set(process.argv.slice(2).map((arg) => arg.trim()));
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
  const clientId = envValue("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = envValue("GOOGLE_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google OAuth credentials.");
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
  if (!accessToken) {
    throw new Error("Google OAuth token refresh returned no access token.");
  }
  return accessToken;
}

async function googleAdsRequest(customerId, accessToken, developerToken, loginCustomerId, method, pathname, body, extraQuery = {}) {
  const url = new URL(`https://googleads.googleapis.com/${API_VERSION}${pathname}`);
  for (const [key, value] of Object.entries(extraQuery)) {
    url.searchParams.set(key, String(value));
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
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

async function googleAdsStep(stepName, ...args) {
  try {
    return await googleAdsRequest(...args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stepName}: ${message}`);
  }
}

function toMicros(value) {
  return String(Math.round(value));
}

function tomorrowDate(daysAhead = 1) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function createCampaignPlan() {
  return [
    {
      key: "contractors",
      adGroupName: "NB | Contractors",
      finalUrl: "https://app.notebill.app/invoice-app-for-contractors",
      path1: "contractors",
      path2: "invoices",
      keywords: [
        { text: "invoice app for contractors", matchType: "EXACT" },
        { text: "contractor invoice app", matchType: "EXACT" },
        { text: "invoice maker for contractors", matchType: "PHRASE" },
        { text: "invoice app for contractors", matchType: "PHRASE" }
      ],
      headlines: [
        "Invoice App for Contractors",
        "Turn Notes Into Invoices",
        "Statements and Follow-Up",
        "Mobile Invoice App",
        "Monthly or Lifetime Pro",
        "Built for Repeat Work",
        "Cleaner Job Billing",
        "Fast Mobile Invoicing",
        "Simple Repeat Client Flow",
        "NoteBill for Contractors"
      ],
      descriptions: [
        "Turn rough job notes into clean invoices, statements, and follow-up faster.",
        "Built for service work, repeat clients, and a cleaner path to getting paid.",
        "Monthly Pro or lifetime. Keep the workflow simple and easy to reuse.",
        "Open the client workspace for statements, reminders, and recovery steps."
      ]
    },
    {
      key: "service-businesses",
      adGroupName: "NB | Service Businesses",
      finalUrl: "https://app.notebill.app/invoice-app-for-service-businesses",
      path1: "service",
      path2: "businesses",
      keywords: [
        { text: "invoice app for service business", matchType: "EXACT" },
        { text: "service invoice app", matchType: "EXACT" },
        { text: "invoice maker for service business", matchType: "PHRASE" },
        { text: "invoice app for service business", matchType: "PHRASE" }
      ],
      headlines: [
        "Invoice App for Service Pros",
        "Clean Invoices Faster",
        "Follow Up Without the Drag",
        "Repeat Client Memory",
        "Built for Small Teams",
        "Less Admin Drag",
        "Statements in One Place",
        "Mobile and Desktop Ready",
        "Simple Money Workflow",
        "NoteBill for Service Work"
      ],
      descriptions: [
        "Go from messy notes to a clean invoice, statement, and follow-up path.",
        "Built for small businesses that invoice often and want less admin drag.",
        "Keep statements and reminders near the open balance so nothing gets lost.",
        "Monthly Pro or lifetime. Pick the option that fits your workflow."
      ]
    },
    {
      key: "mobile",
      adGroupName: "NB | Mobile",
      finalUrl: "https://app.notebill.app/invoice-app-on-phone",
      path1: "mobile",
      path2: "invoice-app",
      keywords: [
        { text: "mobile invoice app", matchType: "EXACT" },
        { text: "invoice app on phone", matchType: "EXACT" },
        { text: "mobile invoice maker", matchType: "PHRASE" },
        { text: "invoice app mobile", matchType: "PHRASE" }
      ],
      headlines: [
        "Mobile Invoice App",
        "Invoice From Your Phone",
        "Fast Note to Invoice Flow",
        "Statements on Mobile",
        "Review Before Send",
        "Works on Desktop Too",
        "No Crowded Screens",
        "Calm Mobile Workflow",
        "Built for Field Work",
        "NoteBill Mobile"
      ],
      descriptions: [
        "Keep invoicing easy on a phone: notes, review, statement follow-up, next step.",
        "Built to stay readable on small screens without feeling cramped.",
        "Turn rough job notes into clean invoices faster while you are on the move.",
        "Monthly Pro or lifetime. Choose the plan that fits your workflow."
      ]
    },
    {
      key: "statements",
      adGroupName: "NB | Statements",
      finalUrl: "https://app.notebill.app/client-statements-and-follow-up",
      path1: "statements",
      path2: "follow-up",
      keywords: [
        { text: "client statements", matchType: "EXACT" },
        { text: "invoice follow up", matchType: "EXACT" },
        { text: "invoice reminder app", matchType: "PHRASE" },
        { text: "client statement follow up", matchType: "PHRASE" }
      ],
      headlines: [
        "Statements and Follow-Up",
        "Follow Up on Open Balances",
        "Reminder Workflow Built In",
        "Statements in One Place",
        "Collections Made Calmer",
        "Print, Email, or Download",
        "Track What Was Sent",
        "Open Balance Recovery",
        "Less Scattered Follow-Up",
        "NoteBill Collections"
      ],
      descriptions: [
        "Keep client statements, reminders, and collections follow-up in one clean path.",
        "The workspace keeps the next money-moving step visible.",
        "Open balances, partial payments, and recovery actions stay easy to find.",
        "Monthly Pro or lifetime. Keep the follow-up loop simple."
      ]
    }
  ];
}

function buildHeadlines(headlines) {
  return headlines.slice(0, 15).map((text) => ({ text }));
}

function buildDescriptions(descriptions) {
  return descriptions.slice(0, 4).map((text) => ({ text }));
}

async function main() {
  const args = getArgs();
  const previewOnly = args.has("--preview") || args.has("--validate-only");
  const budgetMicros = parseMicros(envValue("GOOGLE_ADS_DAILY_BUDGET_MICROS"), DEFAULT_BUDGET_MICROS);
  const developerToken = envValue("GOOGLE_ADS_DEVELOPER_TOKEN");
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  if (!developerToken || !customerId) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID.");
  }

  const accessToken = await getGoogleOAuthAccessToken();
  const now = new Date();
  const campaignSuffix = `${now.toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const campaignBudgetName = `NB | Search Budget | ${campaignSuffix}`;
  const campaignName = `NB | Search | High Intent | ${campaignSuffix}`;
  const plan = createCampaignPlan();
  if (previewOnly) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          previewOnly: true,
          campaign: {
            customerId,
            loginCustomerId: loginCustomerId || null,
            campaignBudgetName,
            campaignName,
            budgetMicros,
            adGroupCount: plan.length,
            negativeKeywordsCount: 16
          },
          adGroups: plan.map((group) => ({
            key: group.key,
            adGroupName: group.adGroupName,
            finalUrl: group.finalUrl,
            keywordCount: group.keywords.length
          }))
        },
        null,
        2
      )
    );
    return;
  }

  const budgetResult = await googleAdsStep(
    "budget-create",
    customerId,
    accessToken,
    developerToken,
    loginCustomerId,
    "POST",
    `/customers/${encodeURIComponent(customerId)}/campaignBudgets:mutate`,
    {
      operations: [
        {
          create: {
            name: campaignBudgetName,
            deliveryMethod: "STANDARD",
            amountMicros: toMicros(budgetMicros)
          }
      }
    ]
  },
  );

  const budgetResourceName = budgetResult.results?.[0]?.resourceName;
  if (!budgetResourceName) {
    throw new Error("Campaign budget creation did not return a resource name.");
  }

  const campaignResult = await googleAdsStep(
    "campaign-create",
    customerId,
    accessToken,
    developerToken,
    loginCustomerId,
    "POST",
    `/customers/${encodeURIComponent(customerId)}/campaigns:mutate`,
    {
      operations: [
        {
          create: {
            name: campaignName,
            advertisingChannelType: "SEARCH",
            status: "PAUSED",
            manualCpc: {},
            campaignBudget: budgetResourceName,
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetPartnerSearchNetwork: false,
              targetContentNetwork: false
            },
            startDate: tomorrowDate(1),
            endDate: tomorrowDate(31),
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"
          }
      }
    ]
  },
  );

  const campaignResourceName = campaignResult.results?.[0]?.resourceName;
  if (!campaignResourceName) {
    throw new Error("Campaign creation did not return a resource name.");
  }

  const negativeKeywords = [
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
    "example"
  ];

  const negativeCriterionResult = await googleAdsStep(
    "campaign-negative-keywords",
    customerId,
    accessToken,
    developerToken,
    loginCustomerId,
    "POST",
    `/customers/${encodeURIComponent(customerId)}/campaignCriteria:mutate`,
    {
      operations: negativeKeywords.map((text) => ({
        create: {
          campaign: campaignResourceName,
          negative: true,
          status: "ENABLED",
          keyword: {
            text,
            matchType: "PHRASE"
          }
        }
      }))
    },
  );

  const createdAdGroups = [];

  for (const group of plan) {
    const adGroupResult = await googleAdsStep(
      `adgroup-create:${group.key}`,
      customerId,
      accessToken,
      developerToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/adGroups:mutate`,
      {
        operations: [
          {
            create: {
              campaign: campaignResourceName,
              name: group.adGroupName,
              status: "ENABLED",
              type: "SEARCH_STANDARD"
            }
          }
        ]
      },
    );

    const adGroupResourceName = adGroupResult.results?.[0]?.resourceName;
    if (!adGroupResourceName) {
      throw new Error(`Ad group creation did not return a resource name for ${group.adGroupName}.`);
    }

    const keywordOperations = group.keywords.map((keyword) => ({
      create: {
        adGroup: adGroupResourceName,
        status: "ENABLED",
        cpcBidMicros: toMicros(250000),
        keyword
      }
    }));

    await googleAdsStep(
      `adgroup-keywords:${group.key}`,
      customerId,
      accessToken,
      developerToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/adGroupCriteria:mutate`,
      {
        operations: keywordOperations
      },
    );

    const rsaResult = await googleAdsStep(
      `adgroup-rsa:${group.key}`,
      customerId,
      accessToken,
      developerToken,
      loginCustomerId,
      "POST",
      `/customers/${encodeURIComponent(customerId)}/adGroupAds:mutate`,
      {
        operations: [
          {
            create: {
              adGroup: adGroupResourceName,
              status: "ENABLED",
              ad: {
                finalUrls: [group.finalUrl],
                responsiveSearchAd: {
                  headlines: buildHeadlines(group.headlines),
                  descriptions: buildDescriptions(group.descriptions),
                  path1: group.path1,
                  path2: group.path2
                }
              }
            }
          }
        ]
      },
    );

    createdAdGroups.push({
      key: group.key,
      adGroupName: group.adGroupName,
      adGroupResourceName,
      adResourceName: rsaResult.results?.[0]?.resourceName || null,
      finalUrl: group.finalUrl
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        previewOnly: false,
        campaign: {
          customerId,
          loginCustomerId: loginCustomerId || null,
          campaignBudgetName,
          campaignName,
          campaignResourceName,
          budgetMicros,
          budgetResourceName,
          negativeKeywordsCount: negativeKeywords.length,
          adGroupCount: createdAdGroups.length
        },
        adGroups: createdAdGroups,
        negativeCriterionCount: negativeCriterionResult.results?.length || 0
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
