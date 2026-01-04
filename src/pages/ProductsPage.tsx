// src/pages/ProductsPage.tsx
import { useEffect, useState } from "react";
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
};

const ProductRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-4 sm:px-6 py-4">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
      <div className="h-3 bg-neutral-700 rounded w-1/2 mt-2"></div>
    </td>
    <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
      <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
      <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
    </td>
    <td className="px-4 sm:px-6 py-4 text-right">
      <div className="flex justify-end gap-2">
        <div className="h-7 w-14 bg-neutral-700 rounded-full"></div>
        <div className="h-7 w-16 bg-neutral-700 rounded-full hidden sm:block"></div>
      </div>
    </td>
  </tr>
);

// Mobile product card for small screens
const ProductCard = ({ product, onDelete }: { product: Product; onDelete: (id: string) => void }) => (
  <div className="p-4 border-b border-neutral-800/60 last:border-b-0">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <Link to={`/products/${product.id}`} className="font-medium text-white hover:text-yellow-200 transition text-sm">
          {product.name || "Untitled product"}
        </Link>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-neutral-300">
            {product.currency} {product.price.toLocaleString("en-IN")}
          </span>
          {product.collectionId && (
            <span className="text-[10px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">
              {product.collectionId}
            </span>
          )}
        </div>
        {product.isFeatured && (
          <span className="mt-2 inline-block rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] px-2 py-0.5">
            ⭐ Featured
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to={`/products/${product.id}`}
          className="rounded-full bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-[11px] transition"
        >
          Edit
        </Link>
        <button
          onClick={() => onDelete(product.id)}
          className="rounded-full bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 text-[11px] transition"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
);

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Use cached products list to reduce reads
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
    // Invalidate cache so next load gets fresh data
    invalidateCache("products:list");
    invalidateCache("dashboard:counts");
  };

  return (
    <AdminLayout
      title="Products"
      subtitle="Manage all jewellery pieces in your catalogue."
      actions={
        <Link
          to="/products/new"
          className="rounded-full bg-yellow-500 text-black px-4 py-1.5 text-xs font-medium hover:bg-yellow-400 transition"
        >
          + Add product
        </Link>
      }
    >
      {/* Mobile Card View */}
      <div className="sm:hidden">
        <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl overflow-hidden">
          {loading && (
            <div className="p-4 space-y-4 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
                    <div className="h-3 bg-neutral-700 rounded w-1/2"></div>
                  </div>
                  <div className="h-7 w-14 bg-neutral-700 rounded-full"></div>
                </div>
              ))}
            </div>
          )}
          {!loading && products.map((p) => (
            <ProductCard key={p.id} product={p} onDelete={handleDelete} />
          ))}
          {!loading && products.length === 0 && (
            <div className="p-8 text-center">
              <div className="text-4xl mb-3 opacity-40">📦</div>
              <p className="text-sm text-neutral-400 mb-2">No products yet</p>
              <Link
                to="/products/new"
                className="text-xs text-yellow-400 hover:underline"
              >
                Add your first product →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block bg-neutral-950/60 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60">
              <tr className="text-neutral-400">
                <th className="px-4 sm:px-6 py-4 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider">Product</th>
                <th className="px-4 sm:px-6 py-4 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider">Price</th>
                <th className="px-4 sm:px-6 py-4 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider hidden md:table-cell">Collection</th>
                <th className="px-4 sm:px-6 py-4 text-right text-[11px] sm:text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-800/60">
              {loading && Array.from({ length: 5 }).map((_, i) => <ProductRowSkeleton key={i} />)}
              {!loading && products.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-neutral-900/50 transition group"
                >
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex flex-col">
                      <Link to={`/products/${p.id}`} className="font-medium text-white group-hover:text-yellow-200 transition">
                        {p.name || "Untitled product"}
                      </Link>
                      {p.isFeatured && (
                        <span className="mt-1.5 inline-block w-fit rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] px-2 py-0.5">
                          ⭐ Featured
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 sm:px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-300">
                      {p.currency} {p.price.toLocaleString("en-IN")}
                    </span>
                  </td>

                  <td className="px-4 sm:px-6 py-4 text-neutral-400 text-sm hidden md:table-cell">
                    {p.collectionId ? (
                      <span className="bg-neutral-800/60 px-2 py-1 rounded text-xs">{p.collectionId}</span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>

                  <td className="px-4 sm:px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        to={`/products/${p.id}`}
                        className="rounded-full bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-[11px] font-medium transition"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="rounded-full bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 text-[11px] font-medium transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && products.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="text-4xl mb-3 opacity-40">📦</div>
                    <p className="text-sm text-neutral-400 mb-2">No products yet</p>
                    <Link
                      to="/products/new"
                      className="text-xs text-yellow-400 hover:underline"
                    >
                      Add your first product →
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </AdminLayout>
  );
}
