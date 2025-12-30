import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../layouts/AdminLayout";
import { getPosthogReportHttp } from "../lib/functions";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart as RBarChart,
  Bar,
} from "recharts";
import { db, doc, getDoc } from "../firebase";
import { geoMercator, geoPath } from "d3-geo";

type TrendPoint = { day: string; count: number };
type TopRow = { value: string; count: number };
type RecentEvent = {
  timestamp: string;
  event: string;
  distinct_id?: string;
  url?: string;
  country?: string;
  state?: string;
  city?: string;
  session_id?: string;
};

type RangeKey = "1h" | "24h" | "7d" | "30d" | "90d";
const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days?: number; hours?: number }> = [
  { key: "1h", label: "Last 1 hour", hours: 1 },
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

const formatNumber = (n: number) => n.toLocaleString("en-IN");

const toLinePoints = (rows: any): TrendPoint[] => {
  const arr: any[] = Array.isArray(rows) ? rows : Array.isArray(rows?.results) ? rows.results : [];
  return arr
    .map((r: any) => {
      const day = String(r?.day ?? r?.[0] ?? "");
      const count = Number(r?.count ?? r?.[1] ?? 0);
      if (!day) return null;
      return { day, count: Number.isFinite(count) ? count : 0 };
    })
    .filter(Boolean) as TrendPoint[];
};

const toTotal = (rows: any): number => {
  const arr: any[] = Array.isArray(rows) ? rows : Array.isArray(rows?.results) ? rows.results : [];
  const first = arr[0];
  const val = Number(first?.count ?? first?.[0] ?? first?.[1] ?? 0);
  return Number.isFinite(val) ? val : 0;
};

const toTopRows = (rows: any): TopRow[] => {
  const arr: any[] = Array.isArray(rows) ? rows : Array.isArray(rows?.results) ? rows.results : [];
  return arr
    .map((r: any) => {
      const value = String(r?.value ?? r?.[0] ?? "");
      const count = Number(r?.count ?? r?.[1] ?? 0);
      if (!value) return null;
      return { value, count: Number.isFinite(count) ? count : 0 };
    })
    .filter(Boolean) as TopRow[];
};

const toRecentEvents = (rows: any): RecentEvent[] => {
  const arr: any[] = Array.isArray(rows) ? rows : Array.isArray(rows?.results) ? rows.results : [];
  return arr
    .map((r: any) => {
      const timestamp = String(r?.timestamp ?? r?.[0] ?? "");
      const event = String(r?.event ?? r?.[1] ?? "");
      const distinct_id = r?.distinct_id ?? r?.[2];
      const url = r?.url ?? r?.[3];
      const country = r?.country ?? r?.[4];
      const state = r?.state ?? r?.[5];
      const city = r?.city ?? r?.[6];
      const session_id = r?.session_id ?? r?.[7];
      if (!timestamp || !event) return null;
      return {
        timestamp,
        event,
        distinct_id: typeof distinct_id === "string" ? distinct_id : undefined,
        url: typeof url === "string" ? url : undefined,
        country: typeof country === "string" ? country : undefined,
        state: typeof state === "string" ? state : undefined,
        city: typeof city === "string" ? city : undefined,
        session_id: typeof session_id === "string" ? session_id : undefined,
      };
    })
    .filter(Boolean) as RecentEvent[];
};

const formatX = (v: any) => {
  const s = String(v ?? "");
  if (!s) return "";
  if (s.includes(" ")) {
    const [d, t] = s.split(" ");
    const time = t?.slice(0, 5);
    return time ? `${d.slice(5)} ${time}` : d;
  }
  return s;
};

function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatX} minTickGap={20} stroke="rgba(255,255,255,0.25)" fontSize={10} />
          <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickFormatter={(v) => formatNumber(Number(v) || 0)} />
          <Tooltip
            contentStyle={{
              background: "rgba(10,10,10,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
            labelFormatter={(label) => String(label)}
            formatter={(value: any) => [formatNumber(Number(value) || 0), "count"]}
          />
          <Line type="monotone" dataKey="count" stroke="#facc15" strokeWidth={2} dot={false} />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HorizontalBars({ rows }: { rows: TopRow[] }) {
  const data = rows.slice(0, 12).reverse();
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} layout="vertical" margin={{ left: 12, right: 12, top: 6, bottom: 6 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis type="number" stroke="rgba(255,255,255,0.25)" fontSize={10} tickFormatter={(v) => formatNumber(Number(v) || 0)} />
          <YAxis type="category" dataKey="value" width={160} stroke="rgba(255,255,255,0.25)" fontSize={10} tickFormatter={(v) => String(v).slice(0, 22)} />
          <Tooltip
            contentStyle={{
              background: "rgba(10,10,10,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
            formatter={(value: any) => [formatNumber(Number(value) || 0), "count"]}
          />
          <Bar dataKey="count" fill="rgba(250,204,21,0.75)" radius={[6, 6, 6, 6]} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

const INDIA_STATES_GEOJSON_URL =
  "https://gist.githubusercontent.com/jbrobst/56c13bbbf9d97d187fea01ca62ea5112/raw/e388c4cae20aa53cb5090210a42ebb9b765c0a36/india_states.geojson";

const normalizeKey = (v: string) =>
  v
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const STATE_ALIASES: Record<string, string> = {
  "nct of delhi": "delhi",
  "andaman and nicobar": "andaman and nicobar islands",
  "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
  "daman and diu": "dadra and nagar haveli and daman and diu",
  "orissa": "odisha",
  "pondicherry": "puducherry",
  "uttaranchal": "uttarakhand",
};

function IndiaStateHeatMap({ rows }: { rows: TopRow[] }) {
  const [geo, setGeo] = useState<any | null>(null);
  const [hover, setHover] = useState<{ name: string; count: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const resp = await fetch(INDIA_STATES_GEOJSON_URL);
        const json = await resp.json();
        if (!cancelled) setGeo(json);
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Failed to load map");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { max, valueByKey } = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k0 = normalizeKey(String(r.value || ""));
      const k = STATE_ALIASES[k0] ? normalizeKey(STATE_ALIASES[k0]) : k0;
      if (!k || k === "unknown" || k === "not set" || k === "undefined" || k === "null") continue;
      m.set(k, (m.get(k) || 0) + (Number.isFinite(r.count) ? r.count : 0));
    }
    const values = Array.from(m.values());
    const max = values.length ? Math.max(...values) : 0;
    return { max, valueByKey: m };
  }, [rows]);

  const colors = ["#0a0a0a", "#1c1917", "#292524", "#44403c", "#713f12", "#a16207", "#f59e0b", "#facc15"];
  const getFill = (value: number) => {
    if (!max || value <= 0) return "rgba(255,255,255,0.04)";
    const t = Math.max(0, Math.min(1, value / max));
    const idx = Math.min(colors.length - 1, Math.max(0, Math.floor(t * (colors.length - 1))));
    return colors[idx];
  };

  if (loadError) {
    return <div className="text-sm text-neutral-500">{loadError}</div>;
  }

  if (!geo?.features?.length) {
    return <div className="text-sm text-neutral-500">Loading map…</div>;
  }

  const width = 760;
  const height = 520;
  const projection = geoMercator().fitSize([width, height], geo);
  const path = geoPath(projection);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[11px] text-neutral-500">
          {hover ? `${hover.name}: ${formatNumber(hover.count)}` : "Hover a state"}
        </div>
        <div className="flex items-center gap-1.5">
          {colors.slice(1).map((c) => (
            <span key={c} className="h-2.5 w-5 rounded-sm border border-white/10" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/40">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {geo.features.map((f: any, idx: number) => {
            const rawName =
              String(
                f?.properties?.ST_NM ??
                  f?.properties?.st_nm ??
                  f?.properties?.STNAME ??
                  f?.properties?.STATE_NAME ??
                  f?.properties?.State_Name ??
                  f?.properties?.name ??
                  f?.properties?.NAME_1 ??
                  ""
              );
            const n0 = normalizeKey(rawName);
            const n = STATE_ALIASES[n0] ? normalizeKey(STATE_ALIASES[n0]) : n0;
            const value = valueByKey.get(n) || 0;
            const d = path(f);
            if (!d) return null;
            return (
              <path
                key={idx}
                d={d}
                fill={getFill(value)}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={0.6}
                className="transition-opacity hover:opacity-90"
                onMouseEnter={() => setHover({ name: rawName || "Unknown", count: value })}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${rawName || "Unknown"}: ${formatNumber(value)}`}</title>
              </path>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const callPosthog = useMemo(() => {
    try {
      return getPosthogReportHttp();
    } catch {
      return undefined;
    }
  }, []);

  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventDefs, setEventDefs] = useState<string[]>([]);
  const [pageviewEvent, setPageviewEvent] = useState<string>("$pageview");
  const [productViewEvent, setProductViewEvent] = useState<string>("product_viewed");
  const [addToCartEvent, setAddToCartEvent] = useState<string>("add_to_cart");
  const [checkoutEvent, setCheckoutEvent] = useState<string>("checkout_started");
  const [purchaseEvent, setPurchaseEvent] = useState<string>("purchase");

  const [pageviewsTotal, setPageviewsTotal] = useState<number>(0);
  const [productViewsTotal, setProductViewsTotal] = useState<number>(0);
  const [addToCartTotal, setAddToCartTotal] = useState<number>(0);
  const [checkoutTotal, setCheckoutTotal] = useState<number>(0);
  const [purchaseTotal, setPurchaseTotal] = useState<number>(0);

  const [pageviewsSeries, setPageviewsSeries] = useState<TrendPoint[]>([]);
  const [purchaseSeries, setPurchaseSeries] = useState<TrendPoint[]>([]);

  const [topUrls, setTopUrls] = useState<TopRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopRow[]>([]);
  const [productPropKey, setProductPropKey] = useState<string>("productId");

  const [recent, setRecent] = useState<RecentEvent[]>([]);

  const [indiaStates, setIndiaStates] = useState<TopRow[]>([]);
  const [indiaCities, setIndiaCities] = useState<TopRow[]>([]);
  const [trafficSources, setTrafficSources] = useState<TopRow[]>([]);

  const [activeUsers, setActiveUsers] = useState<Array<{ distinct_id: string; count: number; last_seen?: string; name?: string }>>([]);
  const [selectedDistinctId, setSelectedDistinctId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<RecentEvent[]>([]);

  const window = useMemo(() => RANGE_OPTIONS.find((o) => o.key === rangeKey) || RANGE_OPTIONS[1], [rangeKey]);
  const windowPayload = useMemo(() => ({ days: window.days, hours: window.hours }), [window.days, window.hours]);

  const refresh = async () => {
    if (!callPosthog) {
      setError("Analytics client not initialized.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [defsRes] = await Promise.all([
        callPosthog({ report: "event_definitions", limit: 300, days: 90 }),
      ]);

      const defRows = (defsRes.data as any)?.results;
      const defs: string[] = (
        Array.isArray(defRows)
          ? defRows
          : Array.isArray(defRows?.results)
            ? defRows.results
            : []
      )
        .map((r: any) => String(r?.event ?? r?.[0] ?? ""))
        .filter((s: string) => s.length > 0);
      setEventDefs(defs);

      const pickByExact = (v: string) => (defs.includes(v) ? v : undefined);
      const pickByIncludes = (needle: string) =>
        defs.find((e) => e.toLowerCase().includes(needle.toLowerCase()));

      setPageviewEvent((prev) => pickByExact(prev) || pickByExact("$pageview") || prev);
      setPurchaseEvent((prev) => pickByExact(prev) || pickByIncludes("purchase") || prev);
      setAddToCartEvent((prev) => pickByExact(prev) || pickByIncludes("add") || prev);
      setCheckoutEvent((prev) => pickByExact(prev) || pickByIncludes("checkout") || prev);
      setProductViewEvent((prev) => pickByExact(prev) || pickByIncludes("product") || prev);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    if (!callPosthog) return;
    setLoading(true);
    setError(null);
    try {
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
        callPosthog({ report: "total", ...windowPayload, event: pageviewEvent }),
        callPosthog({ report: "total", ...windowPayload, event: productViewEvent }),
        callPosthog({ report: "total", ...windowPayload, event: addToCartEvent }),
        callPosthog({ report: "total", ...windowPayload, event: checkoutEvent }),
        callPosthog({ report: "total", ...windowPayload, event: purchaseEvent }),
        callPosthog({ report: "time_series", ...windowPayload, event: pageviewEvent }),
        callPosthog({ report: "time_series", ...windowPayload, event: purchaseEvent }),
        callPosthog({
          report: "top_property",
          ...windowPayload,
          event: pageviewEvent,
          property: "$current_url",
          limit: 10,
        }),
        callPosthog({
          report: "top_property",
          ...windowPayload,
          event: productViewEvent,
          property: productPropKey,
          limit: 10,
        }),
        callPosthog({ report: "recent_events", ...windowPayload, limit: 30 }),
        callPosthog({ report: "geo_india_states", ...windowPayload, limit: 12, event: pageviewEvent }),
        callPosthog({ report: "geo_india_cities", ...windowPayload, limit: 12, event: pageviewEvent }),
        callPosthog({ report: "traffic_sources", ...windowPayload, limit: 12, event: pageviewEvent }),
        callPosthog({ report: "active_users", ...windowPayload, limit: 12, event: pageviewEvent }),
      ]);

      setPageviewsTotal(toTotal((pvTotalRes.data as any)?.results));
      setProductViewsTotal(toTotal((prTotalRes.data as any)?.results));
      setAddToCartTotal(toTotal((atcTotalRes.data as any)?.results));
      setCheckoutTotal(toTotal((coTotalRes.data as any)?.results));
      setPurchaseTotal(toTotal((purTotalRes.data as any)?.results));

      setPageviewsSeries(toLinePoints((pvSeriesRes.data as any)?.results));
      setPurchaseSeries(toLinePoints((purSeriesRes.data as any)?.results));

      setTopUrls(toTopRows((topUrlRes.data as any)?.results));
      setTopProducts(toTopRows((topProdRes.data as any)?.results));

      setRecent(toRecentEvents((recentRes.data as any)?.results));

      setIndiaStates(toTopRows((indiaStatesRes.data as any)?.results));
      setIndiaCities(toTopRows((indiaCitiesRes.data as any)?.results));
      setTrafficSources(toTopRows((trafficSourcesRes.data as any)?.results));

      const auArr: any[] = Array.isArray((activeUsersRes.data as any)?.results)
        ? (activeUsersRes.data as any).results
        : [];
      const baseUsers = auArr
        .map((r: any) => {
          const distinct_id = String(r?.distinct_id ?? r?.[0] ?? "").trim();
          const count = Number(r?.count ?? r?.[1] ?? 0);
          const last_seen = String(r?.last_seen ?? r?.[2] ?? "");
          if (!distinct_id) return null;
          return { distinct_id, count: Number.isFinite(count) ? count : 0, last_seen: last_seen || undefined };
        })
        .filter(Boolean) as Array<{ distinct_id: string; count: number; last_seen?: string }>;

      const withNames = await Promise.all(
        baseUsers.map(async (u) => {
          try {
            const snap = await getDoc(doc(db, "users", u.distinct_id));
            if (snap.exists()) {
              const d = snap.data() as any;
              const name =
                [d?.firstName || d?.firstname, d?.lastName || d?.lastname]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || d?.name;
              return { ...u, name: typeof name === "string" && name.trim().length ? name : undefined };
            }
          } catch {}
          return u;
        })
      );
      setActiveUsers(withNames);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedUser = async (distinctId: string) => {
    if (!callPosthog) return;
    setSelectedDistinctId(distinctId);
    try {
      const [evRes] = await Promise.all([
        callPosthog({ report: "user_recent_events", ...windowPayload, distinct_id: distinctId, limit: 80 } as any),
      ]);
      setSelectedEvents(toRecentEvents((evRes.data as any)?.results));
    } catch (err: any) {
      setError(err?.message || "Failed to load user activity.");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!eventDefs.length) return;
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rangeKey,
    pageviewEvent,
    productViewEvent,
    addToCartEvent,
    checkoutEvent,
    purchaseEvent,
    productPropKey,
    eventDefs.length,
  ]);

  const atcToPurchaseRate =
    addToCartTotal > 0 ? (purchaseTotal / addToCartTotal) * 100 : 0;

  return (
    <AdminLayout
      title="Analytics"
      subtitle="PostHog activity and business insights for your store."
      actions={
        <div className="flex items-center gap-2">
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={loadMetrics}
            disabled={loading}
            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-red-700 bg-red-900/10 p-4 text-[12px] text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="text-[11px] text-neutral-500">Pageviews</div>
          <div className="text-2xl font-semibold mt-2">
            {formatNumber(pageviewsTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            Event: {pageviewEvent}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="text-[11px] text-neutral-500">Product views</div>
          <div className="text-2xl font-semibold mt-2">
            {formatNumber(productViewsTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            Event: {productViewEvent}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="text-[11px] text-neutral-500">Add to cart</div>
          <div className="text-2xl font-semibold mt-2">
            {formatNumber(addToCartTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            Event: {addToCartEvent}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="text-[11px] text-neutral-500">Checkout</div>
          <div className="text-2xl font-semibold mt-2">
            {formatNumber(checkoutTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            Event: {checkoutEvent}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="text-[11px] text-neutral-500">Purchases</div>
          <div className="text-2xl font-semibold mt-2">
            {formatNumber(purchaseTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            ATC → Purchase: {atcToPurchaseRate.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6 lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Trends
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Pageviews and purchases over time.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={pageviewEvent}
                onChange={(e) => setPageviewEvent(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
              >
                {eventDefs.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <select
                value={purchaseEvent}
                onChange={(e) => setPurchaseEvent(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
              >
                {eventDefs.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-[11px] text-neutral-500 mb-2">
                {pageviewEvent}
              </div>
              {pageviewsSeries.length ? (
                <TrendChart data={pageviewsSeries} />
              ) : (
                <div className="text-sm text-neutral-500">No data.</div>
              )}
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-[11px] text-neutral-500 mb-2">
                {purchaseEvent}
              </div>
              {purchaseSeries.length ? (
                <TrendChart data={purchaseSeries} />
              ) : (
                <div className="text-sm text-neutral-500">No data.</div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <h2 className="text-sm font-semibold text-neutral-200 mb-2">
            Event Mapping
          </h2>
          <div className="text-[11px] text-neutral-500 mb-4">
            Pick the events you track on your storefront.
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-neutral-500 mb-1">Product view</div>
              <select
                value={productViewEvent}
                onChange={(e) => setProductViewEvent(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
              >
                {eventDefs.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-neutral-500 mb-1">Add to cart</div>
              <select
                value={addToCartEvent}
                onChange={(e) => setAddToCartEvent(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
              >
                {eventDefs.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-neutral-500 mb-1">Checkout</div>
              <select
                value={checkoutEvent}
                onChange={(e) => setCheckoutEvent(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
              >
                {eventDefs.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-neutral-500 mb-1">Purchase</div>
              <select
                value={purchaseEvent}
                onChange={(e) => setPurchaseEvent(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
              >
                {eventDefs.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Top Pages
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Most visited URLs (event-based).
              </p>
            </div>
          </div>
          {topUrls.length ? (
            <HorizontalBars rows={topUrls} />
          ) : (
            <div className="text-sm text-neutral-500">No data.</div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Top Products
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Most interacted products by property key.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={productPropKey}
                onChange={(e) => setProductPropKey(e.target.value)}
                className="w-40 rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
                placeholder="productId"
              />
            </div>
          </div>
          {topProducts.length ? (
            <HorizontalBars rows={topProducts} />
          ) : (
            <div className="text-sm text-neutral-500">No data.</div>
          )}
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                India Views (States)
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Top states by {pageviewEvent} (GeoIP: IN).
              </p>
            </div>
          </div>
          {indiaStates.length ? (
            <IndiaStateHeatMap rows={indiaStates} />
          ) : (
            <div className="text-sm text-neutral-500">No data.</div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                India Views (Cities)
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Top cities by {pageviewEvent} (GeoIP: IN).
              </p>
            </div>
          </div>
          {indiaCities.length ? (
            <HorizontalBars rows={indiaCities} />
          ) : (
            <div className="text-sm text-neutral-500">No data.</div>
          )}
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Active Users
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Top users by {pageviewEvent} volume.
              </p>
            </div>
          </div>

          {activeUsers.length === 0 ? (
            <div className="text-sm text-neutral-500">No data.</div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-neutral-800">
              <table className="min-w-full divide-y divide-neutral-800">
                <thead className="bg-neutral-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      User
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      Events
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      Last seen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {activeUsers.map((u) => (
                    <tr
                      key={u.distinct_id}
                      className="bg-neutral-950/40 hover:bg-neutral-900/40 transition cursor-pointer"
                      onClick={() => loadSelectedUser(u.distinct_id)}
                    >
                      <td className="px-4 py-2 text-[12px] text-neutral-200">
                        {u.name || "Unknown"}
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {u.distinct_id}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[12px] text-neutral-300">
                        {formatNumber(u.count)}
                      </td>
                      <td className="px-4 py-2 text-[12px] text-neutral-300">
                        {u.last_seen ? String(u.last_seen) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Traffic Sources
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                Where {pageviewEvent} came from (referrer / UTM).
              </p>
            </div>
          </div>
          {trafficSources.length ? (
            <HorizontalBars rows={trafficSources} />
          ) : (
            <div className="text-sm text-neutral-500">No data.</div>
          )}
        </section>
      </div>

      {selectedDistinctId && (
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                User Activity
              </h2>
              <p className="text-[11px] text-neutral-500 mt-1">
                {selectedDistinctId}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedDistinctId(null);
                setSelectedEvents([]);
              }}
              className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
            >
              Clear
            </button>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="text-sm text-neutral-500">No events for this user.</div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-neutral-800">
              <table className="min-w-full divide-y divide-neutral-800">
                <thead className="bg-neutral-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      Time
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      Event
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      Location
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                      URL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {selectedEvents.slice(0, 40).map((r, idx) => (
                    <tr key={idx} className="bg-neutral-950/40">
                      <td className="px-4 py-2 text-[12px] text-neutral-300">
                        {r.timestamp}
                      </td>
                      <td className="px-4 py-2 text-[12px] text-neutral-200">
                        {r.event}
                        {r.session_id && (
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {r.session_id}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[12px] text-neutral-300">
                        {[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-[12px] text-neutral-300">
                        {r.url || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">
              Recent Activity
            </h2>
            <p className="text-[11px] text-neutral-500 mt-1">
              Latest captured events.
            </p>
          </div>
        </div>

        {recent.length === 0 ? (
          <div className="text-sm text-neutral-500">No recent events.</div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-900/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                    Event
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {recent.map((r, idx) => (
                  <tr key={idx} className="bg-neutral-950/40">
                    <td className="px-4 py-2 text-[12px] text-neutral-300">
                      {r.timestamp}
                    </td>
                    <td className="px-4 py-2 text-[12px] text-neutral-200">
                      {r.event}
                      {r.distinct_id && (
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {r.distinct_id}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[12px] text-neutral-300">
                      {r.url || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
