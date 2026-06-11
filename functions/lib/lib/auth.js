"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminClaims = isAdminClaims;
exports.requireAdminCallable = requireAdminCallable;
exports.requireAdminHttp = requireAdminHttp;
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
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const auth_1 = require("firebase-admin/auth");
function adminAllowlist() {
    return String(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}
/**
 * Whether a verified principal counts as an admin. Callers MUST already be
 * authenticated before this is consulted.
 */
function isAdminClaims(claims) {
    if (!claims)
        return false;
    if (claims.admin === true)
        return true;
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
    const allow = adminAllowlist();
    if (email && allow.includes(email))
        return true;
    // No admin signal configured yet → don't lock the admin app out.
    if (allow.length === 0) {
        firebase_functions_1.logger.warn("isAdminClaims: no admin claim and ADMIN_EMAILS is unset; allowing authenticated principal. " +
            "Set ADMIN_EMAILS (or provision the custom admin claim) to enforce admin-only access.");
        return true;
    }
    return false;
}
/** Guard for onCall functions. Throws HttpsError on failure. */
function requireAdminCallable(req) {
    if (!req.auth?.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    if (!isAdminClaims(req.auth.token)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required.");
    }
}
/**
 * Guard for onRequest (HTTP) functions. Verifies the Bearer ID token and the
 * admin gate. On failure it writes the response and returns null; on success
 * it returns the decoded token. (getAuth() requires the admin app to have been
 * initialized by the caller's module.)
 */
async function requireAdminHttp(req, res) {
    const authHeader = req.get("Authorization") || req.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1];
    if (!idToken) {
        res.status(401).json({ error: "Missing Authorization Bearer token" });
        return null;
    }
    let decoded;
    try {
        decoded = await (0, auth_1.getAuth)().verifyIdToken(idToken);
    }
    catch {
        res.status(401).json({ error: "Invalid auth token" });
        return null;
    }
    if (!isAdminClaims(decoded)) {
        res.status(403).json({ error: "Admin access required" });
        return null;
    }
    return decoded;
}
//# sourceMappingURL=auth.js.map