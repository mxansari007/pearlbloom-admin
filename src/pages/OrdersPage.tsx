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

const PAGE_SIZES = [10, 20, 50] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
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

  const fetchPage = useCallback(
    async (opts: {
      pageIndex: number;
      startAfterDoc: QueryDocumentSnapshot<DocumentData> | null;
    }) => {
      const constraints: QueryConstraint[] = [];
      constraints.push(...buildStatusConstraints());
      constraints.push(orderBy("createdAt", "desc"));
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
    [buildStatusConstraints, pageSize, resolveUser]
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
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
            >
              <option value="all">All</option>
              <option value="open">Open (pending → shipped)</option>
              <option value="closed">Closed (delivered / canceled)</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400">Page size</span>
            <select
              value={pageSize}
              onChange={(e) =>
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
              }
              className="rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order id, customer, status…"
            className="w-full md:w-80 rounded-lg border border-neutral-700 bg-neutral-900 text-[12px] text-neutral-100 px-3 py-2 placeholder:text-neutral-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={loading}
            onClick={loadFirstPage}
            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition disabled:opacity-60"
          >
            Refresh
          </button>
          <button
            disabled={loading || pageIndex === 0}
            onClick={loadPrevPage}
            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition disabled:opacity-60"
          >
            Prev
          </button>
          <button
            disabled={loading || !hasNext}
            onClick={loadNextPage}
            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition disabled:opacity-60"
          >
            Next
          </button>
          <span className="text-[11px] text-neutral-500">
            Page {pageIndex + 1}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-700 bg-red-900/10 p-4 text-[12px] text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden border border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-neutral-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-neutral-400">
                  Loading orders…
                </td>
              </tr>
            )}

            {!loading && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-neutral-400">
                  No orders found.
                </td>
              </tr>
            )}

            {!loading &&
              filteredOrders.map((o) => (
                <tr key={o.id} className="bg-neutral-950/40 hover:bg-neutral-900/40 transition">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <Link to={`/orders/${o.id}`} className="text-sm font-medium text-yellow-200 hover:underline">
                        #{o.displayId || o.id}
                      </Link>
                      <span className="text-[11px] text-neutral-400">
                        {formatOrderDate(o.createdAt)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-neutral-200">
                      {o.user?.name || "—"}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {o.user?.phone || o.user?.email || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-neutral-200">
                    {o.currency || "INR"}{" "}
                    {typeof o.total === "number"
                      ? o.total.toLocaleString("en-IN")
                      : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-200">
                      {o.status || "pending"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/orders/${o.id}`}
                      className="text-[11px] rounded-full border border-yellow-500/60 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
