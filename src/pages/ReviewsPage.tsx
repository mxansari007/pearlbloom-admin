import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, collection, getDocs, deleteDoc, doc, query, orderBy } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { limit as fsLimit } from "firebase/firestore";

export type Review = {
  id?: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  text: string;
  createdAt: string;
  verified: boolean;
};

type ProductLite = {
  id: string;
  name?: string;
};

const toDateText = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleString("en-IN");
};

const clampRating = (n: unknown) => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5, Math.round(v)));
};

const normalize = (v: unknown) => String(v ?? "").toLowerCase();

const ReviewRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-5 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="mt-2 h-3 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-5 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="mt-2 h-3 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-5 py-4">
      <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-5 py-4">
      <div className="h-4 bg-neutral-700 rounded w-full"></div>
    </td>
    <td className="px-5 py-4">
      <div className="h-4 bg-neutral-700 rounded w-2/3"></div>
    </td>
    <td className="px-5 py-4 text-right">
      <div className="flex justify-end gap-2">
        <div className="h-7 w-12 bg-neutral-700 rounded-full"></div>
        <div className="h-7 w-16 bg-neutral-700 rounded-full"></div>
      </div>
    </td>
  </tr>
);

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductLite>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Review | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [revSnap, prodSnap] = await Promise.all([
          getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), fsLimit(500))),
          getDocs(query(collection(db, "products"), fsLimit(2000))),
        ]);

        const revs: Review[] = revSnap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              productId: String(data?.productId || ""),
              userId: String(data?.userId || ""),
              userName: String(data?.userName || ""),
              rating: clampRating(data?.rating),
              text: String(data?.text || ""),
              createdAt: String(data?.createdAt || ""),
              verified: !!data?.verified,
            };
          })
          .filter((r) => r.productId && r.userId);

        const prodMap: Record<string, ProductLite> = {};
        prodSnap.docs.forEach((d) => {
          const data = d.data() as any;
          const name = typeof data?.name === "string" ? data.name : undefined;
          prodMap[d.id] = { id: d.id, name };
        });

        setReviews(revs);
        setProductsById(prodMap);
      } catch (err: any) {
        setError(err?.message || "Failed to load reviews");
        setReviews([]);
        setProductsById({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const productsForFilter = useMemo(() => {
    const list = Object.values(productsById)
      .map((p) => ({ id: p.id, name: p.name || p.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [productsById]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    return reviews.filter((r) => {
      if (ratingFilter !== "all" && r.rating !== ratingFilter) return false;
      if (verifiedFilter === "verified" && !r.verified) return false;
      if (verifiedFilter === "unverified" && r.verified) return false;
      if (productFilter !== "all" && r.productId !== productFilter) return false;
      if (!q) return true;

      const prodName = productsById[r.productId]?.name || "";
      return (
        normalize(r.userName).includes(q) ||
        normalize(r.userId).includes(q) ||
        normalize(r.productId).includes(q) ||
        normalize(prodName).includes(q) ||
        normalize(r.text).includes(q)
      );
    });
  }, [reviews, search, ratingFilter, verifiedFilter, productFilter, productsById]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const verifiedCount = filtered.filter((r) => r.verified).length;
    const avg =
      total > 0
        ? filtered.reduce((s, r) => s + (Number.isFinite(r.rating) ? r.rating : 0), 0) / total
        : 0;
    const avgRounded = Math.round(avg * 10) / 10;
    return { total, verifiedCount, avgRounded };
  }, [filtered]);

  const deleteReview = async (r: Review) => {
    if (!r.id) return;
    const ok = confirm("Delete this review? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "reviews", r.id));
      setReviews((prev) => prev.filter((x) => x.id !== r.id));
      setSelected((prev) => (prev?.id === r.id ? null : prev));
    } catch (err: any) {
      alert(err?.message || "Delete failed");
    }
  };

  return (
    <AdminLayout
      title="Reviews"
      subtitle="Moderate feedback, spot issues early, and surface best social proof."
      actions={
        <div className="flex items-center gap-2">
          <span className="text-[11px] rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300">
            {stats.total} shown
          </span>
          <span className="text-[11px] rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300">
            Avg {stats.avgRounded}
          </span>
          <span className="text-[11px] rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300">
            {stats.verifiedCount} verified
          </span>
        </div>
      }
    >
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, product, text, IDs…"
            className="md:col-span-2 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />

          <select
            value={String(ratingFilter)}
            onChange={(e) =>
              setRatingFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="all">All ratings</option>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
            <option value="0">0 star</option>
          </select>

          <select
            value={verifiedFilter}
            onChange={(e) => setVerifiedFilter(e.target.value as any)}
            className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="all">All reviews</option>
            <option value="verified">Verified purchases</option>
            <option value="unverified">Unverified</option>
          </select>

          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="md:col-span-2 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="all">All products</option>
            {productsForFilter.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setRatingFilter("all");
              setVerifiedFilter("all");
              setProductFilter("all");
            }}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-950 transition"
          >
            Reset filters
          </button>
        </div>
      </section>

      {loading && (
        <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-neutral-900/60 animate-pulse">
          <table className="min-w-full divide-y divide-neutral-800 text-sm">
            <thead className="bg-neutral-950/80">
              <tr className="text-neutral-400">
                <th className="px-5 py-3 text-left text-xs font-medium">Product</th>
                <th className="px-5 py-3 text-left text-xs font-medium">User</th>
                <th className="px-5 py-3 text-left text-xs font-medium">Rating</th>
                <th className="px-5 py-3 text-left text-xs font-medium">Review</th>
                <th className="px-5 py-3 text-left text-xs font-medium">Created</th>
                <th className="px-5 py-3 text-right text-xs font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {Array.from({ length: 10 }).map((_, i) => (
                <ReviewRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-700 bg-red-900/10 p-6 text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-neutral-900/60">
          <table className="min-w-full divide-y divide-neutral-800 text-sm">
            <thead className="bg-neutral-950/80">
              <tr className="text-neutral-400">
                <th className="px-5 py-3 text-left text-xs font-medium">Product</th>
                <th className="px-5 py-3 text-left text-xs font-medium">User</th>
                <th className="px-5 py-3 text-left text-xs font-medium">Rating</th>
                <th className="px-5 py-3 text-left text-xs font-medium">Review</th>
                <th className="px-5 py-3 text-left text-xs font-medium">Created</th>
                <th className="px-5 py-3 text-right text-xs font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-neutral-400" colSpan={6}>
                    No reviews match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const productName = productsById[r.productId]?.name || r.productId;
                  const snippet =
                    r.text.length > 90 ? `${r.text.slice(0, 90).trim()}…` : r.text || "—";
                  return (
                    <tr key={r.id || `${r.productId}-${r.userId}-${r.createdAt}`} className="hover:bg-neutral-900/70 transition">
                      <td className="px-5 py-4">
                        <Link to={`/products/${r.productId}`} className="text-neutral-100 hover:underline">
                          {productName}
                        </Link>
                        <div className="text-[11px] text-neutral-500 mt-0.5">{r.productId}</div>
                      </td>
                      <td className="px-5 py-4">
                        <Link to={`/users/${r.userId}`} className="text-neutral-100 hover:underline">
                          {r.userName || "User"}
                        </Link>
                        <div className="text-[11px] text-neutral-500 mt-0.5">{r.userId}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-200 font-medium">{r.rating}/5</span>
                          {r.verified ? (
                            <span className="text-[10px] rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-[2px] text-emerald-200">
                              Verified
                            </span>
                          ) : (
                            <span className="text-[10px] rounded-full border border-neutral-700 px-2 py-[2px] text-neutral-300">
                              Unverified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-neutral-200">
                        {snippet}
                        {r.text.length > 90 && (
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="ml-2 text-[11px] text-yellow-200 hover:underline"
                          >
                            Read
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-neutral-300">{toDateText(r.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-950 transition"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteReview(r)}
                            className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSelected(null)}
          />
          <div className="absolute inset-x-0 top-16 mx-auto w-[92vw] max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-100 truncate">
                  {productsById[selected.productId]?.name || selected.productId}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {selected.userName} • {selected.rating}/5 • {toDateText(selected.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="text-[11px] text-neutral-500">Product</div>
                  <div className="text-neutral-200 mt-1 break-all">{selected.productId}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="text-[11px] text-neutral-500">User</div>
                  <div className="text-neutral-200 mt-1 break-all">{selected.userId}</div>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-[11px] text-neutral-500 mb-2">Review</div>
                <div className="text-sm text-neutral-100 whitespace-pre-wrap">
                  {selected.text || "—"}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-neutral-400">
                  {selected.verified ? "Verified purchase" : "Unverified"}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/products/${selected.productId}`}
                    className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
                  >
                    Product
                  </Link>
                  <Link
                    to={`/users/${selected.userId}`}
                    className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
                  >
                    User
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteReview(selected)}
                    className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

