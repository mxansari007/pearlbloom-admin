// src/pages/ProductsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  db,
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { getCached, invalidateCache } from "../lib/cache";

// Cache TTL for products list (2 minutes - short because products may change)
const CACHE_TTL_PRODUCTS = 2 * 60 * 1000;

type Product = {
  id: string;
  name: string;
  price: number;
  currency: string;
  collectionId?: string;
  isFeatured?: boolean;
  thumbnailUrl?: string;
  categories: string[];
  stock: number | null; // null = not tracked
  sold: number;
};

function computeStock(data: any): number | null {
  const variants = Array.isArray(data.variants) ? data.variants : [];
  if (variants.length) {
    return variants.reduce(
      (sum: number, v: any) => sum + (typeof v.stock === "number" ? v.stock : 0),
      0
    );
  }
  if (data.inventory?.trackStock) {
    return typeof data.inventory.stock === "number" ? data.inventory.stock : 0;
  }
  return null;
}

const CardSkeleton = () => (
  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 animate-pulse">
    <div className="aspect-square rounded-xl bg-neutral-800 mb-3" />
    <div className="h-3.5 bg-neutral-800 rounded w-3/4 mb-2" />
    <div className="h-3 bg-neutral-800 rounded w-1/3 mb-3" />
    <div className="h-3 bg-neutral-800 rounded w-1/2" />
  </div>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

function tabLabel(tab: string) {
  if (tab === "all") return "All Products";
  if (tab === "featured") return "Featured";
  return tab;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const items = await getCached<Product[]>(
          "products:list",
          async () => {
            const snap = await getDocs(collection(db, "products"));
            return snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                id: d.id,
                name: data.name ?? "",
                price: typeof data.price === "number" ? data.price : 0,
                currency: data.currency ?? "INR",
                collectionId: data.collectionId ?? "",
                isFeatured: !!data.isFeatured,
                thumbnailUrl:
                  data.thumbnailUrl ||
                  (Array.isArray(data.images) ? data.images[0] : "") ||
                  "",
                categories: Array.isArray(data.categories) ? data.categories : [],
                stock: computeStock(data),
                sold:
                  typeof data.soldCount === "number"
                    ? data.soldCount
                    : typeof data.sold === "number"
                      ? data.sold
                      : 0,
              };
            });
          },
          CACHE_TTL_PRODUCTS
        );
        setProducts(items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteDoc(doc(db, "products", id));
    setProducts((prev) => prev.filter((p) => p.id !== id));
    invalidateCache("products:list");
    invalidateCache("dashboard:counts");
  };

  const tabs = useMemo(() => {
    const cats = Array.from(new Set(products.flatMap((p) => p.categories)))
      .map((c) => c.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return ["all", "featured", ...cats];
  }, [products]);

  const filtered = useMemo(() => {
    let items = products;
    if (activeTab === "featured") items = items.filter((p) => p.isFeatured);
    else if (activeTab !== "all") items = items.filter((p) => p.categories.includes(activeTab));
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((p) => p.name.toLowerCase().includes(q));
    return items;
  }, [products, activeTab, query]);

  return (
    <AdminLayout
      title="Products"
      subtitle="Manage all jewellery pieces in your catalogue."
      actions={
        <Link
          to="/products/new"
          className="rounded-full bg-yellow-500 text-black px-4 py-1.5 text-xs font-medium hover:bg-yellow-400 transition"
        >
          + Add New Product
        </Link>
      }
    >
      {/* Toolbar: search */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs text-neutral-400 focus-within:text-yellow-300">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product…"
            className="w-full rounded-full bg-neutral-900/60 border border-neutral-800 pl-9 pr-4 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-yellow-500/50 transition"
          />
        </div>
        <span className="text-xs text-neutral-500 shrink-0">
          {loading ? "Loading…" : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Category tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {tabs.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition border ${
                active
                  ? "bg-yellow-500 text-black border-yellow-500"
                  : "bg-neutral-900/60 text-neutral-300 border-neutral-800 hover:border-neutral-600"
              }`}
            >
              {tabLabel(tab)}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-12 text-center">
          <div className="text-4xl mb-3 opacity-40">📦</div>
          <p className="text-sm text-neutral-400 mb-2">
            {products.length === 0 ? "No products yet" : "No products match your search"}
          </p>
          <Link to="/products/new" className="text-xs text-yellow-400 hover:underline">
            Add your first product →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3 hover:border-yellow-500/40 hover:bg-neutral-900/60 transition"
            >
              <Link to={`/products/${p.id}`} className="block">
                <div className="aspect-square rounded-xl bg-neutral-900 overflow-hidden mb-3 flex items-center justify-center">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-3xl opacity-25">💎</span>
                  )}
                </div>
                <p className="font-medium text-sm text-neutral-100 truncate" title={p.name}>
                  {p.name || "Untitled product"}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {p.currency} {p.price.toLocaleString("en-IN")}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500">
                  <span>
                    Stock <strong className="text-neutral-300">{p.stock ?? "—"}</strong>
                  </span>
                  <span>
                    Sold <strong className="text-neutral-300">{p.sold}</strong>
                  </span>
                </div>
              </Link>

              {p.isFeatured && (
                <span className="absolute top-2 left-2 rounded-full bg-yellow-500/90 text-black text-[10px] font-semibold px-2 py-0.5">
                  ★
                </span>
              )}

              {/* Hover actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <Link
                  to={`/products/${p.id}`}
                  title="Edit"
                  className="h-7 w-7 rounded-full bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 text-xs flex items-center justify-center"
                >
                  ✎
                </Link>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => handleDelete(p.id)}
                  className="h-7 w-7 rounded-full bg-red-600/80 hover:bg-red-600 text-white text-xs flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
