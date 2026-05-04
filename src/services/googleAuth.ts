import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { getSessionSecret } from "./authSession.js";

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_OAUTH_COMPLETE_PATH = "/auth/google";
export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "invoiceGoogleOAuthState";

const DEFAULT_GOOGLE_STATE_TTL_MINUTES = Number.parseInt(
  process.env.GOOGLE_OAUTH_STATE_TTL_MINUTES ?? "10",
  10
);
const GOOGLE_STATE_KIND = "google_oauth_state";
const GOOGLE_OAUTH_SCOPES = ["openid", "email", "profile"];

type GoogleOAuthStatePayload = {
  kind: typeof GOOGLE_STATE_KIND;
  nonce: string;
  returnPath: string;
  exp: number;
};

export type GoogleAuthReadiness = {
  configured: boolean;
  available: boolean;
  warning?: string;
};

export type GoogleAuthIdentity = {
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  subject: string;
};

type GoogleAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type GoogleAuthClientLike = {
  generateAuthUrl(options: Record<string, unknown>): string;
  getToken(code: string): Promise<{ tokens?: { id_token?: string | null } }>;
  verifyIdToken(options: {
    idToken: string;
    audience: string | string[];
  }): Promise<{ getPayload(): TokenPayload | undefined }>;
};

type GoogleAuthReadinessInput = {
  clientId?: string;
  clientSecret?: string;
};

type GoogleAuthStartInput = {
  baseUrl: string;
  returnPath?: string;
};

type GoogleAuthCallbackInput = {
  baseUrl: string;
  code: string;
  stateToken: string;
  cookieValue: string;
};

let googleAuthClientFactoryForTests:
  | ((config: GoogleAuthClientConfig) => GoogleAuthClientLike)
  | null = null;

export function getGoogleAuthReadiness(input: GoogleAuthReadinessInput = {}): GoogleAuthReadiness {
  const clientId = readOptionalValue(input.clientId ?? process.env.GOOGLE_CLIENT_ID);
  const clientSecret = readOptionalValue(input.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET);
  const configured = Boolean(clientId && clientSecret);
  return {
    configured,
    available: configured,
    warning: configured
      ? undefined
      : "Google Sign-In requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before it can be used."
  };
}

export function buildGoogleAuthStart(input: GoogleAuthStartInput): {
  redirectUrl: string;
  cookieValue: string;
  expiresAt: string;
} {
  const redirectUri = buildGoogleRedirectUri(input.baseUrl);
  const client = createGoogleAuthClient({
    clientId: requireGoogleClientId(),
    clientSecret: requireGoogleClientSecret(),
    redirectUri
  });
  const state = createGoogleOAuthState(input.returnPath);
  const redirectUrl = client.generateAuthUrl({
    response_type: "code",
    access_type: "online",
    include_granted_scopes: true,
    prompt: "select_account",
    scope: GOOGLE_OAUTH_SCOPES,
    state: state.token
  });
  return {
    redirectUrl,
    cookieValue: state.cookieValue,
    expiresAt: state.expiresAt
  };
}

export async function completeGoogleAuthCallback(
  input: GoogleAuthCallbackInput
): Promise<{ identity: GoogleAuthIdentity; returnPath: string }> {
  const redirectUri = buildGoogleRedirectUri(input.baseUrl);
  const state = verifyGoogleOAuthState({
    token: input.stateToken,
    cookieValue: input.cookieValue
  });
  const client = createGoogleAuthClient({
    clientId: requireGoogleClientId(),
    clientSecret: requireGoogleClientSecret(),
    redirectUri
  });
  const tokenResponse = await client.getToken(input.code);
  const idToken = readOptionalValue(tokenResponse.tokens?.id_token ?? "");
  if (!idToken) {
    throw new Error("Google Sign-In did not return an ID token.");
  }
  const ticket = await client.verifyIdToken({
    idToken,
    audience: requireGoogleClientId()
  });
  const payload = ticket.getPayload();
  const identity = toGoogleAuthIdentity(payload);
  return {
    identity,
    returnPath: state.returnPath
  };
}

