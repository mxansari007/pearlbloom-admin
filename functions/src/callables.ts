// functions/src/callables.ts
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { handleUploadBase64 } from "./handlers/uploadHandler";
import { configureCloudinary, destroyImage } from "./lib/cloudinary";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * onCall: uploadImage
 * secrets are declared here so runtime will inject them.
 */
export const uploadImageCallable = onCall(
  {
    secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    region: "us-central1",
  },
  async (req: CallableRequest<any>) => {
    try {
      // optional auth check:
      // if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");

      return await handleUploadBase64(req.data);
    } catch (err: any) {
      logger.error("uploadImage callable error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err?.message || "Upload failed");
    }
  }
);

/**
 * onCall: deleteImage
 */
export const deleteImageCallable = onCall(
  {
    secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    region: "us-central1",
  },
  async (req: CallableRequest<any>) => {
    try {
      const { public_id } = req.data || {};
      if (!public_id) throw new HttpsError("invalid-argument", "public_id required");

      configureCloudinary();
      const result = await destroyImage(public_id);
      return { result };
    } catch (err: any) {
      logger.error("deleteImage callable error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err?.message || "Delete failed");
    }
  }
);
