"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteImageCallable = exports.uploadImageCallable = void 0;
// functions/src/callables.ts
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const uploadHandler_1 = require("./handlers/uploadHandler");
const cloudinary_1 = require("./lib/cloudinary");
const https_2 = require("firebase-functions/v2/https");
/**
 * onCall: uploadImage
 * secrets are declared here so runtime will inject them.
 */
exports.uploadImageCallable = (0, https_1.onCall)({
    secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
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
    secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
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
//# sourceMappingURL=callables.js.map