"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureCloudinary = configureCloudinary;
exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
exports.destroyImage = destroyImage;
// functions/src/lib/cloudinary.ts
const cloudinary = __importStar(require("cloudinary"));
const stream_1 = require("stream");
const firebase_functions_1 = require("firebase-functions");
/**
 * Configure Cloudinary from env variables injected by Secrets Manager.
 * Expected env names: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
function configureCloudinary() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
        firebase_functions_1.logger.warn("Cloudinary env missing. Set secrets via `firebase functions:secrets:set`.");
    }
    cloudinary.v2.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
    });
}
/**
 * Upload a Buffer to Cloudinary using upload_stream.
 */
function uploadBufferToCloudinary(buffer, folder = "products") {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream({ folder }, (err, result) => {
            if (err)
                return reject(err);
            if (!result)
                return reject(new Error("Empty Cloudinary response"));
            resolve(result);
        });
        stream_1.Readable.from(buffer).pipe(uploadStream);
    });
}
/**
 * Destroy image by public_id
 */
async function destroyImage(public_id) {
    return cloudinary.v2.uploader.destroy(public_id);
}
//# sourceMappingURL=cloudinary.js.map