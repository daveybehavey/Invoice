type GoogleAdsCampaignWatchTone = "success" | "warning" | "info" | "soft";

type GoogleAdsCampaignWatchSummary = {
  tone: GoogleAdsCampaignWatchTone;
  label: string;
  detail: string;
};

export type GoogleAdsCampaignWatchSnapshot = {
  configured: boolean;
  warning?: string | null;
  customerId: string | null;
  loginCustomerId: string | null;
  campaignPrefix: string;
  campaign: {
    id: string;
    name: string;
    status: string;
    primaryStatus: string;
    primaryStatusReasons: string[];
    servingStatus: string;
    budgetMicros: string;
    impressions: string;
    clicks: string;
    costMicros: string;
    conversions: string;
  } | null;
  adGroups: Array<{
    id: string;
    name: string;
    status: string;
    primaryStatus: string;
    primaryStatusReasons: string[];
  }>;
  ads: Array<{
    id: string;
    type: string;
    status: string;
    primaryStatus: string;
    primaryStatusReasons: string[];
    approvalStatus: string;
    reviewStatus: string;
  }>;
  keywords: Array<{
    criterionId: string;
    text: string;
    matchType: string;
    status: string;
    primaryStatus: string;
    primaryStatusReasons: string[];
  }>;
  summary: GoogleAdsCampaignWatchSummary;
};

const API_VERSION = "v22";
const CAMPAIGN_PREFIX = "NB | Search | High Intent | ";

function envValue(name: string): string {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sanitizeCustomerId(value: string): string {
  return String(value || "").replace(/-/g, "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<{
  ok: boolean;
  status: number;
  payload: any;
}> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload: payload && typeof payload === "object" ? payload : {}
  };
}

async function getGoogleOAuthAccessToken(): Promise<string> {
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
      String(
        tokenResponse.payload?.error_description ||
          tokenResponse.payload?.error ||
          `Unable to refresh Google Ads OAuth token (${tokenResponse.status}).`
      )
    );
  }
  const accessToken = String(tokenResponse.payload?.access_token ?? "").trim();
  if (!accessToken) {
    throw new Error("Unable to obtain Google Ads access token.");
  }
  return accessToken;
}

async function googleAdsSearch(
  customerId: string,
  accessToken: string,
  loginCustomerId: string,
  query: string
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json"
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetchJson(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${encodeURIComponent(customerId)}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    }
  );
  if (!response.ok) {
    const message = String(response.payload?.error?.message || `Google Ads search failed (${response.status}).`);
    const details = response.payload?.error?.details ? JSON.stringify(response.payload.error.details) : "";
    throw new Error(details ? `${message} :: ${details}` : message);
  }
  return response.payload;
}

function flattenResults(payload: any): Array<any> {
  return Array.isArray(payload?.results) ? (payload.results as Array<any>) : [];
}

function buildSummary(input: {
  campaign: GoogleAdsCampaignWatchSnapshot["campaign"];
  ads: GoogleAdsCampaignWatchSnapshot["ads"];
}): GoogleAdsCampaignWatchSummary {
  const campaign = input.campaign;
  if (!campaign) {
    return {
      tone: "warning",
      label: "No campaign found",
      detail: "The expected NoteBill Search campaign is missing or the name prefix changed."
    };
  }

  const impressions = toNumber(campaign.impressions);
  const clicks = toNumber(campaign.clicks);
  const costMicros = toNumber(campaign.costMicros);
  const conversions = toNumber(campaign.conversions);
  const reasons = Array.isArray(campaign.primaryStatusReasons) ? campaign.primaryStatusReasons : [];
  const hasPendingReview = reasons.includes("CAMPAIGN_PENDING") || reasons.includes("MOST_ADS_UNDER_REVIEW");

  if (campaign.status === "PAUSED") {
    return {
      tone: "warning",
      label: "Campaign paused",
      detail: "The test campaign exists but is paused, so it will not spend until it is enabled."
    };
  }

  if (hasPendingReview) {
    return {
      tone: "warning",
      label: "Waiting for review",
      detail: "The campaign is enabled but still pending Google review, so nothing will spend yet."
    };
  }

  if (conversions > 0) {
    return {
      tone: "info",
      label: "Ads actions reported",
      detail: `Google Ads reports ${conversions} action${conversions === 1 ? "" : "s"}. Treat these as attribution signals, not verified purchases.`
    };
  }

  if (clicks > 0) {
    return {
      tone: "info",
      label: "Traffic arriving",
      detail: `${clicks} click${clicks === 1 ? "" : "s"} have landed, so watch the landing page and conversion path closely.`
    };
  }

  if (impressions > 0) {
    return {
      tone: "info",
      label: "Visible but quiet",
      detail: `The campaign has ${impressions} impression${impressions === 1 ? "" : "s"} and is still waiting on clicks.`
    };
  }

  if (campaign.primaryStatus === "ELIGIBLE" || campaign.servingStatus === "SERVING") {
    return {
      tone: "info",
      label: "Live and eligible",
      detail: "The campaign is eligible to serve, but it has not started spending yet."
    };
  }

  return {
    tone: "soft",
    label: "Monitoring",
    detail: "The campaign is enabled, and Google Ads has not surfaced a stronger signal yet."
  };
}

