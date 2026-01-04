"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nimbuspostCouriersCallable = exports.posthogReportCallable = exports.deleteImageCallable = exports.uploadImageCallable = void 0;
// functions/src/callables.ts
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const uploadHandler_1 = require("./handlers/uploadHandler");
const cloudinary_1 = require("./lib/cloudinary");
const https_2 = require("firebase-functions/v2/https");
const nimbuspost_1 = require("./lib/nimbuspost");
/**
 * onCall: uploadImage
 * secrets are declared here so runtime will inject them.
 */
exports.uploadImageCallable = (0, https_1.onCall)({
    region: "us-central1",
}, async (req) => {
    try {
        // optional auth check:
        // if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
        return await (0, uploadHandler_1.handleUploadBase64)(req.data);
    }
    catch (err) {
        firebase_functions_1.logger.error("uploadImage callable error:", err);
        if (err instanceof https_2.HttpsError)
            throw err;
        throw new https_2.HttpsError("internal", err?.message || "Upload failed");
    }
});
/**
 * onCall: deleteImage
 */
exports.deleteImageCallable = (0, https_1.onCall)({
    region: "us-central1",
}, async (req) => {
    try {
        const { public_id } = req.data || {};
        if (!public_id)
            throw new https_2.HttpsError("invalid-argument", "public_id required");
        (0, cloudinary_1.configureCloudinary)();
        const result = await (0, cloudinary_1.destroyImage)(public_id);
        return { result };
    }
    catch (err) {
        firebase_functions_1.logger.error("deleteImage callable error:", err);
        if (err instanceof https_2.HttpsError)
            throw err;
        throw new https_2.HttpsError("internal", err?.message || "Delete failed");
    }
});
const toDateTimeLiteral = (d) => {
    const iso = d.toISOString().replace("T", " ").replace("Z", "");
    return `toDateTime('${iso}')`;
};
const hogqlStringLiteral = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const isValidPropKey = (value) => /^[A-Za-z0-9_$]+$/.test(value);
async function posthogQuery(opts) {
    const url = `${opts.host.replace(/\/$/, "")}/api/projects/${opts.projectId}/query/`;
    const res = await fetch(url, {
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
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = typeof json?.detail === "string" ? json.detail : undefined;
        throw new https_2.HttpsError("internal", msg || `PostHog request failed (${res.status})`);
    }
    return json;
}
exports.posthogReportCallable = (0, https_1.onCall)({
    region: "us-central1",
    cors: true,
    invoker: "public",
}, async (req) => {
    try {
        if (!req.auth?.uid)
            throw new https_2.HttpsError("unauthenticated", "Authentication required.");
        const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
        const projectId = process.env.POSTHOG_PROJECT_ID;
        const host = process.env.POSTHOG_HOST || "https://app.posthog.com";
        if (!apiKey || !projectId) {
            throw new https_2.HttpsError("failed-precondition", "PostHog is not configured on the server.");
        }
        const data = req.data;
        const safeDays = typeof data?.days === "number"
            ? Math.max(1, Math.min(365, Math.floor(data.days)))
            : 30;
        const dateTo = new Date();
        const dateFrom = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
        if (data.report === "event_definitions") {
            const lim = Math.max(1, Math.min(500, Math.floor(data.limit ?? 200)));
            const q = `select event, count() as count from events where timestamp >= ${toDateTimeLiteral(dateFrom)} group by event order by count desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: "Admin: event definitions",
            });
            return { results: json?.results ?? json?.result ?? json };
        }
        if (data.report === "recent_events") {
            const lim = Math.max(1, Math.min(100, Math.floor(data.limit ?? 25)));
            const q = `select timestamp, event, distinct_id, properties.$current_url as url from events where timestamp >= ${toDateTimeLiteral(dateFrom)} order by timestamp desc limit ${lim}`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: "Admin: recent events",
            });
            return { results: json?.results ?? json?.result ?? json };
        }
        const event = data.event;
        if (typeof event !== "string" || !event.trim()) {
            throw new https_2.HttpsError("invalid-argument", "event is required");
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
            return { results: json?.results ?? json?.result ?? json };
        }
        if (data.report === "time_series") {
            const q = `select toStartOfDay(timestamp) as day, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(dateFrom)} and timestamp < ${toDateTimeLiteral(dateTo)} group by day order by day`;
            const json = await posthogQuery({
                host,
                projectId,
                apiKey,
                query: q,
                name: `Admin: time series ${event}`,
            });
            return { results: json?.results ?? json?.result ?? json };
        }
        if (data.report === "top_property") {
            const prop = String(data.property || "").trim();
            if (!prop || !isValidPropKey(prop)) {
                throw new https_2.HttpsError("invalid-argument", "property must be a simple key (letters, numbers, _, $)");
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
            return { results: json?.results ?? json?.result ?? json };
        }
        throw new https_2.HttpsError("invalid-argument", "Unknown report");
    }
    catch (err) {
        firebase_functions_1.logger.error("posthogReport callable error:", err);
        if (err instanceof https_2.HttpsError)
            throw err;
        throw new https_2.HttpsError("internal", err?.message || "PostHog query failed");
    }
});
exports.nimbuspostCouriersCallable = (0, https_1.onCall)({
    region: "us-central1",
    cors: true,
}, async (req) => {
    try {
        if (!req.auth?.uid)
            throw new https_2.HttpsError("unauthenticated", "Authentication required.");
        const couriers = await (0, nimbuspost_1.nimbuspostGetCouriers)();
        return { couriers };
    }
    catch (err) {
        firebase_functions_1.logger.error("nimbuspostCouriers callable error:", err);
        if (err instanceof https_2.HttpsError)
            throw err;
        throw new https_2.HttpsError("internal", err?.message || "Failed to fetch couriers");
    }
});
//# sourceMappingURL=callables.js.map