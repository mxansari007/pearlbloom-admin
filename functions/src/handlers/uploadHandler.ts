// functions/src/handlers/uploadHandler.ts
import { HttpsError } from "firebase-functions/v2/https";
import { configureCloudinary, uploadBufferToCloudinary } from "../lib/cloudinary";

/**
 * Validate payload and upload base64 to Cloudinary.
 * Throws HttpsError on validation or other issues.
 */
export async function handleUploadBase64(payload: {
  filename?: string;
  base64?: string;
  mimeType?: string;
}) {
  const { filename, base64 } = payload || {};
  if (!filename || !base64) {
    throw new HttpsError("invalid-argument", "filename and base64 are required.");
  }

  // Accept dataURL or raw base64
  let rawBase64 = String(base64);
  const match = rawBase64.match(/^data:(.+);base64,(.*)$/);
  if (match) rawBase64 = match[2];

  const buffer = Buffer.from(rawBase64, "base64");

  const MAX_BYTES = 8 * 1024 * 1024; // 8MB
  if (buffer.length > MAX_BYTES) {
    throw new HttpsError("resource-exhausted", "File too large. Max 8 MB allowed.");
  }

  configureCloudinary();
  const result = await uploadBufferToCloudinary(buffer, "products");

  return {
    url: result.secure_url,
    public_id: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
  };
}