export function buildGoogleRedirectUri(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}${GOOGLE_OAUTH_CALLBACK_PATH}`;
}

export function buildGoogleAuthStateCookieHeader(input: {
  value?: string;
  expiresAt?: string;
  secure: boolean;
}): string {
  const maxAgeSeconds = input.value && input.expiresAt ? getMaxAgeSeconds(input.expiresAt) : 0;
  const parts = [
    `${GOOGLE_OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(input.value ?? "")}`,
    "Path=/api/auth/google",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, maxAgeSeconds)}`
  ];
  if (input.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readCookieValue(rawCookieHeader: string | undefined, name: string): string {
  if (!rawCookieHeader?.trim()) {
    return "";
  }
  const pairs = rawCookieHeader.split(";");
  for (const pair of pairs) {
    const [rawKey, ...rawValueParts] = pair.split("=");
    if (rawKey?.trim() !== name) {
      continue;
    }
    const joined = rawValueParts.join("=");
    try {
      return decodeURIComponent(joined.trim());
    } catch {
      return joined.trim();
    }
  }
  return "";
}

export function buildGoogleAuthSuccessUrl(input: {
  baseUrl: string;
  token: string;
  session: { userId: string; email: string; expiresAt: string };
  returnPath?: string;
}): string {
  const params = new URLSearchParams({
    token: input.token,
    userId: input.session.userId,
    email: input.session.email,
    expiresAt: input.session.expiresAt,
    next: sanitizeInternalReturnPath(input.returnPath)
  });
  return `${normalizeBaseUrl(input.baseUrl)}${GOOGLE_OAUTH_COMPLETE_PATH}#${params.toString()}`;
}

export function buildGoogleAuthErrorUrl(input: {
  baseUrl: string;
  error: string;
  returnPath?: string;
}): string {
  const params = new URLSearchParams({
    error: input.error,
    next: sanitizeInternalReturnPath(input.returnPath)
  });
  return `${normalizeBaseUrl(input.baseUrl)}${GOOGLE_OAUTH_COMPLETE_PATH}?${params.toString()}`;
}

export function sanitizeInternalReturnPath(value: string | undefined): string {
  const raw = readOptionalValue(value);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  try {
    const parsed = new URL(raw, "https://notebill.local");
    if (parsed.origin !== "https://notebill.local") {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function setGoogleAuthClientFactoryForTests(
  factory: ((config: GoogleAuthClientConfig) => GoogleAuthClientLike) | null
): void {
  googleAuthClientFactoryForTests = factory;
}

function createGoogleOAuthState(returnPath?: string): {
  token: string;
  cookieValue: string;
  expiresAt: string;
} {
  const ttlMinutes =
    Number.isFinite(DEFAULT_GOOGLE_STATE_TTL_MINUTES) && DEFAULT_GOOGLE_STATE_TTL_MINUTES > 0
      ? DEFAULT_GOOGLE_STATE_TTL_MINUTES
      : 10;
  const expiresAtMs = Date.now() + ttlMinutes * 60 * 1000;
  const cookieValue = randomBytes(18).toString("base64url");
  const payload: GoogleOAuthStatePayload = {
    kind: GOOGLE_STATE_KIND,
    nonce: cookieValue,
    returnPath: sanitizeInternalReturnPath(returnPath),
    exp: Math.floor(expiresAtMs / 1000)
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signEncodedPayload(encodedPayload);
  return {
    token: `${encodedPayload}.${signature}`,
    cookieValue,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

function verifyGoogleOAuthState(input: {
  token: string;
  cookieValue: string;
}): { returnPath: string } {
  const payload = readGoogleOAuthStatePayload(input.token);
  if (!payload) {
    throw new Error("Google Sign-In state is invalid or expired.");
  }
  if (!input.cookieValue || !safeEqual(payload.nonce, input.cookieValue)) {
    throw new Error("Google Sign-In state did not match this browser session.");
  }
  return {
    returnPath: payload.returnPath
  };
}

function readGoogleOAuthStatePayload(token: string): GoogleOAuthStatePayload | null {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }
  const expectedSignature = signEncodedPayload(encodedPayload);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as
      | GoogleOAuthStatePayload
      | null;
    if (!payload || payload.kind !== GOOGLE_STATE_KIND || !payload.nonce || !payload.exp) {
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return {
      ...payload,
      returnPath: sanitizeInternalReturnPath(payload.returnPath)
    };
  } catch {
    return null;
  }
}

function signEncodedPayload(encodedPayload: string): string {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

function createGoogleAuthClient(config: GoogleAuthClientConfig): GoogleAuthClientLike {
  if (googleAuthClientFactoryForTests) {
    return googleAuthClientFactoryForTests(config);
  }
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri
  }) as GoogleAuthClientLike;
}

function toGoogleAuthIdentity(payload: TokenPayload | undefined): GoogleAuthIdentity {
  const email = readOptionalValue(payload?.email);
  if (!email) {
    throw new Error("Google Sign-In did not return an email address.");
  }
  const subject = readOptionalValue(payload?.sub);
  if (!subject) {
    throw new Error("Google Sign-In did not return a stable account identifier.");
  }
  if (payload?.email_verified !== true) {
    throw new Error("Google Sign-In requires a verified Google email address.");
  }
  return {
    email: email.toLowerCase(),
    emailVerified: true,
    name: readOptionalValue(payload?.name) || null,
    picture: readOptionalValue(payload?.picture) || null,
    subject
  };
}

function requireGoogleClientId(): string {
  const value = readOptionalValue(process.env.GOOGLE_CLIENT_ID);
  if (!value) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }
  return value;
}

function requireGoogleClientSecret(): string {
  const value = readOptionalValue(process.env.GOOGLE_CLIENT_SECRET);
  if (!value) {
    throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function readOptionalValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getMaxAgeSeconds(expiresAt: string): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
