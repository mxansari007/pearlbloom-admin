import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { Timestamp } from "firebase/firestore";

type OrderDetail = {
  id: string;
  status?: string;
  total?: number;
  currency?: string;
  user?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  items?: Array<{
    name?: string;
    sku?: string;
    qty?: number;
    price?: number;
  }>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: any;
};

const STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "canceled",
];

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

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

  const resolveUser = async (data: any): Promise<OrderDetail["user"] | undefined> => {
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
      if (!orderId) return;
      try {
        const snap = await getDoc(doc(db, "orders", orderId));
        if (!snap.exists()) {
          setError("Order not found");
          return;
        }
        const data = snap.data() as any;
        const detail: OrderDetail = {
          id: snap.id,
          status: data?.status || "pending",
          total: data?.total,
          currency: data?.currency || "INR",
          user: await resolveUser(data),
          shippingAddress: data?.shippingAddress,
          items: data?.items,
          createdAt: data?.createdAt,
          updatedAt: data?.updatedAt,
          ...data,
        };
        setOrder(detail);
        setStatus(detail.status || "pending");
      } catch (err: any) {
        setError(err?.message || "Failed to load order");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const handleSaveStatus = async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status,
        updatedAt: serverTimestamp(),
      });
      setSavedMsg("Order status updated.");
      setOrder((prev) => (prev ? { ...prev, status } : prev));
    } catch (err: any) {
      setError(err?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const formatAddress = (addr?: OrderDetail["shippingAddress"]) => {
    if (!addr) return "—";
    const parts = [
      addr.line1,
      addr.line2,
      addr.city,
      addr.state,
      addr.postalCode,
      addr.country,
    ].filter(Boolean);
    return parts.join(", ");
  };

  return (
    <AdminLayout
      title={`Order #${orderId}`}
      subtitle="View order details and manage its status."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/orders"
            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
          >
            Back to Orders
          </Link>
        </div>
      }
    >
      {loading && (
        <div className="rounded-2xl border border-neutral-800 p-6 text-neutral-300">
          Loading…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-700 bg-red-900/10 p-6 text-red-300">
          {error}
        </div>
      )}

      {!loading && order && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Customer
              </h2>
              <div className="text-sm">
                <div className="text-neutral-100">{order.user?.name || "—"}</div>
                <div className="text-neutral-400 mt-1">
                  {order.user?.phone || order.user?.email || "—"}
                </div>
                <div className="text-neutral-300 mt-2">
                  {formatAddress(order.shippingAddress)}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Items
              </h2>
              {!order.items || order.items.length === 0 ? (
                <p className="text-sm text-neutral-400">No items on record.</p>
              ) : (
                <div className="rounded-xl overflow-hidden border border-neutral-800">
                  <table className="min-w-full divide-y divide-neutral-800">
                    <thead className="bg-neutral-900/60">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Item
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Qty
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Price
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {order.items?.map((it, idx) => (
                        <tr key={idx} className="bg-neutral-950/40">
                          <td className="px-4 py-2">
                            <div className="text-sm text-neutral-200">
                              {it.name || it.sku || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-neutral-300">
                            {typeof it.qty === "number" ? it.qty : "—"}
                          </td>
                          <td className="px-4 py-2 text-neutral-300">
                            {(order.currency || "INR")}{" "}
                            {typeof it.price === "number"
                              ? it.price.toLocaleString("en-IN")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Order ID</span>
                  <span className="text-neutral-200">#{order.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Created</span>
                  <span className="text-neutral-200">
                    {order.createdAt?.toDate
                      ? order.createdAt.toDate().toLocaleString("en-IN")
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Total</span>
                  <span className="text-neutral-200">
                    {(order.currency || "INR")}{" "}
                    {typeof order.total === "number"
                      ? order.total.toLocaleString("en-IN")
                      : "—"}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Status
              </h2>
              <div className="space-y-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-100 px-3 py-2"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  disabled={saving}
                  onClick={handleSaveStatus}
                  className="w-full text-[12px] rounded-lg border border-yellow-500/60 px-3 py-2 text-yellow-200 hover:bg-yellow-500/10 transition disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save status"}
                </button>
                {savedMsg && (
                  <p className="text-[11px] text-green-300">{savedMsg}</p>
                )}
                {error && (
                  <p className="text-[11px] text-red-300">{error}</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Actions
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/orders")}
                  className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
                >
                  Back
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
