import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  db,
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { Timestamp } from "firebase/firestore";

type Order = {
  id: string;
  status?: string;
  total?: number;
  currency?: string;
  user?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  createdAt?: Timestamp;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const composeName = (obj: any): string | undefined => {
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
  };

  const resolveUser = async (data: any): Promise<Order["user"] | undefined> => {
    try {
      if (data?.user && (data.user.name || data.user.phone || data.user.email)) {
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
        const q = query(collection(db, "users"), where("phone", "==", data.userPhone));
        const uSnaps = await getDocs(q);
        const first = uSnaps.docs[0]?.data() as any | undefined;
        if (first) return { name: composeName(first), phone: first?.phone, email: first?.email };
      }

      if (data?.userEmail) {
        const q = query(collection(db, "users"), where("email", "==", data.userEmail));
        const uSnaps = await getDocs(q);
        const first = uSnaps.docs[0]?.data() as any | undefined;
        if (first) return { name: composeName(first), phone: first?.phone, email: first?.email };
      }
    } catch {}

    const fallback = {
      name:
        composeName(data) ??
        data?.userName,
      phone: data?.userPhone,
      email: data?.userEmail,
    };
    if (fallback.name || fallback.phone || fallback.email) return fallback;
    return undefined;
  };

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "orders"));
        const items: Order[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as any;
            const user = await resolveUser(data);
            return {
              id: d.id,
              status: data?.status,
              total: data?.total,
              currency: data?.currency || "INR",
              user,
              createdAt: data?.createdAt,
            };
          })
        );
        setOrders(items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AdminLayout
      title="Orders"
      subtitle="Review customer orders and manage their status."
    >
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

            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-neutral-400">
                  No orders found.
                </td>
              </tr>
            )}

            {!loading &&
              orders.map((o) => (
                <tr key={o.id} className="bg-neutral-950/40 hover:bg-neutral-900/40 transition">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <Link to={`/orders/${o.id}`} className="text-sm font-medium text-yellow-200 hover:underline">
                        #{o.id}
                      </Link>
                      <span className="text-[11px] text-neutral-400">
                        {o.createdAt?.toDate
                          ? o.createdAt.toDate().toLocaleString("en-IN")
                          : "—"}
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
