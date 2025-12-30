"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.posthogReportHttp = exports.deleteImageHttp = exports.uploadImageHttp = void 0;
// functions/src/httpWrappers.ts
const v2_1 = require("firebase-functions/v2");
const cors_1 = require("./lib/cors");
const uploadHandler_1 = require("./handlers/uploadHandler");
const cloudinary_1 = require("./lib/cloudinary");
const firebase_functions_1 = require("firebase-functions");
const auth_1 = require("firebase-admin/auth");
const app_1 = require("firebase-admin/app");
/**
 * HTTP wrapper for upload (lowercase name `uploadimage`).
 * Accepts JSON POST body: { filename, base64, mimeType }
 */
exports.uploadImageHttp = v2_1.https.onRequest(async (req, res) => {
    try {
        const origin = req.get("Origin") || req.get("origin");
        (0, cors_1.setCorsHeaders)(res, origin);
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const body = req.body || {};
        try {
            const payload = await (0, uploadHandler_1.handleUploadBase64)(body);
            res.json(payload);
        }
        catch (err) {
            firebase_functions_1.logger.error("uploadimage HTTP handler error:", err);
            if (err?.code && typeof err?.message === "string") {
                res.status(400).json({ error: err.message, code: err.code });
            }
            else {
                res.status(500).json({ error: err?.message || "Upload failed" });
            }
        }
    }
    catch (outerErr) {
        firebase_functions_1.logger.error("uploadimage outer error:", outerErr);
        res.status(500).json({ error: outerErr?.message || "Server error" });
    }
});
/**
 * HTTP wrapper for delete (lowercase name `deleteimage`).
 * Accepts JSON POST body: { public_id }
 */
