import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  db,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { Timestamp } from "firebase/firestore";

type Coupon = {
  code: string;
  title?: string;
  active: boolean;
  discount?: {
    type?: "percent" | "flat";
    value?: number;
    maxDiscount?: number;
  };
  appliesTo?: {
    scope?: "all" | "products" | "collections" | "categories";
    productIds?: string[];
    collectionIds?: string[];
    categories?: string[];
  };
  minSubtotal?: number;
  usageLimit?: number;
  perUserLimit?: number;
  usedCount?: number;
  startAt?: Timestamp | number;
  endAt?: Timestamp | number;
  updatedAt?: Timestamp | number;
};

const normalize = (v: unknown) => String(v ?? "").trim();

const formatDate = (value: any) => {
  try {
    if (!value) return "";
    const d =
      value instanceof Timestamp
        ? value.toDate()
        : typeof value?.toDate === "function"
          ? value.toDate()
          : typeof value === "number"
            ? new Date(value)
            : new Date(String(value));
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
};

const discountLabel = (c: Coupon) => {
  const t = c.discount?.type;
  const v = typeof c.discount?.value === "number" ? c.discount.value : undefined;
  if (!t || typeof v !== "number") return "—";
  if (t === "percent") {
    const cap = typeof c.discount?.maxDiscount === "number" ? c.discount.maxDiscount : undefined;
    return cap ? `${v}% (max ₹${cap})` : `${v}%`;
  }
  return `₹${v}`;
};

const scopeLabel = (c: Coupon) => {
  const scope = c.appliesTo?.scope ?? "all";
  if (scope === "all") return "All products";
  if (scope === "products") return "Selected products";
  if (scope === "collections") return "Selected collections";
  if (scope === "categories") return "Selected categories";
  return scope;
};

export default function CouponsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Coupon[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(collection(db, "coupons"));
        const rows: Coupon[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            code: String(data.code ?? d.id ?? "").toUpperCase(),
            title: typeof data.title === "string" ? data.title : undefined,
            active: Boolean(data.active),
            discount: data.discount && typeof data.discount === "object" ? data.discount : undefined,
            appliesTo: data.appliesTo && typeof data.appliesTo === "object" ? data.appliesTo : undefined,
            minSubtotal: typeof data.minSubtotal === "number" ? data.minSubtotal : undefined,
            usageLimit: typeof data.usageLimit === "number" ? data.usageLimit : undefined,
            perUserLimit: typeof data.perUserLimit === "number" ? data.perUserLimit : undefined,
            usedCount: typeof data.usedCount === "number" ? data.usedCount : undefined,
            startAt: data.startAt,
            endAt: data.endAt,
            updatedAt: data.updatedAt,
          };
        });

        rows.sort((a, b) => {
          const ad = (a.updatedAt as any)?.toMillis?.() ?? (a.updatedAt as any) ?? 0;
          const bd = (b.updatedAt as any)?.toMillis?.() ?? (b.updatedAt as any) ?? 0;
          return bd - ad;
        });

        setItems(rows);
      } catch (e: any) {
        setError(e?.message || "Failed to load coupons");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query).toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const code = normalize(c.code).toLowerCase();
      const title = normalize(c.title).toLowerCase();
      return code.includes(q) || title.includes(q);
    });
  }, [items, query]);

  const toggleActive = async (c: Coupon) => {
    setError(null);
    try {
      await updateDoc(doc(db, "coupons", c.code), {
        active: !c.active,
        updatedAt: serverTimestamp(),
      });
      setItems((prev) =>
        prev.map((x) => (x.code === c.code ? { ...x, active: !x.active } : x))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update coupon");
    }
  };

  const deleteCoupon = async (c: Coupon) => {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    setError(null);
    try {
      await deleteDoc(doc(db, "coupons", c.code));
      setItems((prev) => prev.filter((x) => x.code !== c.code));
    } catch (e: any) {
      setError(e?.message || "Failed to delete coupon");
    }
  };

  return (
    <AdminLayout
      title="Coupons"
      subtitle="Create promo codes, control eligibility and discount rules."
      actions={
        <Link
          to="/coupons/new"
          className="rounded-full bg-yellow-500 text-black px-4 py-1.5 text-xs font-medium hover:bg-yellow-400 transition"
        >
          + New coupon
        </Link>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code or title…"
          className="w-full md:max-w-md rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
        />
        <div className="text-xs text-neutral-400">
          {loading ? "Loading…" : `${filtered.length} coupon${filtered.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950/70">
            <tr className="text-neutral-400">
              <th className="px-5 py-3 text-left text-xs font-medium">Code</th>
              <th className="px-5 py-3 text-left text-xs font-medium">Discount</th>
              <th className="px-5 py-3 text-left text-xs font-medium">Applies to</th>
              <th className="px-5 py-3 text-left text-xs font-medium">Dates</th>
              <th className="px-5 py-3 text-left text-xs font-medium">Limits</th>
              <th className="px-5 py-3 text-right text-xs font-medium">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-800">
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-neutral-400">
                  No coupons found.
                </td>
              </tr>
            )}

            {filtered.map((c) => (
              <tr key={c.code} className="hover:bg-neutral-800/40 transition">
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/coupons/${encodeURIComponent(c.code)}`} className="font-medium text-neutral-100 hover:underline">
                        {c.code}
                      </Link>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          c.active
                            ? "border-green-500/40 text-green-200 bg-green-500/10"
                            : "border-neutral-700 text-neutral-300 bg-neutral-900"
                        }`}
                      >
                        {c.active ? "Active" : "Disabled"}
                      </span>
                    </div>
                    {c.title && <div className="text-[11px] text-neutral-400">{c.title}</div>}
                  </div>
                </td>
                <td className="px-5 py-4 text-neutral-200">{discountLabel(c)}</td>
                <td className="px-5 py-4 text-neutral-300">{scopeLabel(c)}</td>
                <td className="px-5 py-4 text-neutral-400">
                  <div className="text-[11px]">
                    {formatDate(c.startAt) ? `From ${formatDate(c.startAt)}` : "From anytime"}
                  </div>
                  <div className="text-[11px]">
                    {formatDate(c.endAt) ? `Until ${formatDate(c.endAt)}` : "No expiry"}
                  </div>
                </td>
                <td className="px-5 py-4 text-neutral-400">
                  <div className="text-[11px]">
                    {typeof c.minSubtotal === "number" ? `Min ₹${c.minSubtotal}` : "No min subtotal"}
                  </div>
                  <div className="text-[11px]">
                    {typeof c.usageLimit === "number"
                      ? `Uses ${c.usedCount ?? 0}/${c.usageLimit}`
                      : typeof c.usedCount === "number"
                        ? `Uses ${c.usedCount}`
                        : "No usage cap"}
                  </div>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-950 transition"
                    >
                      {c.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCoupon(c)}
                      className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-neutral-400">
                  Loading coupons…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

