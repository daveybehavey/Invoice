import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export type InvoiceAuthSession = {
  userId: string;
  email: string;
  expiresAt: string;
};

type SessionPayload = {
  kind: "session";
  userId: string;
  email: string;
  exp: number;
};

type LegacySessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

type EmailLinkPayload = {
  kind: "email_link";
  // SEC-03 (S54-4): signed format version. Only version 2 links are
  // issued and accepted; version 2 is the single-use-redemption format.
  // Links minted before single-use enforcement carry no version and are
  // rejected, so no pre-enforcement link can bypass nonce consumption.
  v: 2;
  email: string;
  nonce: string;
  exp: number;
};

export const EMAIL_SIGN_IN_LINK_FORMAT_VERSION = 2;
const EMAIL_LINK_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

const AUTH_HEADER_PREFIX = "Bearer ";
const DEFAULT_SESSION_SECRET = "local-invoice-session-secret";
const defaultTtlHours = Number.parseInt(process.env.INVOICE_SESSION_TTL_HOURS ?? "720", 10);
const defaultEmailLinkTtlMinutes = Number.parseInt(process.env.INVOICE_EMAIL_LINK_TTL_MINUTES ?? "15", 10);
const INSECURE_SESSION_SECRETS = new Set([
  "",
  DEFAULT_SESSION_SECRET,
  "change_me",
  "local-default",
  "replace-me"
]);

export function createAuthSessionForEmail(rawEmail: string): { token: string; session: InvoiceAuthSession } {
  const normalizedEmail = normalizeEmail(rawEmail);
  const userId = createStableUserId(normalizedEmail);
  const ttlHours = Number.isFinite(defaultTtlHours) && defaultTtlHours > 0 ? defaultTtlHours : 720;
  const expiresAtMs = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload: SessionPayload = {
    kind: "session",
    userId,
    email: normalizedEmail,
    exp: Math.floor(expiresAtMs / 1000)
  };
  const token = signPayload(payload);
  return {
    token,
    session: {
      userId,
      email: normalizedEmail,
      expiresAt: new Date(expiresAtMs).toISOString()
    }
  };
}

export function createEmailSignInToken(
  rawEmail: string
): {
  token: string;
  email: string;
  expiresAt: string;
} {
  const normalizedEmail = normalizeEmail(rawEmail);
  const ttlMinutes =
    Number.isFinite(defaultEmailLinkTtlMinutes) && defaultEmailLinkTtlMinutes > 0
      ? defaultEmailLinkTtlMinutes
      : 15;
  const expiresAtMs = Date.now() + ttlMinutes * 60 * 1000;
  const payload: EmailLinkPayload = {
    kind: "email_link",
    v: EMAIL_SIGN_IN_LINK_FORMAT_VERSION,
    email: normalizedEmail,
    nonce: randomBytes(18).toString("base64url"),
    exp: Math.floor(expiresAtMs / 1000)
  };
  return {
    token: signPayload(payload),
    email: normalizedEmail,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export function getAuthSessionFromRequest(req: Request): InvoiceAuthSession | null {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export function getAuthTokenFromRequest(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith(AUTH_HEADER_PREFIX)) {
    const token = authorization.slice(AUTH_HEADER_PREFIX.length).trim();
    if (token) {
      return token;
    }
  }

  const fromCustomHeader = req.headers["x-invoice-session"];
  if (typeof fromCustomHeader === "string" && fromCustomHeader.trim()) {
    return fromCustomHeader.trim();
  }
  if (Array.isArray(fromCustomHeader) && fromCustomHeader[0]?.trim()) {
    return fromCustomHeader[0].trim();
  }
  return null;
}

export function verifySessionToken(token: string): InvoiceAuthSession | null {
  const payload = readSignedPayload(token);
  if (!payload) {
    return null;
  }

  if ("kind" in payload && payload.kind !== "session") {
    return null;
  }

  if (!payload?.userId || !payload?.email || !payload?.exp) {
    return null;
  }

  if (payload.exp * 1000 <= Date.now()) {
    return null;
  }

  const normalizedEmail = normalizeEmail(payload.email);
  const expectedUserId = createStableUserId(normalizedEmail);
  if (!safeEqual(expectedUserId, payload.userId)) {
    return null;
  }

  return {
    userId: payload.userId,
    email: normalizedEmail,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

export type InspectedEmailSignInToken = {
  email: string;
  nonce: string;
  expiresAt: string;
  expiresAtEpochSeconds: number;
};

/**
 * Cryptographic validation of an email sign-in token, separated from
 * redemption (SEC-03): checks the signature, purpose, signed format
 * version, field types, nonce format, and expiry, and returns the
 * verified nonce internally so the caller can consume it atomically
 * before any session is created. Validation alone never authorizes a
 * session — redemption is `consumeEmailSignInNonce` in
 * emailSignInRedemptionStore.ts.
 */
export function inspectEmailSignInToken(token: string): InspectedEmailSignInToken | null {
  const payload = readSignedPayload(token);
  if (!payload || !("kind" in payload) || payload.kind !== "email_link") {
    return null;
  }
  if (payload.v !== EMAIL_SIGN_IN_LINK_FORMAT_VERSION) {
    return null;
  }
  if (typeof payload.email !== "string" || typeof payload.nonce !== "string") {
    return null;
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }
  if (!EMAIL_LINK_NONCE_PATTERN.test(payload.nonce)) {
    return null;
  }
  if (payload.exp * 1000 <= Date.now()) {
    return null;
  }
  const normalizedEmail = normalizeEmail(payload.email);
  if (!normalizedEmail) {
    return null;
  }
  return {
    email: normalizedEmail,
    nonce: payload.nonce,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    expiresAtEpochSeconds: payload.exp
  };
}

export function verifyEmailSignInToken(token: string): {
  email: string;
  expiresAt: string;
} | null {
  const inspected = inspectEmailSignInToken(token);
  if (!inspected) {
    return null;
  }
  return {
    email: inspected.email,
    expiresAt: inspected.expiresAt
  };
}

function signPayload(payload: SessionPayload | EmailLinkPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signEncodedPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function signEncodedPayload(encodedPayload: string): string {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function isInvoiceSessionSecretConfigured(value: string | undefined = process.env.INVOICE_SESSION_SECRET): boolean {
  const fromEnv = value?.trim();
  if (!fromEnv) {
    return false;
  }
  return !INSECURE_SESSION_SECRETS.has(fromEnv.toLowerCase());
}

export function getSessionSecret(): string {
  const fromEnv = process.env.INVOICE_SESSION_SECRET?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_SESSION_SECRET;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function readSignedPayload(token: string): SessionPayload | LegacySessionPayload | EmailLinkPayload | null {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signEncodedPayload(encodedPayload);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as
      | SessionPayload
      | LegacySessionPayload
      | EmailLinkPayload;
  } catch {
    return null;
  }
}

function createStableUserId(normalizedEmail: string): string {
  const digest = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 24);
  return `usr_${digest}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