exports.deleteImageHttp = v2_1.https.onRequest(async (req, res) => {
    try {
        const origin = req.get("Origin") || req.get("origin");
        (0, cors_1.setCorsHeaders)(res, origin);
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const { public_id } = req.body || {};
        if (!public_id) {
            res.status(400).json({ error: "public_id required" });
            return;
        }
        try {
            (0, cloudinary_1.configureCloudinary)();
            const result = await (0, cloudinary_1.destroyImage)(public_id);
            res.json({ result });
        }
        catch (err) {
            firebase_functions_1.logger.error("deleteimage HTTP handler error:", err);
            res.status(500).json({ error: err?.message || "Delete failed" });
        }
    }
    catch (outerErr) {
        firebase_functions_1.logger.error("deleteimage outer error:", outerErr);
        res.status(500).json({ error: outerErr?.message || "Server error" });
    }
});
(0, app_1.initializeApp)();
const toDateTimeLiteral = (d) => {
    const iso = d.toISOString().replace("T", " ").replace("Z", "");
    return `toDateTime('${iso}')`;
};
const hogqlStringLiteral = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const isValidPropKey = (value) => /^[A-Za-z0-9_$]+$/.test(value);
const getSafeDateFrom = (data) => {
    const hours = typeof data.hours === "number"
        ? Math.max(1 / 60, Math.min(24 * 30, data.hours))
        : undefined;
    const days = typeof data.days === "number"
        ? Math.max(1 / 24, Math.min(365, data.days))
        : undefined;
    const ms = typeof hours === "number"
        ? hours * 60 * 60 * 1000
        : typeof days === "number"
            ? days * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() - ms);
};
const getSafeLimit = (value, fallback, max) => {
    const n = typeof value === "number" ? Math.floor(value) : fallback;
    return Math.max(1, Math.min(max, n));
};
async function posthogQuery(opts) {
    const url = `${opts.host.replace(/\/$/, "")}/api/projects/${opts.projectId}/query/`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: {
                kind: "HogQLQuery",
                query: opts.query,
                name: opts.name,
            },
        }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const msg = typeof json?.detail === "string" ? json.detail : undefined;
        throw new Error(msg || `PostHog request failed (${resp.status})`);
    }
    return json;
}
exports.posthogReportHttp = v2_1.https.onRequest({
    secrets: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "POSTHOG_HOST"],
    region: "us-central1",
}, async (req, res) => {
    try {
        const origin = req.get("Origin") || req.get("origin");
        (0, cors_1.setCorsHeaders)(res, origin);
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const authHeader = req.get("Authorization") || req.get("authorization") || "";
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        const idToken = match?.[1];
        if (!idToken) {
            res.status(401).json({ error: "Missing Authorization Bearer token" });
            return;
        }
        try {
            await (0, auth_1.getAuth)().verifyIdToken(idToken);
        }
        catch {
            res.status(401).json({ error: "Invalid auth token" });
            return;
        }
        const apiKey = String(process.env.POSTHOG_PERSONAL_API_KEY || "")
            .trim()
            .replace(/^`|`$/g, "")
            .replace(/^Bearer\s+/i, "");
        const projectId = String(process.env.POSTHOG_PROJECT_ID || "")
            .trim()
            .replace(/^`|`$/g, "");
        const host = String(process.env.POSTHOG_HOST || "https://app.posthog.com")
            .trim()
            .replace(/^`|`$/g, "");
        if (!apiKey || !projectId) {
            res.status(400).json({ error: "PostHog is not configured on the server." });
            return;
        }
        const data = (req.body || {});
        const dateTo = new Date();
        const dateFrom = getSafeDateFrom(data);
        if (data.report === "event_definitions") {
            const lim = getSafeLimit(data.limit, 200, 500);
            const q = `select event, count() as count from events where timestamp >= ${toDateTimeLiteral(dateFrom)} group by event order by count desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: "Admin: event definitions",
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        if (data.report === "recent_events") {
            const lim = getSafeLimit(data.limit, 25, 200);
            const q = `select timestamp, event, distinct_id, properties.$current_url as url, properties.$geoip_country_code as country, properties.$geoip_subdivision_1_name as state, properties.$geoip_city_name as city, properties.$session_id as session_id from events where timestamp >= ${toDateTimeLiteral(dateFrom)} and event != '$snapshot' order by timestamp desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: "Admin: recent events",
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        if (data.report === "geo_india_states" || data.report === "geo_india_cities") {
            const lim = getSafeLimit(data.limit, 10, 100);
            const ev = typeof data.event === "string" && data.event.trim().length
                ? data.event.trim()
                : "$pageview";
            const eventLit = hogqlStringLiteral(ev);
            const key = data.report === "geo_india_states"
                ? "$geoip_subdivision_1_name"
                : "$geoip_city_name";
            const q = `select coalesce(properties.${key}, 'Unknown') as value, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)} and properties.$geoip_country_code = 'IN' group by value order by count desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: data.report === "geo_india_states" ? "Admin: India states" : "Admin: India cities",
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        if (data.report === "active_users") {
            const lim = getSafeLimit(data.limit, 10, 100);
            const ev = typeof data.event === "string" && data.event.trim().length
                ? data.event.trim()
                : "$pageview";
            const eventLit = hogqlStringLiteral(ev);
            const q = `select distinct_id, count() as count, max(timestamp) as last_seen from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)} group by distinct_id order by count desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: "Admin: active users",
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        if (data.report === "user_recent_events") {
            const distinctIdRaw = String(data.distinct_id || "").trim();
            if (!distinctIdRaw) {
                res.status(400).json({ error: "distinct_id is required" });
                return;
            }
            const lim = getSafeLimit(data.limit, 50, 300);
            const distinctLit = hogqlStringLiteral(distinctIdRaw);
            const q = `select timestamp, event, properties.$current_url as url, properties.$geoip_country_code as country, properties.$geoip_subdivision_1_name as state, properties.$geoip_city_name as city, properties.$session_id as session_id from events where distinct_id = ${distinctLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)} and event != '$snapshot' order by timestamp desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: "Admin: user recent events",
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        const event = data.event;
        if (typeof event !== "string" || !event.trim()) {
            res.status(400).json({ error: "event is required" });
            return;
        }
        const eventLit = hogqlStringLiteral(event.trim());
        if (data.report === "total") {
            const q = `select count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: `Admin: total ${event}`,
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        if (data.report === "time_series") {
            const hours = typeof data?.hours === "number"
                ? Math.max(1 / 60, Math.min(24 * 30, data.hours))
                : undefined;
            const bucketExpr = typeof hours === "number" && hours <= 2
                ? "toStartOfMinute(timestamp)"
                : typeof hours === "number" && hours <= 48
                    ? "toStartOfHour(timestamp)"
                    : "toStartOfDay(timestamp)";
            const q = `select ${bucketExpr} as day, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)} group by day order by day`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: `Admin: time series ${event}`,
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        if (data.report === "top_property") {
            const prop = String(data.property || "").trim();
            if (!prop || !isValidPropKey(prop)) {
                res.status(400).json({
                    error: "property must be a simple key (letters, numbers, _, $)",
                });
                return;
            }
            const lim = Math.max(1, Math.min(50, Math.floor(data.limit ?? 10)));
            const q = `select properties.${prop} as value, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)} group by value order by count desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: `Admin: top ${prop} for ${event}`,
            });
            res.json({ results: json?.results ?? json?.result ?? json });
            return;
        }
        res.status(400).json({ error: "Unknown report" });
    }
    catch (err) {
        firebase_functions_1.logger.error("posthogReportHttp error:", err);
        res.status(500).json({ error: err?.message || "PostHog query failed" });
    }
});
//# sourceMappingURL=httpWrappers.js.map