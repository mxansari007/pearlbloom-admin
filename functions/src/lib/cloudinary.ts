// functions/src/lib/cloudinary.ts
import * as cloudinary from "cloudinary";
import { Readable } from "stream";
import { logger } from "firebase-functions";

/**
 * Configure Cloudinary from env variables injected by Secrets Manager.
 * Expected env names: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
export function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    logger.warn(
      "Cloudinary env missing. Set secrets via `firebase functions:secrets:set`."
    );
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
export function uploadBufferToCloudinary(
  buffer: Buffer,
  folder = "products"
): Promise<cloudinary.UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      if (!result) return reject(new Error("Empty Cloudinary response"));
      resolve(result);
    });

    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Destroy image by public_id
 */
export async function destroyImage(public_id: string) {
  return cloudinary.v2.uploader.destroy(public_id);
}
