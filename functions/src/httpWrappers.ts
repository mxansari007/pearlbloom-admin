// functions/src/httpWrappers.ts
import { https } from "firebase-functions/v2";
import { Request, Response } from "express";
import { setCorsHeaders } from "./lib/cors";
import { handleUploadBase64 } from "./handlers/uploadHandler";
import { configureCloudinary, destroyImage } from "./lib/cloudinary";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { initializeApp } from "firebase-admin/app";
import { requireAdminHttp } from "./lib/auth";

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

    if (!(await requireAdminHttp(req, res))) return;

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

    if (!(await requireAdminHttp(req, res))) return;

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

initializeApp();

type PosthogReportRequest =
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
  | { report: "user_recent_events"; days?: number; hours?: number; limit?: number; distinct_id: string }
  | {
      report: "dashboard_batch";
      days?: number;
      hours?: number;
      pageviewEvent: string;
      productViewEvent: string;
      addToCartEvent: string;
      checkoutEvent: string;
      purchaseEvent: string;
      productPropKey?: string;
    };

const toDateTimeLiteral = (d: Date) => {
  const iso = d.toISOString().replace("T", " ").replace("Z", "");
  return `toDateTime('${iso}')`;
};

const hogqlStringLiteral = (value: string) =>
  `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const isValidPropKey = (value: string) => /^[A-Za-z0-9_$]+$/.test(value);

const getSafeDateFrom = (data: { days?: number; hours?: number }) => {
  const hours =
    typeof data.hours === "number"
      ? Math.max(1 / 60, Math.min(24 * 30, data.hours))
      : undefined;
  const days =
    typeof data.days === "number"
      ? Math.max(1 / 24, Math.min(365, data.days))
      : undefined;

  const ms =
    typeof hours === "number"
      ? hours * 60 * 60 * 1000
      : typeof days === "number"
        ? days * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

  return new Date(Date.now() - ms);
};

const getSafeLimit = (value: any, fallback: number, max: number) => {
  const n = typeof value === "number" ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(max, n));
};

async function posthogQuery(opts: {
  host: string;
  projectId: string;
  apiKey: string;
  query: string;
  name: string;
}) {
  const url = `${opts.host.replace(/\/$/, "")}/api/projects/${opts.projectId}/query/`;
  const resp = await fetch(url, {
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

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = typeof json?.detail === "string" ? json.detail : undefined;
    throw new Error(msg || `PostHog request failed (${resp.status})`);
  }

  return json;
}

export const posthogReportHttp = https.onRequest(
  {
    region: "us-central1",
  },
  async (req: Request, res: Response) => {
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

      const authHeader = req.get("Authorization") || req.get("authorization") || "";
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const idToken = match?.[1];
      if (!idToken) {
        res.status(401).json({ error: "Missing Authorization Bearer token" });
        return;
      }

      try {
        await getAuth().verifyIdToken(idToken);
      } catch {
        res.status(401).json({ error: "Invalid auth token" });
        return;
      }

      const apiKey = String(process.env.POSTHOG_PERSONAL_API_KEY || "")
        .trim()
        .replace(/^`|`$/g, "")
        .replace(/^Bearer\s+/i, "");
      const projectId = String(process.env.POSTHOG_PROJECT_ID || "")
        .trim()
        .replace(/^`|`$/g, "");
      const host = String(process.env.POSTHOG_HOST || "https://app.posthog.com")
        .trim()
        .replace(/^`|`$/g, "");

      if (!apiKey || !projectId) {
        res.status(400).json({ error: "PostHog is not configured on the server." });
        return;
      }

      const data = (req.body || {}) as PosthogReportRequest;
      const dateTo = new Date();
      const dateFrom = getSafeDateFrom(data);

      // BATCH ENDPOINT: Fetches all dashboard metrics in a single function call (14 queries → 1 invocation)
      if (data.report === "dashboard_batch") {
        const {
          pageviewEvent = "$pageview",
          productViewEvent = "product_viewed",
          addToCartEvent = "add_to_cart",
          checkoutEvent = "checkout_started",
          purchaseEvent = "purchase",
          productPropKey = "productId",
        } = data as any;

        const hours =
          typeof (data as any)?.hours === "number"
            ? Math.max(1 / 60, Math.min(24 * 30, (data as any).hours))
            : undefined;
        const bucketExpr =
          typeof hours === "number" && hours <= 2
            ? "toStartOfMinute(timestamp)"
            : typeof hours === "number" && hours <= 48
              ? "toStartOfHour(timestamp)"
              : "toStartOfDay(timestamp)";

        const dateFromLit = toDateTimeLiteral(dateFrom);
        const dateToLit = toDateTimeLiteral(dateTo);
        const pvLit = hogqlStringLiteral(pageviewEvent);
        const prLit = hogqlStringLiteral(productViewEvent);
        const atcLit = hogqlStringLiteral(addToCartEvent);
        const coLit = hogqlStringLiteral(checkoutEvent);
        const purLit = hogqlStringLiteral(purchaseEvent);

        const utmSource = "lower(coalesce(properties.$utm_source, ''))";
        const refDomain = "lower(coalesce(properties.$referring_domain, properties.$referrer_domain, ''))";
        const referrer = "lower(coalesce(properties.$referrer, ''))";
        const sourceExpr = `multiIf(
          (${utmSource} like '%instagram%' or ${refDomain} like '%instagram%' or ${referrer} like '%instagram%'), 'Instagram',
          (${utmSource} like '%google%' or ${refDomain} like '%google%' or ${referrer} like '%google%'), 'Google Search',
          (${utmSource} like '%facebook%' or ${refDomain} like '%facebook%' or ${referrer} like '%facebook%'), 'Facebook',
          (${utmSource} like '%whatsapp%' or ${refDomain} like '%whatsapp%' or ${referrer} like '%whatsapp%'), 'WhatsApp',
          (${utmSource} like '%youtube%' or ${refDomain} like '%youtube%' or ${referrer} like '%youtube%'), 'YouTube',
          (${utmSource} like '%twitter%' or ${utmSource} like '%x%' or ${refDomain} like '%t.co%' or ${refDomain} like '%twitter%' or ${refDomain} like '%x.com%' or ${referrer} like '%t.co%' or ${referrer} like '%twitter%' or ${referrer} like '%x.com%'), 'X/Twitter',
          (${utmSource} = '' and ${refDomain} = '' and ${referrer} = ''), 'Direct',
          'Other'
        )`;

        // Run all queries in parallel
        const [
          pvTotalRes,
          prTotalRes,
          atcTotalRes,
          coTotalRes,
          purTotalRes,
          pvSeriesRes,
          purSeriesRes,
          topUrlRes,
          topProdRes,
          recentRes,
          indiaStatesRes,
          indiaCitiesRes,
          trafficSourcesRes,
          activeUsersRes,
        ] = await Promise.all([
          // Totals
          posthogQuery({ host, projectId, apiKey, name: "Batch: total pageviews",
            query: `select count() as count from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit}` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: total product views",
            query: `select count() as count from events where event = ${prLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit}` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: total add to cart",
            query: `select count() as count from events where event = ${atcLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit}` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: total checkout",
            query: `select count() as count from events where event = ${coLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit}` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: total purchase",
            query: `select count() as count from events where event = ${purLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit}` }),
          // Time series
          posthogQuery({ host, projectId, apiKey, name: "Batch: pageview series",
            query: `select ${bucketExpr} as day, count() as count from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} group by day order by day` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: purchase series",
            query: `select ${bucketExpr} as day, count() as count from events where event = ${purLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} group by day order by day` }),
          // Top properties
          posthogQuery({ host, projectId, apiKey, name: "Batch: top URLs",
            query: `select properties.$current_url as value, count() as count from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} group by value order by count desc limit 10` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: top products",
            query: `select properties.${isValidPropKey(productPropKey) ? productPropKey : "productId"} as value, count() as count from events where event = ${prLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} group by value order by count desc limit 10` }),
          // Recent events
          posthogQuery({ host, projectId, apiKey, name: "Batch: recent events",
            query: `select timestamp, event, distinct_id, properties.$current_url as url, properties.$geoip_country_code as country, properties.$geoip_subdivision_1_name as state, properties.$geoip_city_name as city, properties.$session_id as session_id from events where timestamp >= ${dateFromLit} and event != '$snapshot' order by timestamp desc limit 30` }),
          // Geo
          posthogQuery({ host, projectId, apiKey, name: "Batch: India states",
            query: `select coalesce(properties.$geoip_subdivision_1_name, 'Unknown') as value, count() as count from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} and properties.$geoip_country_code = 'IN' group by value order by count desc limit 12` }),
          posthogQuery({ host, projectId, apiKey, name: "Batch: India cities",
            query: `select coalesce(properties.$geoip_city_name, 'Unknown') as value, count() as count from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} and properties.$geoip_country_code = 'IN' group by value order by count desc limit 12` }),
          // Traffic sources
          posthogQuery({ host, projectId, apiKey, name: "Batch: traffic sources",
            query: `select ${sourceExpr} as value, count() as count from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} group by value order by count desc limit 12` }),
          // Active users
          posthogQuery({ host, projectId, apiKey, name: "Batch: active users",
            query: `select distinct_id, count() as count, max(timestamp) as last_seen from events where event = ${pvLit} and timestamp >= ${dateFromLit} and timestamp < ${dateToLit} group by distinct_id order by count desc limit 12` }),
        ]);

        res.json({
          pageviewsTotal: pvTotalRes?.results ?? [],
          productViewsTotal: prTotalRes?.results ?? [],
          addToCartTotal: atcTotalRes?.results ?? [],
          checkoutTotal: coTotalRes?.results ?? [],
          purchaseTotal: purTotalRes?.results ?? [],
          pageviewsSeries: pvSeriesRes?.results ?? [],
          purchaseSeries: purSeriesRes?.results ?? [],
          topUrls: topUrlRes?.results ?? [],
          topProducts: topProdRes?.results ?? [],
          recent: recentRes?.results ?? [],
          indiaStates: indiaStatesRes?.results ?? [],
          indiaCities: indiaCitiesRes?.results ?? [],
          trafficSources: trafficSourcesRes?.results ?? [],
          activeUsers: activeUsersRes?.results ?? [],
        });
        return;
      }

      if (data.report === "event_definitions") {
        const lim = getSafeLimit(data.limit, 200, 500);
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
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "recent_events") {
        const lim = getSafeLimit(data.limit, 25, 200);
        const q = `select timestamp, event, distinct_id, properties.$current_url as url, properties.$geoip_country_code as country, properties.$geoip_subdivision_1_name as state, properties.$geoip_city_name as city, properties.$session_id as session_id from events where timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and event != '$snapshot' order by timestamp desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: "Admin: recent events",
        });
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "geo_india_states" || data.report === "geo_india_cities") {
        const lim = getSafeLimit((data as any).limit, 10, 100);
        const ev = typeof (data as any).event === "string" && (data as any).event.trim().length
          ? (data as any).event.trim()
          : "$pageview";
        const eventLit = hogqlStringLiteral(ev);
        const key =
          data.report === "geo_india_states"
            ? "$geoip_subdivision_1_name"
            : "$geoip_city_name";
        const q = `select coalesce(properties.${key}, 'Unknown') as value, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(
          dateTo
        )} and properties.$geoip_country_code = 'IN' group by value order by count desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: data.report === "geo_india_states" ? "Admin: India states" : "Admin: India cities",
        });
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "traffic_sources") {
        const lim = getSafeLimit((data as any).limit, 8, 50);
        const ev = typeof (data as any).event === "string" && (data as any).event.trim().length
          ? (data as any).event.trim()
          : "$pageview";
        const eventLit = hogqlStringLiteral(ev);
        const utmSource = "lower(coalesce(properties.$utm_source, ''))";
        const refDomain = "lower(coalesce(properties.$referring_domain, properties.$referrer_domain, ''))";
        const referrer = "lower(coalesce(properties.$referrer, ''))";
        const sourceExpr = `multiIf(
          (${utmSource} like '%instagram%' or ${refDomain} like '%instagram%' or ${referrer} like '%instagram%'), 'Instagram',
          (${utmSource} like '%google%' or ${refDomain} like '%google%' or ${referrer} like '%google%'), 'Google Search',
          (${utmSource} like '%facebook%' or ${refDomain} like '%facebook%' or ${referrer} like '%facebook%'), 'Facebook',
          (${utmSource} like '%whatsapp%' or ${refDomain} like '%whatsapp%' or ${referrer} like '%whatsapp%'), 'WhatsApp',
          (${utmSource} like '%youtube%' or ${refDomain} like '%youtube%' or ${referrer} like '%youtube%'), 'YouTube',
          (${utmSource} like '%twitter%' or ${utmSource} like '%x%' or ${refDomain} like '%t.co%' or ${refDomain} like '%twitter%' or ${refDomain} like '%x.com%' or ${referrer} like '%t.co%' or ${referrer} like '%twitter%' or ${referrer} like '%x.com%'), 'X/Twitter',
          (${utmSource} = '' and ${refDomain} = '' and ${referrer} = ''), 'Direct',
          'Other'
        )`;
        const q = `select ${sourceExpr} as value, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(
          dateTo
        )} group by value order by count desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: "Admin: traffic sources",
        });
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "active_users") {
        const lim = getSafeLimit((data as any).limit, 10, 100);
        const ev = typeof (data as any).event === "string" && (data as any).event.trim().length
          ? (data as any).event.trim()
          : "$pageview";
        const eventLit = hogqlStringLiteral(ev);
        const q = `select distinct_id, count() as count, max(timestamp) as last_seen from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(
          dateTo
        )} group by distinct_id order by count desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: "Admin: active users",
        });
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "user_recent_events") {
        const distinctIdRaw = String((data as any).distinct_id || "").trim();
        if (!distinctIdRaw) {
          res.status(400).json({ error: "distinct_id is required" });
          return;
        }
        const lim = getSafeLimit((data as any).limit, 50, 300);
        const distinctLit = hogqlStringLiteral(distinctIdRaw);
        const q = `select timestamp, event, properties.$current_url as url, properties.$geoip_country_code as country, properties.$geoip_subdivision_1_name as state, properties.$geoip_city_name as city, properties.$session_id as session_id from events where distinct_id = ${distinctLit} and timestamp >= ${toDateTimeLiteral(
          dateFrom
        )} and timestamp < ${toDateTimeLiteral(dateTo)} and event != '$snapshot' order by timestamp desc limit ${lim}`;
        const json = await posthogQuery({
          host,
          projectId,
          apiKey,
          query: q,
          name: "Admin: user recent events",
        });
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      const event = (data as any).event;
      if (typeof event !== "string" || !event.trim()) {
        res.status(400).json({ error: "event is required" });
        return;
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
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "time_series") {
        const hours =
          typeof (data as any)?.hours === "number"
            ? Math.max(1 / 60, Math.min(24 * 30, (data as any).hours))
            : undefined;
        const bucketExpr =
          typeof hours === "number" && hours <= 2
            ? "toStartOfMinute(timestamp)"
            : typeof hours === "number" && hours <= 48
              ? "toStartOfHour(timestamp)"
              : "toStartOfDay(timestamp)";

        const q = `select ${bucketExpr} as day, count() as count from events where event = ${eventLit} and timestamp >= ${toDateTimeLiteral(
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
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      if (data.report === "top_property") {
        const prop = String((data as any).property || "").trim();
        if (!prop || !isValidPropKey(prop)) {
          res.status(400).json({
            error: "property must be a simple key (letters, numbers, _, $)",
          });
          return;
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
        res.json({ results: json?.results ?? json?.result ?? json });
        return;
      }

      res.status(400).json({ error: "Unknown report" });
    } catch (err: any) {
      logger.error("posthogReportHttp error:", err);
      res.status(500).json({ error: err?.message || "PostHog query failed" });
    }
  }
);
