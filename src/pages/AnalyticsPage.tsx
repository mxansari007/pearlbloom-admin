import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { getCached, invalidateCachePrefix } from "../lib/cache";

// Cache TTLs
const CACHE_TTL_EVENT_DEFS = 30 * 60 * 1000; // 30 minutes for event definitions
const CACHE_TTL_METRICS = 5 * 60 * 1000; // 5 minutes for metrics
const CACHE_TTL_USER_NAMES = 60 * 60 * 1000; // 1 hour for user names

// User name cache (in-memory for current session)
const userNameCache = new Map<string, string | undefined>();

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

/* ---------------- Stat Card Component ---------------- */
function StatCard({
  label,
  value,
  subtitle,
  icon,
  accent = "from-neutral-500/10 to-transparent",
  highlight = false,
}: {
  label: string;
  value: number;
  subtitle: string;
  icon: string;
  accent?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all duration-200
        hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20
        ${highlight
          ? "border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 via-neutral-950/80 to-neutral-950"
          : "border-neutral-800 bg-neutral-950/60"
        }
      `}
    >
      {/* Gradient accent */}
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} pointer-events-none`} />
      
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
            {label}
          </span>
          <span className="text-base sm:text-lg opacity-60">{icon}</span>
        </div>
        <div className={`text-xl sm:text-2xl lg:text-3xl font-bold mt-2 ${highlight ? "text-yellow-100" : "text-white"}`}>
          {formatNumber(value)}
        </div>
        <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1.5 truncate" title={subtitle}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Section Card Component ---------------- */
function SectionCard({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm ${className}`}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ---------------- Empty State Component ---------------- */
function EmptyState({ message = "No data available" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-3xl mb-2 opacity-40">📊</div>
      <p className="text-sm text-neutral-500">{message}</p>
    </div>
  );
}

const AnalyticsPageSkeleton = () => (
  <div className="animate-pulse">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-5 h-24 sm:h-28"></div>
      ))}
    </div>

    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-6 lg:col-span-2 h-64"></div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-6 h-64"></div>
    </div>

    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-6 h-80"></div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-6 h-80"></div>
    </div>
  </div>
);

export default function AnalyticsPage() {
  const navigate = useNavigate();
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

  const refresh = async (forceRefresh = false) => {
    if (!callPosthog) {
      setError("Analytics client not initialized.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Cache event definitions - they rarely change
      const defs = await getCached<string[]>(
        "analytics:event_definitions",
        async () => {
          const defsRes = await callPosthog({ report: "event_definitions", limit: 300, days: 90 });
          const defRows = (defsRes.data as any)?.results;
          return (
            Array.isArray(defRows)
              ? defRows
              : Array.isArray(defRows?.results)
                ? defRows.results
                : []
          )
            .map((r: any) => String(r?.event ?? r?.[0] ?? ""))
            .filter((s: string) => s.length > 0);
        },
        forceRefresh ? 0 : CACHE_TTL_EVENT_DEFS
      );

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

  // Track if we've already loaded metrics for this range to prevent duplicate calls
  const loadingRef = useRef(false);

  const loadMetrics = async (forceRefresh = false) => {
    if (!callPosthog || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    // Create a cache key based on the current parameters
    const cacheKey = `analytics:metrics:${rangeKey}:${pageviewEvent}:${productViewEvent}:${addToCartEvent}:${checkoutEvent}:${purchaseEvent}:${productPropKey}`;

    try {
      // Fetch all metrics with caching - using SINGLE batch call instead of 14 separate calls
      const metrics = await getCached(
        cacheKey,
        async () => {
          // Single batch call to backend - reduces 14 function invocations to 1
          const batchRes = await callPosthog({
            report: "dashboard_batch",
            ...windowPayload,
            pageviewEvent,
            productViewEvent,
            addToCartEvent,
            checkoutEvent,
            purchaseEvent,
            productPropKey,
          } as any);

          const data = batchRes.data as any;

          return {
            pageviewsTotal: toTotal(data?.pageviewsTotal),
            productViewsTotal: toTotal(data?.productViewsTotal),
            addToCartTotal: toTotal(data?.addToCartTotal),
            checkoutTotal: toTotal(data?.checkoutTotal),
            purchaseTotal: toTotal(data?.purchaseTotal),
            pageviewsSeries: toLinePoints(data?.pageviewsSeries),
            purchaseSeries: toLinePoints(data?.purchaseSeries),
            topUrls: toTopRows(data?.topUrls),
            topProducts: toTopRows(data?.topProducts),
            recent: toRecentEvents(data?.recent),
            indiaStates: toTopRows(data?.indiaStates),
            indiaCities: toTopRows(data?.indiaCities),
            trafficSources: toTopRows(data?.trafficSources),
            activeUsersRaw: Array.isArray(data?.activeUsers) ? data.activeUsers : [],
          };
        },
        forceRefresh ? 0 : CACHE_TTL_METRICS
      );

      setPageviewsTotal(metrics.pageviewsTotal);
      setProductViewsTotal(metrics.productViewsTotal);
      setAddToCartTotal(metrics.addToCartTotal);
      setCheckoutTotal(metrics.checkoutTotal);
      setPurchaseTotal(metrics.purchaseTotal);
      setPageviewsSeries(metrics.pageviewsSeries);
      setPurchaseSeries(metrics.purchaseSeries);
      setTopUrls(metrics.topUrls);
      setTopProducts(metrics.topProducts);
      setRecent(metrics.recent);
      setIndiaStates(metrics.indiaStates);
      setIndiaCities(metrics.indiaCities);
      setTrafficSources(metrics.trafficSources);

      // Process active users with cached user names
      const baseUsers = metrics.activeUsersRaw
        .map((r: any) => {
          const distinct_id = String(r?.distinct_id ?? r?.[0] ?? "").trim();
          const count = Number(r?.count ?? r?.[1] ?? 0);
          const last_seen = String(r?.last_seen ?? r?.[2] ?? "");
          if (!distinct_id) return null;
          return { distinct_id, count: Number.isFinite(count) ? count : 0, last_seen: last_seen || undefined };
        })
        .filter(Boolean) as Array<{ distinct_id: string; count: number; last_seen?: string }>;

      // Use cached user names to avoid repeated Firestore reads
      const withNames = await Promise.all(
        baseUsers.map(async (u) => {
          // Check in-memory cache first
          if (userNameCache.has(u.distinct_id)) {
            return { ...u, name: userNameCache.get(u.distinct_id) };
          }

          try {
            const snap = await getDoc(doc(db, "users", u.distinct_id));
            if (snap.exists()) {
              const d = snap.data() as any;
              const name =
                [d?.firstName || d?.firstname, d?.lastName || d?.lastname]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || d?.name;
              const finalName = typeof name === "string" && name.trim().length ? name : undefined;
              userNameCache.set(u.distinct_id, finalName);
              return { ...u, name: finalName };
            }
            userNameCache.set(u.distinct_id, undefined);
          } catch {
            userNameCache.set(u.distinct_id, undefined);
          }
          return u;
        })
      );
      setActiveUsers(withNames);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // Force refresh handler for the Refresh button
  const handleForceRefresh = () => {
    invalidateCachePrefix("analytics:");
    refresh(true);
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
        <div className="flex items-center gap-2 sm:gap-3">
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="rounded-xl border border-neutral-700 bg-neutral-900/80 text-[11px] sm:text-[12px] text-neutral-100 px-2.5 sm:px-4 py-2 focus:border-yellow-500/50 focus:outline-none transition cursor-pointer"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleForceRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[11px] sm:text-[12px] rounded-xl border border-neutral-700 px-3 sm:px-4 py-2 text-neutral-200 hover:bg-yellow-500/10 hover:border-yellow-500/40 hover:text-yellow-200 transition disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-neutral-700 disabled:hover:text-neutral-200"
          >
            <span className={loading ? "animate-spin" : ""}>↻</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      }
    >
      {loading ? (
        <AnalyticsPageSkeleton />
      ) : (
        <>
          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-950/40 to-red-900/20 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-red-200">Failed to load analytics</p>
                  <p className="text-[12px] text-red-300/80 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards - Responsive grid: 2 cols on mobile, 3 on tablet, 5 on desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              label="Pageviews"
              value={pageviewsTotal}
              subtitle={pageviewEvent}
              icon="👁"
              accent="from-blue-500/20 to-transparent"
            />
            <StatCard
              label="Product Views"
              value={productViewsTotal}
              subtitle={productViewEvent}
              icon="📦"
              accent="from-purple-500/20 to-transparent"
            />
            <StatCard
              label="Add to Cart"
              value={addToCartTotal}
              subtitle={addToCartEvent}
              icon="🛒"
              accent="from-amber-500/20 to-transparent"
            />
            <StatCard
              label="Checkout"
              value={checkoutTotal}
              subtitle={checkoutEvent}
              icon="💳"
              accent="from-emerald-500/20 to-transparent"
            />
            <StatCard
              label="Purchases"
              value={purchaseTotal}
              subtitle={`${atcToPurchaseRate.toFixed(1)}% conversion`}
              icon="✨"
              accent="from-yellow-500/20 to-transparent"
              highlight
            />
          </div>

          {/* Trends + Event Mapping */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <SectionCard
              title="📈 Trends"
              subtitle="Pageviews and purchases over time"
              className="lg:col-span-2"
              actions={
                <div className="flex flex-wrap gap-2">
                  <select
                    value={pageviewEvent}
                    onChange={(e) => setPageviewEvent(e.target.value)}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 text-[11px] text-neutral-100 px-2 py-1.5"
                  >
                    {eventDefs.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                  <select
                    value={purchaseEvent}
                    onChange={(e) => setPurchaseEvent(e.target.value)}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 text-[11px] text-neutral-100 px-2 py-1.5"
                  >
                    {eventDefs.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 mb-3">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    {pageviewEvent}
                  </div>
                  {pageviewsSeries.length ? (
                    <TrendChart data={pageviewsSeries} />
                  ) : (
                    <EmptyState message="No pageview data" />
                  )}
                </div>
                <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 mb-3">
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                    {purchaseEvent}
                  </div>
                  {purchaseSeries.length ? (
                    <TrendChart data={purchaseSeries} />
                  ) : (
                    <EmptyState message="No purchase data" />
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="⚙️ Event Mapping" subtitle="Map your storefront events">
              <div className="space-y-3">
                {[
                  { label: "Product view", value: productViewEvent, setter: setProductViewEvent },
                  { label: "Add to cart", value: addToCartEvent, setter: setAddToCartEvent },
                  { label: "Checkout", value: checkoutEvent, setter: setCheckoutEvent },
                  { label: "Purchase", value: purchaseEvent, setter: setPurchaseEvent },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                      {label}
                    </label>
                    <select
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 text-[12px] text-neutral-100 px-3 py-2 focus:border-yellow-500/50 focus:outline-none transition"
                    >
                      {eventDefs.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Top Pages + Top Products */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <SectionCard title="🔗 Top Pages" subtitle="Most visited URLs">
              {topUrls.length ? (
                <HorizontalBars rows={topUrls} />
              ) : (
                <EmptyState message="No page data" />
              )}
            </SectionCard>

            <SectionCard
              title="🏆 Top Products"
              subtitle="Most viewed products"
              actions={
                <input
                  value={productPropKey}
                  onChange={(e) => setProductPropKey(e.target.value)}
                  className="w-28 sm:w-36 rounded-lg border border-neutral-700 bg-neutral-900/80 text-[11px] text-neutral-100 px-2 py-1.5 focus:border-yellow-500/50 focus:outline-none transition"
                  placeholder="productId"
                />
              }
            >
              {topProducts.length ? (
                <HorizontalBars rows={topProducts} />
              ) : (
                <EmptyState message="No product data" />
              )}
            </SectionCard>
          </div>

          {/* India Geography */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <SectionCard title="🗺️ India States" subtitle={`Top states by ${pageviewEvent}`}>
              {indiaStates.length ? (
                <IndiaStateHeatMap rows={indiaStates} />
              ) : (
                <EmptyState message="No geographic data" />
              )}
            </SectionCard>

            <SectionCard title="🏙️ India Cities" subtitle={`Top cities by ${pageviewEvent}`}>
              {indiaCities.length ? (
                <HorizontalBars rows={indiaCities} />
              ) : (
                <EmptyState message="No city data" />
              )}
            </SectionCard>
          </div>

          {/* Active Users + Traffic Sources */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <SectionCard title="👥 Active Users" subtitle={`Top users by ${pageviewEvent}`}>
              {activeUsers.length === 0 ? (
                <EmptyState message="No user activity" />
              ) : (
                <div className="rounded-xl overflow-hidden border border-neutral-800/60 overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-800/60">
                    <thead className="bg-neutral-900/60">
                      <tr>
                        <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">
                          Events
                        </th>
                        <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider hidden sm:table-cell">
                          Last seen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/40">
                      {activeUsers.map((u) => (
                        <tr
                          key={u.distinct_id}
                          className="bg-neutral-950/20 hover:bg-neutral-900/50 transition cursor-pointer group"
                          onClick={() => {
                            if (u.name) {
                              navigate(`/users/${u.distinct_id}`);
                              return;
                            }
                            loadSelectedUser(u.distinct_id);
                          }}
                        >
                          <td className="px-3 sm:px-4 py-2.5">
                            <div className="text-[12px] text-neutral-200 group-hover:text-yellow-200 transition">
                              {u.name ? (
                                <Link
                                  to={`/users/${u.distinct_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:underline font-medium"
                                >
                                  {u.name}
                                </Link>
                              ) : (
                                <span className="text-neutral-400">Anonymous</span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-500 mt-0.5 truncate max-w-[120px] sm:max-w-[180px]">
                              {u.distinct_id}
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-300">
                              {formatNumber(u.count)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 text-[11px] text-neutral-400 hidden sm:table-cell">
                            {u.last_seen ? String(u.last_seen).split(" ")[0] : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="🚀 Traffic Sources" subtitle={`Where ${pageviewEvent} came from`}>
              {trafficSources.length ? (
                <HorizontalBars rows={trafficSources} />
              ) : (
                <EmptyState message="No traffic data" />
              )}
            </SectionCard>
          </div>

          {/* User Activity Panel */}
          {selectedDistinctId && (
            <div className="mt-6">
              <SectionCard
                title="🔍 User Activity"
                subtitle={selectedDistinctId}
                actions={
                  <button
                    onClick={() => {
                      setSelectedDistinctId(null);
                      setSelectedEvents([]);
                    }}
                    className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 transition"
                  >
                    ✕ Close
                  </button>
                }
              >
                {selectedEvents.length === 0 ? (
                  <EmptyState message="No events for this user" />
                ) : (
                  <div className="rounded-xl overflow-hidden border border-neutral-800/60 overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-800/60">
                      <thead className="bg-neutral-900/60">
                        <tr>
                          <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Time</th>
                          <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Event</th>
                          <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider hidden md:table-cell">Location</th>
                          <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider hidden lg:table-cell">URL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/40">
                        {selectedEvents.slice(0, 40).map((r, idx) => (
                          <tr key={idx} className="bg-neutral-950/20 hover:bg-neutral-900/30 transition">
                            <td className="px-3 sm:px-4 py-2.5 text-[11px] text-neutral-400 whitespace-nowrap">
                              {r.timestamp?.split(" ")[1] || r.timestamp}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-300">
                                {r.event}
                              </span>
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 text-[11px] text-neutral-400 hidden md:table-cell">
                              {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 text-[11px] text-neutral-500 hidden lg:table-cell truncate max-w-[200px]">
                              {r.url || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* Recent Activity */}
          <div className="mt-6">
            <SectionCard title="⚡ Recent Activity" subtitle="Latest captured events">
              {recent.length === 0 ? (
                <EmptyState message="No recent events" />
              ) : (
                <div className="rounded-xl overflow-hidden border border-neutral-800/60 overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-800/60">
                    <thead className="bg-neutral-900/60">
                      <tr>
                        <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Time</th>
                        <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Event</th>
                        <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider hidden sm:table-cell">URL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/40">
                      {recent.map((r, idx) => (
                        <tr key={idx} className="bg-neutral-950/20 hover:bg-neutral-900/30 transition">
                          <td className="px-3 sm:px-4 py-2.5 text-[11px] text-neutral-400 whitespace-nowrap">
                            {r.timestamp?.split(" ")[1] || r.timestamp}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center w-fit px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-300">
                                {r.event}
                              </span>
                              {r.distinct_id && (
                                <span className="text-[10px] text-neutral-500 truncate max-w-[100px] sm:max-w-[150px]">
                                  {r.distinct_id}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 text-[11px] text-neutral-500 hidden sm:table-cell truncate max-w-[200px]">
                            {r.url || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
