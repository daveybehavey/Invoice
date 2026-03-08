import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export type InvoiceAuthSession = {
  userId: string;
  email: string;
  expiresAt: string;
};

type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

const AUTH_HEADER_PREFIX = "Bearer ";
const DEFAULT_SESSION_SECRET = "local-invoice-session-secret";
const defaultTtlHours = Number.parseInt(process.env.INVOICE_SESSION_TTL_HOURS ?? "720", 10);
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
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signEncodedPayload(encodedPayload);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
  } catch {
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

function signPayload(payload: SessionPayload): string {
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
