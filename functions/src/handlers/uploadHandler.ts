// functions/src/handlers/uploadHandler.ts
import { HttpsError } from "firebase-functions/v2/https";
import { configureCloudinary, uploadBufferToCloudinary } from "../lib/cloudinary";

/**
 * Validate payload and upload base64 to Cloudinary.
 * Throws HttpsError on validation or other issues.
 */
// Folders a caller may upload into. Anything else falls back to "products".
const ALLOWED_FOLDERS = ["products", "collections", "hero"] as const;
type Folder = (typeof ALLOWED_FOLDERS)[number];

function resolveFolder(value: unknown): Folder {
  return (ALLOWED_FOLDERS as readonly string[]).includes(String(value))
    ? (value as Folder)
    : "products";
}

export async function handleUploadBase64(payload: {
  filename?: string;
  base64?: string;
  mimeType?: string;
  folder?: string;
}) {
  const { filename, base64 } = payload || {};
  if (!filename || !base64) {
    throw new HttpsError("invalid-argument", "filename and base64 are required.");
  }
  // Honour the caller's folder (was hardcoded to "products", so collection
  // and hero images all landed in products/). Allowlisted to avoid arbitrary
  // Cloudinary paths.
  const folder = resolveFolder(payload?.folder);

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
  const result = await uploadBufferToCloudinary(buffer, folder);

  return {
    url: result.secure_url,
    public_id: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
  };
}
