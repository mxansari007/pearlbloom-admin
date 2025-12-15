// functions/src/lib/cors.ts
import { Response } from "express";

/**
 * Return allowed origins list (from env ALLOWED_ORIGINS or sensible defaults).
 */
export function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS;
  if (env && env.trim().length) {
    return env.split(",").map((s) => s.trim());
  }

  const project = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || "";
  return [
    "http://localhost:5173",
    "http://localhost:3000",
    `https://${project}.web.app`,
    `https://${project}.firebaseapp.com`,
  ].filter(Boolean);
}

/**
 * Set CORS headers on a response if origin is allowed.
 */
export function setCorsHeaders(res: Response, origin?: string | undefined) {
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
}
