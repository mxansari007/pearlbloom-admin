// functions/src/httpWrappers.ts
import { https } from "firebase-functions/v2";
import { Request, Response } from "express";
import { setCorsHeaders } from "./lib/cors";
import { handleUploadBase64 } from "./handlers/uploadHandler";
import { configureCloudinary, destroyImage } from "./lib/cloudinary";
import { logger } from "firebase-functions";

/**
 * HTTP wrapper for upload (lowercase name `uploadimage`).
 * Accepts JSON POST body: { filename, base64, mimeType }
 */
export const uploadImageHttp = https.onRequest(async (req: Request, res: Response) => {
  try {
    const origin = req.get("Origin") || req.get("origin");
    setCorsHeaders(res, origin);

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
      const payload = await handleUploadBase64(body);
      res.json(payload);
    } catch (err: any) {
      logger.error("uploadimage HTTP handler error:", err);
      if (err?.code && typeof err?.message === "string") {
        res.status(400).json({ error: err.message, code: err.code });
      } else {
        res.status(500).json({ error: err?.message || "Upload failed" });
      }
    }
  } catch (outerErr: any) {
    logger.error("uploadimage outer error:", outerErr);
    res.status(500).json({ error: outerErr?.message || "Server error" });
  }
});

/**
 * HTTP wrapper for delete (lowercase name `deleteimage`).
 * Accepts JSON POST body: { public_id }
 */
export const deleteImageHttp = https.onRequest(async (req: Request, res: Response) => {
  try {
    const origin = req.get("Origin") || req.get("origin");
    setCorsHeaders(res, origin);

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
      configureCloudinary();
      const result = await destroyImage(public_id);
      res.json({ result });
    } catch (err: any) {
      logger.error("deleteimage HTTP handler error:", err);
      res.status(500).json({ error: err?.message || "Delete failed" });
    }
  } catch (outerErr: any) {
    logger.error("deleteimage outer error:", outerErr);
    res.status(500).json({ error: outerErr?.message || "Server error" });
  }
});
