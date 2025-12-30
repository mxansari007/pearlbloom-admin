// src/lib/functions.ts
import { getApp } from "firebase/app";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { auth } from "../firebase";

/**
 * Functions client (Vite-friendly).
 * Emulator will be used ONLY when:
 *   - running Vite dev (import.meta.env.DEV === true)
 *   - AND VITE_USE_FUNCTIONS_EMULATOR is exactly the string "true"
 *
 * This prevents accidentally using emulator just because hostname === "localhost".
 */

const REGION = (import.meta.env.VITE_FUNCTIONS_REGION as string) || "us-central1";
const EMULATOR_HOST = (import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST as string) || "localhost";
const EMULATOR_PORT = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? 5001);

let functionsClient: ReturnType<typeof getFunctions> | undefined;

type UploadImagePayload = {
  filename: string;
  mimeType: string;
  base64: string;
};

type UploadImageResponse = {
  url?: string;
  public_id?: string;
  error?: string;
};

type DeleteImagePayload = {
  public_id: string;
};

type DeleteImageResponse = {
  result?: unknown;
  error?: string;
};

export type PosthogReportRequest =
  | { report: "event_definitions"; limit?: number; days?: number; hours?: number }
  | { report: "time_series"; days?: number; hours?: number; event: string }
  | { report: "total"; days?: number; hours?: number; event: string }
  | {
      report: "top_property";
      days?: number;
      hours?: number;
      event: string;
      property: string;
      limit?: number;
    }
  | { report: "recent_events"; days?: number; hours?: number; limit?: number }
  | { report: "geo_india_states"; days?: number; hours?: number; limit?: number; event?: string }
  | { report: "geo_india_cities"; days?: number; hours?: number; limit?: number; event?: string }
  | { report: "traffic_sources"; days?: number; hours?: number; limit?: number; event?: string }
  | { report: "active_users"; days?: number; hours?: number; limit?: number; event?: string }
  | { report: "user_recent_events"; days?: number; hours?: number; limit?: number; distinct_id: string };

export type PosthogReportResponse = {
  results?: any;
};

export function initFunctionsClient() {
  if (functionsClient) return functionsClient;
  const app = getApp(); // assumes app was initialized in your ../firebase
  functionsClient = getFunctions(app, REGION);

  // Emulator is used **only** when the env var is explicitly "true"
  const useEmulator = import.meta.env.DEV && (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true");

  if (useEmulator) {
    try {
      connectFunctionsEmulator(functionsClient, EMULATOR_HOST, EMULATOR_PORT);
      // eslint-disable-next-line no-console
      console.debug(`Connected Functions emulator at ${EMULATOR_HOST}:${EMULATOR_PORT}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Could not connect to functions emulator (continuing with deployed functions):", err);
    }
  }

  return functionsClient;
}

export function getUploadCallable() {
  const f = initFunctionsClient();
  return httpsCallable<UploadImagePayload, UploadImageResponse>(
    f,
    "uploadImageCallable"
  );
}

export function getDeleteCallable() {
  const f = initFunctionsClient();
  return httpsCallable<DeleteImagePayload, DeleteImageResponse>(
    f,
    "deleteImageCallable"
  );
}

export function getPosthogReportCallable() {
  const f = initFunctionsClient();
  return httpsCallable<PosthogReportRequest, PosthogReportResponse>(
    f,
    "posthogReportCallable"
  );
}

export function getPosthogReportHttp() {
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || "";
  const fnName = "posthogReportHttp";
  const baseUrl = projectId ? `https://${REGION}-${projectId}.cloudfunctions.net/${fnName}` : `/${fnName}`;

  return async (data: PosthogReportRequest) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required.");
    const token = await user.getIdToken();

    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = typeof (json as any)?.error === "string" ? (json as any).error : undefined;
      throw new Error(msg || `Request failed (${resp.status})`);
    }

    return { data: json as PosthogReportResponse };
  };
}
