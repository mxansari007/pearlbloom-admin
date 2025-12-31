import { HttpsError } from "firebase-functions/v2/https";

type NimbusLoginResponse = {
  status?: boolean;
  data?: { token?: string } | any;
  token?: string;
  message?: string;
};

type NimbusCouriersResponse = {
  status?: boolean;
  data?: Array<{ id?: any; name?: any }> | any;
  message?: string;
};

let cachedToken: { token: string; updatedAtMs: number } | null = null;

const baseUrl = () => (process.env.NIMBUSPOST_BASE_URL || "https://api.nimbuspost.com").replace(/\/$/, "");

const getEmail = () => process.env.NIMBUSPOST_EMAIL || "";
const getPassword = () => process.env.NIMBUSPOST_PASSWORD || "";
const getTokenEnv = () => process.env.NIMBUSPOST_TOKEN || "";

const normalize = (v: unknown) => String(v ?? "").trim();

const tokenFromLogin = (json: NimbusLoginResponse) => {
  const direct = normalize((json as any)?.token);
  if (direct) return direct;
  const dataString = normalize((json as any)?.data);
  if (dataString && dataString.includes(".")) return dataString;
  const nested = normalize((json as any)?.data?.token);
  if (nested) return nested;
  const alt = normalize((json as any)?.data?.data?.token);
  if (alt) return alt;
  return "";
};

export async function nimbuspostLogin(): Promise<string> {
  const email = getEmail();
  const password = getPassword();
  if (!email || !password) {
    throw new HttpsError("failed-precondition", "Nimbuspost credentials are not configured on the server.");
  }

  const res = await fetch(`${baseUrl()}/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = (await res.json().catch(() => ({}))) as NimbusLoginResponse;
  if (!res.ok || json?.status === false) {
    const msg = normalize(json?.message) || `Nimbuspost login failed (${res.status})`;
    throw new HttpsError("unauthenticated", msg);
  }

  const token = tokenFromLogin(json);
  if (!token) {
    throw new HttpsError("internal", "Nimbuspost login succeeded but token was missing.");
  }

  cachedToken = { token, updatedAtMs: Date.now() };
  return token;
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedToken.updatedAtMs < 6 * 60 * 60 * 1000) {
    return cachedToken.token;
  }
  const envToken = normalize(getTokenEnv());
  if (envToken) {
    cachedToken = { token: envToken, updatedAtMs: now };
    return envToken;
  }
  return nimbuspostLogin();
}

async function nimbusFetch(path: string, token: string) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  return { res, json };
}

export async function nimbuspostGetCouriers(): Promise<Array<{ id: string; name: string; raw: any }>> {
  const token = await getToken();
  let { res, json } = await nimbusFetch("/v1/courier", token);

  if (res.status === 401) {
    const fresh = await nimbuspostLogin();
    const retry = await nimbusFetch("/v1/courier", fresh);
    res = retry.res;
    json = retry.json;
  }

  if (!res.ok || (json as NimbusCouriersResponse)?.status === false) {
    const msg = normalize((json as any)?.message) || `Failed to fetch couriers (${res.status})`;
    throw new HttpsError("internal", msg);
  }

  const rows = Array.isArray((json as any)?.data)
    ? (json as any).data
    : Array.isArray((json as any)?.data?.data)
      ? (json as any).data.data
      : [];

  const couriers = rows
    .map((c: any) => ({ id: normalize(c?.id), name: normalize(c?.name), raw: c }))
    .filter((c: any) => c.id && c.name)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return couriers;
}
