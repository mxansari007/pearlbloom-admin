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

type Product = {
  id: string;
  name: string;
  price: number;
  currency: string;
  collectionId?: string;
  isFeatured?: boolean;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "products"));
      const items: Product[] = snap.docs.map((d) => {
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
      setProducts(items);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteDoc(doc(db, "products", id));
    setProducts((prev) => prev.filter((p) => p.id !== id));
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
<div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-neutral-950">
      <tr className="text-neutral-400">
        <th className="px-6 py-4 text-left font-medium">Product</th>
        <th className="px-6 py-4 text-left font-medium">Price</th>
        <th className="px-6 py-4 text-left font-medium">Collection</th>
        <th className="px-6 py-4 text-right font-medium">Actions</th>
      </tr>
    </thead>

    <tbody className="divide-y divide-neutral-800">
      {products.map((p) => (
        <tr
          key={p.id}
          className="hover:bg-neutral-800/60 transition"
        >
          {/* Product */}
          <td className="px-6 py-4">
            <div className="flex flex-col">
              <span className="font-medium text-white">
                {p.name || "Untitled product"}
              </span>

              {p.isFeatured && (
                <span className="mt-1 inline-block w-fit rounded-full bg-yellow-500/10 text-yellow-400 text-[11px] px-2 py-0.5">
                  Featured
                </span>
              )}
            </div>
          </td>

          {/* Price */}
          <td className="px-6 py-4 text-neutral-200">
            {p.currency} {p.price.toLocaleString("en-IN")}
          </td>

          {/* Collection */}
          <td className="px-6 py-4 text-neutral-400">
            {p.collectionId || "—"}
          </td>

          {/* Actions */}
          <td className="px-6 py-4 text-right">
            <div className="inline-flex items-center gap-2">
              <Link
                to={`/products/${p.id}`}
                className="rounded-full bg-neutral-800 hover:bg-neutral-700 px-3 py-1 text-xs transition"
              >
                Edit
              </Link>

              <button
                onClick={() => handleDelete(p.id)}
                className="rounded-full bg-red-600/80 hover:bg-red-600 px-3 py-1 text-xs transition"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      ))}

      {/* Empty state */}
      {products.length === 0 && (
        <tr>
          <td
            colSpan={4}
            className="px-6 py-12 text-center text-neutral-400"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm">No products yet</span>
              <Link
                to="/products/new"
                className="text-xs text-yellow-400 hover:underline"
              >
                Add your first product
              </Link>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>

    </AdminLayout>
  );
}
