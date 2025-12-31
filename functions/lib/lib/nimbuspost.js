"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nimbuspostLogin = nimbuspostLogin;
exports.nimbuspostGetCouriers = nimbuspostGetCouriers;
const https_1 = require("firebase-functions/v2/https");
let cachedToken = null;
const baseUrl = () => (process.env.NIMBUSPOST_BASE_URL || "https://api.nimbuspost.com").replace(/\/$/, "");
const getEmail = () => process.env.NIMBUSPOST_EMAIL || "";
const getPassword = () => process.env.NIMBUSPOST_PASSWORD || "";
const getTokenEnv = () => process.env.NIMBUSPOST_TOKEN || "";
const normalize = (v) => String(v ?? "").trim();
const tokenFromLogin = (json) => {
    const direct = normalize(json?.token);
    if (direct)
        return direct;
    const dataString = normalize(json?.data);
    if (dataString && dataString.includes("."))
        return dataString;
    const nested = normalize(json?.data?.token);
    if (nested)
        return nested;
    const alt = normalize(json?.data?.data?.token);
    if (alt)
        return alt;
    return "";
};
async function nimbuspostLogin() {
    const email = getEmail();
    const password = getPassword();
    if (!email || !password) {
        throw new https_1.HttpsError("failed-precondition", "Nimbuspost credentials are not configured on the server.");
    }
    const res = await fetch(`${baseUrl()}/v1/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    const json = (await res.json().catch(() => ({})));
    if (!res.ok || json?.status === false) {
        const msg = normalize(json?.message) || `Nimbuspost login failed (${res.status})`;
        throw new https_1.HttpsError("unauthenticated", msg);
    }
    const token = tokenFromLogin(json);
    if (!token) {
        throw new https_1.HttpsError("internal", "Nimbuspost login succeeded but token was missing.");
    }
    cachedToken = { token, updatedAtMs: Date.now() };
    return token;
}
async function getToken() {
    const now = Date.now();
    if (cachedToken && now - cachedToken.updatedAtMs < 6 * 60 * 60 * 1000) {
        return cachedToken.token;
    }
    const envToken = normalize(getTokenEnv());
    if (envToken) {
        cachedToken = { token: envToken, updatedAtMs: now };
        return envToken;
    }
    return nimbuspostLogin();
}
async function nimbusFetch(path, token) {
    const res = await fetch(`${baseUrl()}${path}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });
    const json = (await res.json().catch(() => ({})));
    return { res, json };
}
async function nimbuspostGetCouriers() {
    const token = await getToken();
    let { res, json } = await nimbusFetch("/v1/courier", token);
    if (res.status === 401) {
        const fresh = await nimbuspostLogin();
        const retry = await nimbusFetch("/v1/courier", fresh);
        res = retry.res;
        json = retry.json;
    }
    if (!res.ok || json?.status === false) {
        const msg = normalize(json?.message) || `Failed to fetch couriers (${res.status})`;
        throw new https_1.HttpsError("internal", msg);
    }
    const rows = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.data)
            ? json.data.data
            : [];
    const couriers = rows
        .map((c) => ({ id: normalize(c?.id), name: normalize(c?.name) }))
        .filter((c) => c.id && c.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    return couriers;
}
//# sourceMappingURL=nimbuspost.js.map