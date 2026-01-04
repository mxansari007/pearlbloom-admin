import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  db,
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import {
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  Timestamp,
  limit,
  startAfter,
} from "firebase/firestore";

type Order = {
  id: string;
  status?: string;
  displayId?: string;
  total?: number;
  currency?: string;
  user?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  createdAt?: Timestamp | number;
};

const STATUS_OPTIONS = [
  "pending",
  "paid",
  "failed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const OPEN_STATUSES: Array<(typeof STATUS_OPTIONS)[number]> = [
  "pending",
  "paid",
  "shipped",
];

const CLOSED_STATUSES: Array<(typeof STATUS_OPTIONS)[number]> = [
  "delivered",
  "failed",
  "cancelled",
];

type StatusFilter =
  | "all"
  | "open"
  | "closed"
  | (typeof STATUS_OPTIONS)[number];

type SortKey = "created_desc" | "created_asc" | "total_desc" | "total_asc";

const PAGE_SIZES = [10, 20, 50] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  pending: { bg: "bg-amber-500/15", text: "text-amber-300", icon: "⏳" },
  paid: { bg: "bg-blue-500/15", text: "text-blue-300", icon: "💳" },
  shipped: { bg: "bg-purple-500/15", text: "text-purple-300", icon: "📦" },
  delivered: { bg: "bg-emerald-500/15", text: "text-emerald-300", icon: "✅" },
  cancelled: { bg: "bg-red-500/15", text: "text-red-300", icon: "❌" },
  failed: { bg: "bg-red-500/15", text: "text-red-300", icon: "⚠️" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] sm:text-[11px] font-medium ${style.bg} ${style.text}`}>
      <span className="text-[10px]">{style.icon}</span>
      {status}
    </span>
  );
}

const OrderRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-4 sm:px-6 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="mt-2 h-3 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-4 sm:px-6 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="mt-2 h-3 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
      <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-4 sm:px-6 py-4">
      <div className="h-6 bg-neutral-700 rounded-full w-20"></div>
    </td>
    <td className="px-4 sm:px-6 py-4 text-right">
      <div className="h-7 bg-neutral-700 rounded-full w-14 inline-block"></div>
    </td>
  </tr>
);

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [pageCursors, setPageCursors] = useState<
    Array<QueryDocumentSnapshot<DocumentData> | null>
  >([]);

  const composeName = useCallback((obj: any): string | undefined => {
    const raw = typeof obj?.name === "string" ? obj.name : undefined;
    const fn =
      obj?.firstName ??
      obj?.firstname ??
      obj?.userFirstName ??
      obj?.userFirstname;
    const ln =
      obj?.lastName ??
      obj?.lastname ??
      obj?.userLastName ??
      obj?.userLastname;
    const combined = [fn, ln].filter(Boolean).join(" ").trim();
    const finalName = (raw && raw.trim().length ? raw : combined) || undefined;
    return finalName && finalName.trim().length ? finalName : undefined;
  }, []);

  const resolveUser = useCallback(
    async (data: any): Promise<Order["user"] | undefined> => {
      const nameFromAddress =
        typeof data?.address?.fullName === "string" ? data.address.fullName : undefined;
      const phoneFromDoc =
        typeof data?.phone === "string"
          ? data.phone
          : typeof data?.address?.phone === "string"
            ? data.address.phone
            : undefined;
      if (nameFromAddress || phoneFromDoc) {
        return {
          name: nameFromAddress,
          phone: phoneFromDoc,
        };
      }

      try {
        if (
          data?.user &&
          (data.user.name || data.user.phone || data.user.email)
        ) {
          return {
            name: composeName(data.user),
            phone: data.user.phone,
            email: data.user.email,
          };
        }

        const userId = data?.userId || data?.uid;
        if (userId) {
          const uSnap = await getDoc(doc(db, "users", userId));
          if (uSnap.exists()) {
            const u = uSnap.data() as any;
            return { name: composeName(u), phone: u?.phone, email: u?.email };
          }
        }

        if (data?.userPhone) {
          const q = query(
            collection(db, "users"),
            where("phone", "==", data.userPhone)
          );
          const uSnaps = await getDocs(q);
          const first = uSnaps.docs[0]?.data() as any | undefined;
          if (first)
            return {
              name: composeName(first),
              phone: first?.phone,
              email: first?.email,
            };
        }

        if (data?.userEmail) {
          const q = query(
            collection(db, "users"),
            where("email", "==", data.userEmail)
          );
          const uSnaps = await getDocs(q);
          const first = uSnaps.docs[0]?.data() as any | undefined;
          if (first)
            return {
              name: composeName(first),
              phone: first?.phone,
              email: first?.email,
            };
        }
      } catch {}

      const fallback = {
        name: composeName(data) ?? data?.userName,
        phone: data?.userPhone ?? phoneFromDoc,
        email: data?.userEmail,
      };
      if (fallback.name || fallback.phone || fallback.email) return fallback;
      return undefined;
    },
    [composeName]
  );

  const buildStatusConstraints = useCallback((): QueryConstraint[] => {
    if (statusFilter === "all") return [];
    if (statusFilter === "open") {
      return [where("status", "in", OPEN_STATUSES)];
    }
    if (statusFilter === "closed") {
      return [where("status", "in", CLOSED_STATUSES)];
    }
    return [where("status", "==", statusFilter)];
  }, [statusFilter]);

  const buildSortConstraints = useCallback((): QueryConstraint[] => {
    if (sortKey === "created_asc") return [orderBy("createdAt", "asc")];
    if (sortKey === "total_desc")
      return [orderBy("total", "desc"), orderBy("createdAt", "desc")];
    if (sortKey === "total_asc")
      return [orderBy("total", "asc"), orderBy("createdAt", "desc")];
    return [orderBy("createdAt", "desc")];
  }, [sortKey]);

  const fetchPage = useCallback(
    async (opts: {
      pageIndex: number;
      startAfterDoc: QueryDocumentSnapshot<DocumentData> | null;
    }) => {
      const constraints: QueryConstraint[] = [];
      constraints.push(...buildStatusConstraints());
      constraints.push(...buildSortConstraints());
      if (opts.startAfterDoc) constraints.push(startAfter(opts.startAfterDoc));
      constraints.push(limit(pageSize));

      const snap = await getDocs(
        query(collection(db, "orders"), ...constraints)
      );
      const docs = snap.docs;

      const items: Order[] = await Promise.all(
        docs.map(async (d) => {
          const data = d.data() as any;
          const user = await resolveUser(data);
          return {
            id: d.id,
            status: data?.status,
            displayId: data?.displayId,
            total: data?.total,
            currency: data?.currency || "INR",
            user,
            createdAt: data?.createdAt,
          };
        })
      );

      const lastDoc = docs.length ? docs[docs.length - 1] : null;
      setOrders(items);
      setHasNext(docs.length === pageSize);
      setPageIndex(opts.pageIndex);
      setPageCursors((prev) => {
        const next = [...prev];
        next[opts.pageIndex] = lastDoc;
        return next;
      });
    },
    [buildStatusConstraints, buildSortConstraints, pageSize, resolveUser]
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPageIndex(0);
      setHasNext(false);
      setPageCursors([]);
      await fetchPage({ pageIndex: 0, startAfterDoc: null });
    } catch (err: any) {
      setError(err?.message || "Failed to load orders");
      setOrders([]);
      setHasNext(false);
      setPageIndex(0);
      setPageCursors([]);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadNextPage = useCallback(async () => {
    if (loading) return;
    const cursor = pageCursors[pageIndex];
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      await fetchPage({ pageIndex: pageIndex + 1, startAfterDoc: cursor });
    } catch (err: any) {
      setError(err?.message || "Failed to load next page");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, loading, pageCursors, pageIndex]);

  const loadPrevPage = useCallback(async () => {
    if (loading) return;
    if (pageIndex <= 0) return;
    const prevIndex = pageIndex - 1;
    const startAfterDoc =
      prevIndex === 0 ? null : pageCursors[prevIndex - 1] ?? null;
    setLoading(true);
    setError(null);
    try {
      await fetchPage({ pageIndex: prevIndex, startAfterDoc });
    } catch (err: any) {
      setError(err?.message || "Failed to load previous page");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, loading, pageCursors, pageIndex]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const formatOrderDate = (value: unknown) => {
    if (!value) return "—";
    if (typeof value === "number") return new Date(value).toLocaleString("en-IN");
    if (typeof (value as any)?.toDate === "function")
      return (value as any).toDate().toLocaleString("en-IN");
    return "—";
  };

  const q = search.trim().toLowerCase();
  const filteredOrders =
    q.length === 0
      ? orders
      : orders.filter((o) => {
          const status = (o.status || "pending").toLowerCase();
          const haystack = [
            o.id,
            o.displayId,
            o.user?.name,
            o.user?.phone,
            o.user?.email,
            status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });

  return (
    <AdminLayout
      title="Orders"
      subtitle="Review customer orders and manage their status."
    >
      {/* Filters - Mobile optimized */}
      <div className="mb-4 sm:mb-6 space-y-3">
        {/* Search - Full width on mobile */}
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders..."
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950/60 text-sm text-neutral-100 px-4 py-3 pl-10 placeholder:text-neutral-500 focus:border-yellow-500/50 focus:outline-none transition"
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">🔍</span>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="flex-1 min-w-[120px] rounded-xl border border-neutral-700 bg-neutral-950/60 text-[11px] sm:text-[12px] text-neutral-100 px-3 py-2 focus:border-yellow-500/50 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="flex-1 min-w-[100px] rounded-xl border border-neutral-700 bg-neutral-950/60 text-[11px] sm:text-[12px] text-neutral-100 px-3 py-2 focus:border-yellow-500/50 focus:outline-none"
          >
            <option value="created_desc">Newest</option>
            <option value="created_asc">Oldest</option>
            <option value="total_desc">High → Low</option>
            <option value="total_asc">Low → High</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
            className="w-16 rounded-xl border border-neutral-700 bg-neutral-950/60 text-[11px] sm:text-[12px] text-neutral-100 px-2 py-2 focus:border-yellow-500/50 focus:outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              disabled={loading}
              onClick={loadFirstPage}
              className="inline-flex items-center gap-1.5 text-[11px] rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-yellow-500/10 hover:border-yellow-500/40 transition disabled:opacity-50"
            >
              <span className={loading ? "animate-spin" : ""}>↻</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={loading || pageIndex === 0}
              onClick={loadPrevPage}
              className="text-[11px] rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800 transition disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-[11px] text-neutral-400 bg-neutral-800/50 px-3 py-2 rounded-xl">
              {pageIndex + 1}
            </span>
            <button
              disabled={loading || !hasNext}
              onClick={loadNextPage}
              className="text-[11px] rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800 transition disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-950/40 to-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-medium text-red-200">Error loading orders</p>
              <p className="text-[12px] text-red-300/80 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 animate-pulse">
            <div className="flex justify-between items-start">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
                <div className="h-3 bg-neutral-700 rounded w-3/4"></div>
              </div>
              <div className="h-6 w-16 bg-neutral-700 rounded-full"></div>
            </div>
          </div>
        ))}

        {!loading && filteredOrders.length === 0 && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-8 text-center">
            <div className="text-4xl mb-3 opacity-40">📋</div>
            <p className="text-sm text-neutral-400">No orders found</p>
          </div>
        )}

        {!loading && filteredOrders.map((o) => (
          <Link
            key={o.id}
            to={`/orders/${o.id}`}
            className="block rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 hover:border-yellow-500/40 hover:bg-neutral-900/60 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-yellow-200">
                    #{o.displayId || o.id.slice(0, 8)}
                  </span>
                  <StatusBadge status={o.status || "pending"} />
                </div>
                <div className="text-xs text-neutral-400 mt-1">
                  {o.user?.name || "Anonymous"} · {formatOrderDate(o.createdAt)?.split(",")[0]}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold text-emerald-300">
                  {o.currency || "₹"} {typeof o.total === "number" ? o.total.toLocaleString("en-IN") : "—"}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/60">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-800/60">
            <thead className="bg-neutral-900/60">
              <tr>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Order</th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Customer</th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider hidden md:table-cell">Total</th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Status</th>
                <th className="px-4 sm:px-6 py-3.5 text-right text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/40">
              {loading && Array.from({ length: pageSize }).map((_, i) => <OrderRowSkeleton key={i} />)}

              {!loading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="text-4xl mb-3 opacity-40">📋</div>
                    <p className="text-sm text-neutral-400">No orders found</p>
                  </td>
                </tr>
              )}

              {!loading && filteredOrders.map((o) => (
                <tr key={o.id} className="bg-neutral-950/20 hover:bg-neutral-900/50 transition group">
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex flex-col">
                      <Link to={`/orders/${o.id}`} className="text-sm font-medium text-yellow-200 hover:underline group-hover:text-yellow-100">
                        #{o.displayId || o.id.slice(0, 8)}
                      </Link>
                      <span className="text-[10px] sm:text-[11px] text-neutral-500 mt-0.5">
                        {formatOrderDate(o.createdAt)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="text-sm text-neutral-200">
                      {o.user?.name || <span className="text-neutral-500">Anonymous</span>}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-0.5 truncate max-w-[150px]">
                      {o.user?.phone || o.user?.email || "—"}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-300">
                      {o.currency || "₹"} {typeof o.total === "number" ? o.total.toLocaleString("en-IN") : "—"}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <StatusBadge status={o.status || "pending"} />
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-right">
                    <Link
                      to={`/orders/${o.id}`}
                      className="text-[11px] rounded-full border border-yellow-500/50 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 hover:border-yellow-500 transition font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
