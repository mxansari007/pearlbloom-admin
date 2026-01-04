import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, collection, getDocs, orderBy, query } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import {
  type DocumentData,
  type QueryDocumentSnapshot,
  Timestamp,
  limit,
  startAfter,
} from "firebase/firestore";

type UserRow = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  createdAt?: Timestamp | number;
  raw?: Record<string, any>;
};

const PAGE_SIZES = [10, 20, 50] as const;

const UserRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="mt-2 h-3 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-6 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="mt-2 h-3 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-6 py-4">
      <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-6 py-4 text-right">
      <div className="h-7 bg-neutral-700 rounded-full w-12 inline-block"></div>
    </td>
  </tr>
);

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const formatDate = (value: unknown) => {
    if (!value) return "—";
    if (typeof value === "number") return new Date(value).toLocaleString("en-IN");
    if (typeof (value as any)?.toDate === "function")
      return (value as any).toDate().toLocaleString("en-IN");
    return "—";
  };

  const fetchPage = useCallback(
    async (opts: {
      pageIndex: number;
      startAfterDoc: QueryDocumentSnapshot<DocumentData> | null;
    }) => {
      const constraints: any[] = [orderBy("createdAt", "desc"), limit(pageSize)];
      if (opts.startAfterDoc) constraints.splice(1, 0, startAfter(opts.startAfterDoc));

      const snap = await getDocs(query(collection(db, "users"), ...constraints));
      const docs = snap.docs;

      const items: UserRow[] = docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: composeName(data) ?? data?.fullName ?? data?.displayName,
          phone: data?.phone,
          email: data?.email,
          createdAt: data?.createdAt,
          raw: data,
        };
      });

      const lastDoc = docs.length ? docs[docs.length - 1] : null;
      setUsers(items);
      setHasNext(docs.length === pageSize);
      setPageIndex(opts.pageIndex);
      setPageCursors((prev) => {
        const next = [...prev];
        next[opts.pageIndex] = lastDoc;
        return next;
      });
    },
    [composeName, pageSize]
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
      setError(err?.message || "Failed to load users");
      setUsers([]);
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

  const q = search.trim().toLowerCase();
  const filteredUsers =
    q.length === 0
      ? users
      : users.filter((u) => {
          const haystack = [u.id, u.name, u.phone, u.email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });

  return (
    <AdminLayout title="Users" subtitle="Browse and manage customer profiles.">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
            placeholder="Search by id, name, phone, email…"
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
          <span className="text-[11px] text-neutral-500">Page {pageIndex + 1}</span>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-neutral-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {loading &&
              Array.from({ length: pageSize }).map((_, i) => (
                <UserRowSkeleton key={i} />
              ))}

            {!loading && filteredUsers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-neutral-400"
                >
                  No users found.
                </td>
              </tr>
            )}

            {!loading &&
              filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className="bg-neutral-950/40 hover:bg-neutral-900/40 transition"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-sm text-neutral-200">
                        {u.name || "—"}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {u.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-neutral-200">
                      {u.phone || "—"}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {u.email || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-neutral-300 text-sm">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/users/${u.id}`}
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

