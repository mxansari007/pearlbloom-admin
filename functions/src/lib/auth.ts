// functions/src/lib/auth.ts
//
// Shared authorization for the image (and other privileged) functions.
//
// Two layers:
//   1. Authentication — the caller must present a verified identity. This is
//      the firm part and closes the "anyone can upload/delete" hole.
//   2. Admin gate — the principal must be an admin: a custom `admin:true`
//      claim, or an email in the ADMIN_EMAILS allowlist. Until the custom
//      claim is provisioned (Admin #1), an EMPTY allowlist falls back to
//      "any authenticated principal" so the admin app keeps working — the
//      unauthenticated hole stays closed either way.
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import type { Request, Response } from "express";

function adminAllowlist(): string[] {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type Claims = { admin?: unknown; email?: unknown } & Record<string, unknown>;

/**
 * Whether a verified principal counts as an admin. Callers MUST already be
 * authenticated before this is consulted.
 */
export function isAdminClaims(claims: Claims | null | undefined): boolean {
  if (!claims) return false;
  if (claims.admin === true) return true;

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  const allow = adminAllowlist();
  if (email && allow.includes(email)) return true;

  // No admin signal configured yet → don't lock the admin app out.
  if (allow.length === 0) {
    logger.warn(
      "isAdminClaims: no admin claim and ADMIN_EMAILS is unset; allowing authenticated principal. " +
        "Set ADMIN_EMAILS (or provision the custom admin claim) to enforce admin-only access."
    );
    return true;
  }
  return false;
}

/** Guard for onCall functions. Throws HttpsError on failure. */
export function requireAdminCallable(req: CallableRequest<unknown>): void {
  if (!req.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  if (!isAdminClaims(req.auth.token as Claims)) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

/**
 * Guard for onRequest (HTTP) functions. Verifies the Bearer ID token and the
 * admin gate. On failure it writes the response and returns null; on success
 * it returns the decoded token. (getAuth() requires the admin app to have been
 * initialized by the caller's module.)
 */
export async function requireAdminHttp(req: Request, res: Response) {
  const authHeader = req.get("Authorization") || req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1];
  if (!idToken) {
    res.status(401).json({ error: "Missing Authorization Bearer token" });
    return null;
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "Invalid auth token" });
    return null;
  }

  if (!isAdminClaims(decoded as Claims)) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return decoded;
}
