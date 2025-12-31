// functions/src/callables.ts
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { handleUploadBase64 } from "./handlers/uploadHandler";
import { configureCloudinary, destroyImage } from "./lib/cloudinary";
import { HttpsError } from "firebase-functions/v2/https";
import { nimbuspostGetCouriers } from "./lib/nimbuspost";

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

type PosthogReportRequest =
  | { report: "event_definitions"; limit?: number }
  | {
      report: "time_series";
      days: number;
      event: string;
    }
  | {
      report: "total";
      days: number;
      event: string;
    }
  | {
      report: "top_property";
      days: number;
      event: string;
      property: string;
      limit?: number;
    }
  | {
      report: "recent_events";
      days: number;
      limit?: number;
    };

const toDateTimeLiteral = (d: Date) => {
  const iso = d.toISOString().replace("T", " ").replace("Z", "");
  return `toDateTime('${iso}')`;
};

const hogqlStringLiteral = (value: string) =>
  `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const isValidPropKey = (value: string) => /^[A-Za-z0-9_$]+$/.test(value);

async function posthogQuery(opts: {
  host: string;
  projectId: string;
  apiKey: string;
  query: string;
  name: string;
}) {
  const url = `${opts.host.replace(/\/$/, "")}/api/projects/${opts.projectId}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: opts.query,
        name: opts.name,
      },
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof json?.detail === "string" ? json.detail : undefined;
    throw new HttpsError("internal", msg || `PostHog request failed (${res.status})`);
  }
  return json;
}

export const posthogReportCallable = onCall(
  {
    secrets: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "POSTHOG_HOST"],
    region: "us-central1",
    cors: true,
    invoker: "public",
  },
  async (req: CallableRequest<PosthogReportRequest>) => {
    try {
      if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");

      const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
      const projectId = process.env.POSTHOG_PROJECT_ID;
      const host = process.env.POSTHOG_HOST || "https://app.posthog.com";

      if (!apiKey || !projectId) {
        throw new HttpsError(
          "failed-precondition",
          "PostHog is not configured on the server."
        );
      }

      const data = req.data as PosthogReportRequest;
      const safeDays =
        typeof (data as any)?.days === "number"
          ? Math.max(1, Math.min(365, Math.floor((data as any).days)))
          : 30;
      const dateTo = new Date();
      const dateFrom = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

      if (data.report === "event_definitions") {
        const lim = Math.max(1, Math.min(500, Math.floor(data.limit ?? 200)));
        const q = `select event, count() as count from events where timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} group by event order by count desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: "Admin: event definitions",
        });
        return { results: json?.results ?? json?.result ?? json };
      }

      if (data.report === "recent_events") {
        const lim = Math.max(1, Math.min(100, Math.floor(data.limit ?? 25)));
        const q = `select timestamp, event, distinct_id, properties.$current_url as url from events where timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} order by timestamp desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: "Admin: recent events",
        });
        return { results: json?.results ?? json?.result ?? json };
      }

      const event = (data as any).event;
      if (typeof event !== "string" || !event.trim()) {
        throw new HttpsError("invalid-argument", "event is required");
      }

      const eventLit = hogqlStringLiteral(event.trim());

      if (data.report === "total") {
        const q = `select count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(dateTo)}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: `Admin: total ${event}`,
        });
        return { results: json?.results ?? json?.result ?? json };
      }

      if (data.report === "time_series") {
        const q = `select toStartOfDay(timestamp) as day, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(
          dateTo
        )} group by day order by day`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: `Admin: time series ${event}`,
        });
        return { results: json?.results ?? json?.result ?? json };
      }

      if (data.report === "top_property") {
        const prop = String((data as any).property || "").trim();
        if (!prop || !isValidPropKey(prop)) {
          throw new HttpsError(
            "invalid-argument",
            "property must be a simple key (letters, numbers, _, $)"
          );
        }
        const lim = Math.max(1, Math.min(50, Math.floor((data as any).limit ?? 10)));
        const q = `select properties.${prop} as value, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(
          dateTo
        )} group by value order by count desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: `Admin: top ${prop} for ${event}`,
        });
        return { results: json?.results ?? json?.result ?? json };
      }

      throw new HttpsError("invalid-argument", "Unknown report");
    } catch (err: any) {
      logger.error("posthogReport callable error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err?.message || "PostHog query failed");
    }
  }
);

export const nimbuspostCouriersCallable = onCall(
  {
    region: "us-central1",
    cors: true,
  },
  async (req: CallableRequest<any>) => {
    try {
      if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
      const couriers = await nimbuspostGetCouriers();
      return { couriers };
    } catch (err: any) {
      logger.error("nimbuspostCouriers callable error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err?.message || "Failed to fetch couriers");
    }
  }
);
