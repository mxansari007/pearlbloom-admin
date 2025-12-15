// src/lib/functions.ts
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

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
  return httpsCallable(f, "uploadImageCallable");
}

export function getDeleteCallable() {
  const f = initFunctionsClient();
  return httpsCallable(f, "deleteImageCallable");
}
