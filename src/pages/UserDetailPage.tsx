import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { Timestamp, limit } from "firebase/firestore";

type UserDetail = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  createdAt?: Timestamp | number;
  updatedAt?: Timestamp | number;
  [key: string]: any;
};

type UserOrder = {
  id: string;
  displayId?: string;
  status?: string;
  total?: number;
  currency?: string;
  createdAt?: Timestamp | number;
};

const formatDate = (value: unknown) => {
  if (!value) return "—";
  if (typeof value === "number") return new Date(value).toLocaleString("en-IN");
  if (typeof (value as any)?.toDate === "function")
    return (value as any).toDate().toLocaleString("en-IN");
  return "—";
};

const composeName = (obj: any): string | undefined => {
  const raw = typeof obj?.name === "string" ? obj.name : undefined;
  const fn =
    obj?.firstName ?? obj?.firstname ?? obj?.userFirstName ?? obj?.userFirstname;
  const ln =
    obj?.lastName ?? obj?.lastname ?? obj?.userLastName ?? obj?.userLastname;
  const combined = [fn, ln].filter(Boolean).join(" ").trim();
  const finalName = (raw && raw.trim().length ? raw : combined) || undefined;
  return finalName && finalName.trim().length ? finalName : undefined;
};

export default function UserDetailPage() {
  const { userId } = useParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, "users", userId));
        if (!snap.exists()) {
          setError("User not found");
          setUser(null);
          setOrders([]);
          return;
        }

        const data = snap.data() as any;
        const detail: UserDetail = {
          id: snap.id,
          name: composeName(data) ?? data?.fullName ?? data?.displayName,
          phone: data?.phone,
          email: data?.email,
          createdAt: data?.createdAt,
          updatedAt: data?.updatedAt,
          ...data,
        };
        setUser(detail);

        const ordersSnap = await getDocs(
          query(
            collection(db, "orders"),
            where("userId", "==", userId),
            orderBy("createdAt", "desc"),
            limit(25)
          )
        );
        setOrders(
          ordersSnap.docs.map((d) => {
            const o = d.data() as any;
            return {
              id: d.id,
              displayId: o?.displayId,
              status: o?.status,
              total: o?.total,
              currency: o?.currency || "INR",
              createdAt: o?.createdAt,
            };
          })
        );
      } catch (err: any) {
        setError(err?.message || "Failed to load user");
        setUser(null);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const prettyJson = useMemo(() => {
    if (!user) return "";
    try {
      const copy = { ...user };
      return JSON.stringify(copy, null, 2);
    } catch {
      return "";
    }
  }, [user]);

  return (
    <AdminLayout
      title={user ? user.name || "User" : "User"}
      subtitle={userId ? `User ID: ${userId}` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/users"
            className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
          >
            Back to Users
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

      {!loading && user && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Profile
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-[11px] text-neutral-500">Name</div>
                  <div className="text-neutral-200 mt-1">{user.name || "—"}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-[11px] text-neutral-500">Phone</div>
                  <div className="text-neutral-200 mt-1">{user.phone || "—"}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-[11px] text-neutral-500">Email</div>
                  <div className="text-neutral-200 mt-1">{user.email || "—"}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-[11px] text-neutral-500">Created</div>
                  <div className="text-neutral-200 mt-1">
                    {formatDate(user.createdAt)}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 sm:col-span-2">
                  <div className="text-[11px] text-neutral-500">Updated</div>
                  <div className="text-neutral-200 mt-1">
                    {formatDate(user.updatedAt)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Orders
              </h2>
              {orders.length === 0 ? (
                <div className="text-sm text-neutral-400">
                  No orders found for this user.
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden border border-neutral-800">
                  <table className="min-w-full divide-y divide-neutral-800">
                    <thead className="bg-neutral-900/60">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Order
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Total
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {orders.map((o) => (
                        <tr key={o.id} className="bg-neutral-950/40">
                          <td className="px-4 py-2">
                            <Link
                              to={`/orders/${o.id}`}
                              className="text-sm text-yellow-200 hover:underline"
                            >
                              #{o.displayId || o.id}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-neutral-200 text-sm">
                            {o.status || "—"}
                          </td>
                          <td className="px-4 py-2 text-neutral-200 text-sm">
                            {(o.currency || "INR")}{" "}
                            {typeof o.total === "number"
                              ? o.total.toLocaleString("en-IN")
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-neutral-300 text-sm">
                            {formatDate(o.createdAt)}
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
                Raw Data
              </h2>
              <pre className="text-[11px] text-neutral-300 whitespace-pre-wrap break-words max-h-[60vh] overflow-auto">
                {prettyJson}
              </pre>
            </section>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

