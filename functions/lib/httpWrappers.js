"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteImageHttp = exports.uploadImageHttp = void 0;
// functions/src/httpWrappers.ts
const v2_1 = require("firebase-functions/v2");
const cors_1 = require("./lib/cors");
const uploadHandler_1 = require("./handlers/uploadHandler");
const cloudinary_1 = require("./lib/cloudinary");
const firebase_functions_1 = require("firebase-functions");
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
//# sourceMappingURL=httpWrappers.js.map