export async function getGoogleAdsCampaignWatchSnapshot(): Promise<GoogleAdsCampaignWatchSnapshot> {
  const developerToken = envValue("GOOGLE_ADS_DEVELOPER_TOKEN");
  const clientId = envValue("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = envValue("GOOGLE_ADS_REFRESH_TOKEN");
  const customerId = sanitizeCustomerId(envValue("GOOGLE_ADS_CUSTOMER_ID"));
  const loginCustomerId = sanitizeCustomerId(envValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));

  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return {
      configured: false,
      warning: "Google Ads campaign watch requires the Ads OAuth credentials and customer ID.",
      customerId: customerId || null,
      loginCustomerId: loginCustomerId || null,
      campaignPrefix: CAMPAIGN_PREFIX,
      campaign: null,
      adGroups: [],
      ads: [],
      keywords: [],
      summary: {
        tone: "warning",
        label: "Not configured",
        detail: "Add the Ads OAuth credentials and customer ID to enable live campaign watch."
      }
    };
  }

  const accessToken = await getGoogleOAuthAccessToken();
  const campaignPayload = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.serving_status, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.name LIKE '${CAMPAIGN_PREFIX}%' AND segments.date DURING LAST_7_DAYS ORDER BY campaign.id DESC LIMIT 1`
  );
  const campaignRow = flattenResults(campaignPayload)[0] || null;

  if (!campaignRow?.campaign) {
    return {
      configured: true,
      customerId,
      loginCustomerId: loginCustomerId || null,
      campaignPrefix: CAMPAIGN_PREFIX,
      campaign: null,
      adGroups: [],
      ads: [],
      keywords: [],
      summary: {
        tone: "warning",
        label: "No NoteBill campaign found",
        detail: `The live Google Ads account does not currently have a campaign starting with "${CAMPAIGN_PREFIX}".`
      }
    };
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
    `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.primary_status, ad_group_ad.primary_status_reasons, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status FROM ad_group_ad WHERE campaign.id = ${campaignId} ORDER BY ad_group_ad.ad.id`
  );
  const keywordPayload = await googleAdsSearch(
    customerId,
    accessToken,
    loginCustomerId,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = KEYWORD ORDER BY ad_group_criterion.criterion_id`
  );

  const campaign = {
    id: String(campaignRow.campaign?.id || ""),
    name: String(campaignRow.campaign?.name || ""),
    status: String(campaignRow.campaign?.status || ""),
    primaryStatus: String(campaignRow.campaign?.primaryStatus || ""),
    primaryStatusReasons: Array.isArray(campaignRow.campaign?.primaryStatusReasons)
      ? (campaignRow.campaign?.primaryStatusReasons as string[])
      : [],
    servingStatus: String(campaignRow.campaign?.servingStatus || ""),
    budgetMicros: String(campaignRow.campaignBudget?.amountMicros || "0"),
    impressions: String(campaignRow.metrics?.impressions || "0"),
    clicks: String(campaignRow.metrics?.clicks || "0"),
    costMicros: String(campaignRow.metrics?.costMicros || "0"),
    conversions: String(campaignRow.metrics?.conversions || "0")
  };

  const adGroups = flattenResults(adGroupPayload).map((row) => ({
    id: String(row.adGroup?.id || ""),
    name: String(row.adGroup?.name || ""),
    status: String(row.adGroup?.status || ""),
    primaryStatus: String(row.adGroup?.primaryStatus || ""),
    primaryStatusReasons: Array.isArray(row.adGroup?.primaryStatusReasons)
      ? (row.adGroup?.primaryStatusReasons as string[])
      : []
  }));

  const ads = flattenResults(adPayload).map((row) => ({
    id: String(row.adGroupAd?.ad?.id || ""),
    type: String(row.adGroupAd?.ad?.type || ""),
    status: String(row.adGroupAd?.status || ""),
    primaryStatus: String(row.adGroupAd?.primaryStatus || ""),
    primaryStatusReasons: Array.isArray(row.adGroupAd?.primaryStatusReasons)
      ? (row.adGroupAd?.primaryStatusReasons as string[])
      : [],
    approvalStatus: String(row.adGroupAd?.policySummary?.approvalStatus || ""),
    reviewStatus: String(row.adGroupAd?.policySummary?.reviewStatus || "")
  }));

  const keywords = flattenResults(keywordPayload).map((row) => ({
    criterionId: String(row.adGroupCriterion?.criterionId || ""),
    text: String(row.adGroupCriterion?.keyword?.text || ""),
    matchType: String(row.adGroupCriterion?.keyword?.matchType || ""),
    status: String(row.adGroupCriterion?.status || ""),
    primaryStatus: String(row.adGroupCriterion?.primaryStatus || ""),
    primaryStatusReasons: Array.isArray(row.adGroupCriterion?.primaryStatusReasons)
      ? (row.adGroupCriterion?.primaryStatusReasons as string[])
      : []
  }));

  return {
    configured: true,
    customerId,
    loginCustomerId: loginCustomerId || null,
    campaignPrefix: CAMPAIGN_PREFIX,
    campaign,
    adGroups,
    ads,
    keywords,
    summary: buildSummary({ campaign, ads })
  };
}
