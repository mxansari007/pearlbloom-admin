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
      <table className="w-full text-sm border border-neutral-800 rounded-xl overflow-hidden">
        <thead className="bg-neutral-900">
          <tr>
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Price</th>
            <th className="text-left px-4 py-3">Collection</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t border-neutral-800">
              <td className="px-4 py-3">
                {p.name || <span className="text-neutral-500">Untitled</span>}
              </td>
              <td className="px-4 py-3">
                {p.currency} {(p.price ?? 0).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3">{p.collectionId || "—"}</td>
              <td className="px-4 py-3 text-right space-x-2">
                <Link
                  to={`/products/${p.id}`}
                  className="text-xs px-3 py-1 rounded-full bg-neutral-800"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs px-3 py-1 rounded-full bg-red-600/80"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td
                className="px-4 py-4 text-center text-neutral-400"
                colSpan={4}
              >
                No products yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AdminLayout>
  );
}
