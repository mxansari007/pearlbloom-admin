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
import { generateInvoicePdf, type InvoiceLineItem, type InvoiceOrder, type InvoiceSellerProfile } from "../lib/invoicePdf";

type OrderDetail = {
  id: string;
  userId?: string;
  phone?: string;
  displayId?: string;

  status?: string;
  items?: Array<{
    productId?: string;
    variantId?: string;
    name?: string;
    variantLabel?: string;
    price?: number;
    quantity?: number;
    qty?: number;
    image?: string;
    sku?: string;
    slug?: string;
  }>;

  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  user?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  address?: {
    fullName?: string;
    phone?: string;
    line1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  createdAt?: Timestamp | number;
  updatedAt?: Timestamp | number;
  payment?: {
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  };
  tracking?: {
    awb?: string;
    carrier?: string;
    trackingUrl?: string;
    events?: { status: string; location?: string; timestamp: string; message?: string }[];
  };
  [key: string]: any;
};

const STATUS_OPTIONS = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "shipped",
  "delivered",
];

const OrderDetailPageSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
    <div className="md:col-span-2 space-y-6">
      {/* Customer */}
      <div className="rounded-2xl border border-neutral-800 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/4 mb-4"></div>
        <div className="h-4 bg-neutral-800 rounded w-3/4"></div>
        <div className="mt-2 h-4 bg-neutral-800 rounded w-1/2"></div>
        <div className="mt-2 h-4 bg-neutral-800 rounded w-full"></div>
      </div>
      {/* Items */}
      <div className="rounded-2xl border border-neutral-800 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/4 mb-4"></div>
        <div className="h-32 bg-neutral-800 rounded-xl"></div>
      </div>
    </div>
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-2xl border border-neutral-800 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-neutral-800 rounded w-full"></div>
          <div className="h-4 bg-neutral-800 rounded w-full"></div>
          <div className="h-4 bg-neutral-800 rounded w-full"></div>
          <div className="h-4 bg-neutral-800 rounded w-full"></div>
        </div>
      </div>
      {/* Status */}
      <div className="rounded-2xl border border-neutral-800 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/4 mb-4"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
        <div className="mt-3 h-8 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>
  </div>
);

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
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
    const nameFromAddress =
      typeof data?.address?.fullName === "string" ? data.address.fullName : undefined;
    const phoneFromDoc =
      typeof data?.phone === "string"
        ? data.phone
        : typeof data?.address?.phone === "string"
          ? data.address.phone
          : undefined;
    if (nameFromAddress || phoneFromDoc) {
      return {
        name: nameFromAddress,
        phone: phoneFromDoc,
      };
    }

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
      phone: data?.userPhone ?? phoneFromDoc,
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
          displayId: data?.displayId,
          phone: data?.phone,
          address: data?.address ?? data?.shippingAddress,
          items: data?.items,
          subtotal: data?.subtotal,
          shipping: data?.shipping,
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
      const useNumberTimestamps =
        typeof order?.createdAt === "number" || typeof order?.updatedAt === "number";
      await updateDoc(doc(db, "orders", orderId), {
        status,
        updatedAt: useNumberTimestamps ? Date.now() : serverTimestamp(),
      });
      setSavedMsg("Order status updated.");
      setOrder((prev) => (prev ? { ...prev, status } : prev));
    } catch (err: any) {
      setError(err?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const formatAddress = (addr?: OrderDetail["address"]) => {
    if (!addr) return "—";
    const parts = [
      addr.fullName,
      addr.phone,
      addr.line1,
      addr.city,
      addr.state,
      addr.postalCode,
      addr.country,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const formatAddressMultiline = (addr?: OrderDetail["address"]) => {
    if (!addr) return "";
    const lines = [
      addr.line1,
      [addr.city, addr.state].filter(Boolean).join(", "),
      addr.postalCode,
      addr.country,
    ]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);
    return lines.join("\n");
  };

  const formatOrderDate = (value: unknown) => {
    if (!value) return "—";
    if (typeof value === "number") return new Date(value).toLocaleString("en-IN");
    if (typeof (value as any)?.toDate === "function")
      return (value as any).toDate().toLocaleString("en-IN");
    return "—";
  };

  const toNumber = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim().length > 0) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const normalizedItems = (Array.isArray(order?.items) ? order.items : [])
    .map((it: any) => {
      const quantity =
        toNumber(it?.quantity) ??
        toNumber(it?.qty) ??
        toNumber(it?.count) ??
        toNumber(it?.qtyOrdered) ??
        1;
      const price =
        toNumber(it?.price) ??
        toNumber(it?.unitPrice) ??
        toNumber(it?.amount) ??
        0;
      return {
        productId: typeof it?.productId === "string" ? it.productId : undefined,
        variantId: typeof it?.variantId === "string" ? it.variantId : undefined,
        name: typeof it?.name === "string" ? it.name : undefined,
        variantLabel: typeof it?.variantLabel === "string" ? it.variantLabel : undefined,
        sku: typeof it?.sku === "string" ? it.sku : undefined,
        slug: typeof it?.slug === "string" ? it.slug : undefined,
        image: typeof it?.image === "string" ? it.image : undefined,
        quantity,
        price,
        lineTotal: quantity * price,
      };
    })
    .filter((it) => it.name || it.sku || it.productId);

  const itemsCount = normalizedItems.length;
  const totalQty = normalizedItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
  const computedSubtotal = normalizedItems.reduce(
    (sum, it) => sum + (it.lineTotal || 0),
    0
  );

  const currency = order?.currency || "INR";
  const subtotal =
    typeof order?.subtotal === "number" ? order.subtotal : computedSubtotal || undefined;
  const shipping = typeof order?.shipping === "number" ? order.shipping : undefined;
  const total =
    typeof order?.total === "number"
      ? order.total
      : subtotal != null
        ? subtotal + (shipping ?? 0)
        : undefined;

  const downloadInvoice = async () => {
    if (!order) return;
    setInvoiceLoading(true);
    setError(null);
    try {
      const settingsSnap = await getDoc(doc(db, "siteSettings", "main"));
      const invoiceCfg = (settingsSnap.exists() ? (settingsSnap.data() as any)?.invoice : undefined) || {};
      const brandName =
        typeof invoiceCfg?.brandName === "string" && invoiceCfg.brandName.trim().length
          ? invoiceCfg.brandName.trim()
          : "Pearl Bloom";
      const companyName =
        typeof invoiceCfg?.companyName === "string"
          ? invoiceCfg.companyName.trim()
          : typeof invoiceCfg?.sellerName === "string"
            ? invoiceCfg.sellerName.trim()
            : "";
      const sellerAddress = typeof invoiceCfg?.sellerAddress === "string" ? invoiceCfg.sellerAddress : "";
      const sellerPhone = typeof invoiceCfg?.sellerPhone === "string" ? invoiceCfg.sellerPhone.trim() : "";
      const sellerEmail = typeof invoiceCfg?.sellerEmail === "string" ? invoiceCfg.sellerEmail.trim() : "";
      const sellerWebsite = typeof invoiceCfg?.sellerWebsite === "string" ? invoiceCfg.sellerWebsite.trim() : "";
      const sellerGstin = typeof invoiceCfg?.sellerGstin === "string" ? invoiceCfg.sellerGstin.trim() : "";
      const invoicePrefix = typeof invoiceCfg?.prefix === "string" ? invoiceCfg.prefix.trim() : "";
      const defaultTaxRate =
        typeof invoiceCfg?.defaultTaxRate === "number" && Number.isFinite(invoiceCfg.defaultTaxRate)
          ? invoiceCfg.defaultTaxRate
          : 0;
      const qrUrlTemplate =
        typeof invoiceCfg?.qrUrlTemplate === "string" ? invoiceCfg.qrUrlTemplate.trim() : "";
      const invoiceNotes = typeof invoiceCfg?.notes === "string" ? invoiceCfg.notes : "";
      const invoiceBankDetails = typeof invoiceCfg?.bankDetails === "string" ? invoiceCfg.bankDetails : "";

      const seller: InvoiceSellerProfile = {
        brandName,
        companyName: companyName || undefined,
        addressLines: sellerAddress
          .split(/\r?\n/)
          .map((l: string) => l.trim())
          .filter(Boolean),
        phone: sellerPhone || undefined,
        email: sellerEmail || undefined,
        website: sellerWebsite || undefined,
        gstin: sellerGstin || undefined,
      };

      const customerName = order.address?.fullName || order.user?.name || undefined;
      const customerPhone = order.phone || order.address?.phone || order.user?.phone || undefined;
      const customerEmail = order.user?.email || undefined;

      const lineItems: InvoiceLineItem[] = normalizedItems.map((it) => ({
        name: it.name || it.sku || it.productId || "Item",
        variantLabel: it.variantLabel,
        sku: it.sku,
        quantity: it.quantity || 0,
        unitPrice: it.price || 0,
        lineTotal: it.lineTotal || 0,
      }));

      const readNumber = (...values: any[]) => {
        for (const v of values) {
          if (typeof v === "number" && Number.isFinite(v)) return v;
        }
        return undefined;
      };

      const discountValue = Math.max(
        0,
        readNumber(
          (order as any)?.discount,
          (order as any)?.couponDiscount,
          (order as any)?.discountAmount,
          (order as any)?.promoDiscount,
          (order as any)?.promotionDiscount
        ) ?? 0
      );

      const shippingAmount = typeof shipping === "number" ? shipping : 0;
      const totalOrdered = typeof order.total === "number" ? order.total : undefined;

      const qrFromTemplate = qrUrlTemplate
        ? qrUrlTemplate
            .replaceAll("{orderId}", order.id)
            .replaceAll("{displayId}", order.displayId || order.id)
        : "";

      const qrValue =
        qrFromTemplate ||
        (typeof order?.tracking?.trackingUrl === "string" && order.tracking.trackingUrl.trim().length
          ? order.tracking.trackingUrl.trim()
          : `${window.location.origin}/orders/${order.id}`);

      const grossItemsFromOrder =
        typeof totalOrdered === "number" ? Math.max(0, totalOrdered - shippingAmount + discountValue) : undefined;

      const taxFromOrder =
        typeof (order as any)?.tax === "number" && Number.isFinite((order as any).tax)
          ? Math.max(0, (order as any).tax)
          : undefined;

      const taxRate =
        typeof defaultTaxRate === "number" && Number.isFinite(defaultTaxRate) && defaultTaxRate > 0
          ? defaultTaxRate
          : undefined;

      const grossForSplit =
        typeof grossItemsFromOrder === "number" && grossItemsFromOrder > 0
          ? grossItemsFromOrder
          : lineItems.reduce((s, it) => s + (it.lineTotal || 0), 0);

      const taxSplit =
        taxFromOrder != null
          ? taxFromOrder
          : taxRate != null && grossForSplit > 0
            ? (grossForSplit * taxRate) / (100 + taxRate)
            : undefined;

      const netSubtotalSplit =
        typeof taxSplit === "number" && grossForSplit > 0 ? Math.max(0, grossForSplit - taxSplit) : undefined;

      const adjustedItems =
        typeof netSubtotalSplit === "number" && grossForSplit > 0
          ? (() => {
              const ratio = netSubtotalSplit / grossForSplit;
              const rounded = (n: number) => Math.round(n * 100) / 100;
              const out = lineItems.map((it) => ({
                ...it,
                unitPrice: rounded(it.unitPrice * ratio),
                lineTotal: rounded(it.lineTotal * ratio),
              }));
              const sum = out.reduce((s, it) => s + (it.lineTotal || 0), 0);
              const diff = rounded(netSubtotalSplit - sum);
              if (out.length && diff !== 0) {
                const last = out[out.length - 1];
                out[out.length - 1] = { ...last, lineTotal: rounded((last.lineTotal || 0) + diff) };
              }
              return out;
            })()
          : lineItems;

      const adjustedSubtotal = adjustedItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
      const computedTax =
        typeof totalOrdered === "number"
          ? Math.max(0, totalOrdered - (adjustedSubtotal + shippingAmount - discountValue))
          : typeof taxSplit === "number"
            ? Math.max(0, taxSplit)
            : undefined;

      const computedTotal =
        typeof totalOrdered === "number"
          ? totalOrdered
          : typeof total === "number"
            ? total
            : typeof adjustedSubtotal === "number"
              ? adjustedSubtotal + shippingAmount - discountValue + (computedTax ?? 0)
              : undefined;

      const invoiceOrder: InvoiceOrder = {
        id: order.id,
        displayId: order.displayId,
        currency,
        createdAtText: formatOrderDate(order.createdAt),
        invoicePrefix: invoicePrefix || undefined,
        seller,
        notes: invoiceNotes || undefined,
        bankDetails: invoiceBankDetails || undefined,
        taxRatePercent: taxRate,
        customer: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          address: formatAddressMultiline(order.address),
        },
        shipping: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          address: formatAddressMultiline(order.address),
        },
        payment: {
          method: "Razorpay",
          reference: order.payment?.razorpayPaymentId || undefined,
        },
        totals: {
          subtotal: Number.isFinite(adjustedSubtotal) ? adjustedSubtotal : undefined,
          shipping: shippingAmount > 0 ? shippingAmount : undefined,
          discount: discountValue > 0 ? discountValue : undefined,
          tax: typeof computedTax === "number" ? computedTax : undefined,
          total: typeof computedTotal === "number" ? computedTotal : undefined,
        },
        items: adjustedItems,
        qrValue,
      };

      const pdfBytes = await generateInvoicePdf(invoiceOrder);
      const safeBytes = new Uint8Array(pdfBytes);
      const blob = new Blob([safeBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const id = order.displayId || order.id;
      a.href = url;
      a.download = `Invoice-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Failed to generate invoice");
    } finally {
      setInvoiceLoading(false);
    }
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
      {loading && <OrderDetailPageSkeleton />}

      {!loading && error && (
        <div className="rounded-2xl border border-red-700 bg-red-900/10 p-6 text-red-300">
          {error}
        </div>
      )}

      {!loading && order && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <section className="rounded-2xl border border-neutral-800 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">
                  Customer
                </h2>
                {order.userId && (
                  <Link
                    to={`/users/${order.userId}`}
                    className="text-[11px] rounded-full border border-yellow-500/60 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition"
                  >
                    View user
                  </Link>
                )}
              </div>
              <div className="text-sm">
                <div className="text-neutral-100">
                  {order.address?.fullName || order.user?.name || "—"}
                </div>
                <div className="text-neutral-400 mt-1">
                  {order.phone ||
                    order.address?.phone ||
                    order.user?.phone ||
                    order.user?.email ||
                    "—"}
                </div>
                <div className="text-neutral-300 mt-2">
                  {formatAddress(order.address)}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">Items</h2>
                <div className="text-[11px] text-neutral-500">
                  {itemsCount} items • {totalQty} qty
                </div>
              </div>
              {normalizedItems.length === 0 ? (
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
                        <th className="px-4 py-2 text-right text-xs font-medium text-neutral-400">
                          Unit
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-neutral-400">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {normalizedItems.map((it, idx) => (
                        <tr key={idx} className="bg-neutral-950/40">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              {it.image ? (
                                <img
                                  src={it.image}
                                  alt={it.name || it.sku || "Item"}
                                  className="h-9 w-9 rounded-md border border-neutral-800 object-cover bg-neutral-900"
                                />
                              ) : (
                                <div className="h-9 w-9 rounded-md border border-neutral-800 bg-neutral-900" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm text-neutral-200 truncate">
                                  {it.name || it.sku || it.productId || "—"}
                                </div>
                                <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
                                  {[it.variantLabel, it.sku, it.productId]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-neutral-300">
                            {it.quantity}
                          </td>
                          <td className="px-4 py-2 text-right text-neutral-300">
                            {currency} {it.price.toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-2 text-right text-neutral-200">
                            {currency} {it.lineTotal.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Address
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-[11px] text-neutral-500">Name</div>
                  <div className="text-neutral-200 mt-1">
                    {order.address?.fullName || order.user?.name || "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-[11px] text-neutral-500">Phone</div>
                  <div className="text-neutral-200 mt-1">
                    {order.phone ||
                      order.address?.phone ||
                      order.user?.phone ||
                      "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 sm:col-span-2">
                  <div className="text-[11px] text-neutral-500">Full address</div>
                  <div className="text-neutral-200 mt-1">
                    {formatAddress(order.address)}
                  </div>
                </div>
              </div>
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
                  <span className="text-neutral-200">
                    #{order.displayId || order.id}
                  </span>
                </div>
                {order.userId && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">User ID</span>
                    <span className="text-neutral-200">{order.userId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-400">Created</span>
                  <span className="text-neutral-200">
                    {formatOrderDate(order.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Updated</span>
                  <span className="text-neutral-200">
                    {formatOrderDate(order.updatedAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Items</span>
                  <span className="text-neutral-200">
                    {itemsCount} ({totalQty} qty)
                  </span>
                </div>
                {typeof order.subtotal === "number" && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Subtotal</span>
                    <span className="text-neutral-200">
                      {currency}{" "}
                      {order.subtotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                {typeof order.subtotal !== "number" && typeof subtotal === "number" && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Subtotal</span>
                    <span className="text-neutral-200">
                      {currency} {subtotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                {typeof order.shipping === "number" && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Shipping</span>
                    <span className="text-neutral-200">
                      {currency}{" "}
                      {order.shipping.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-400">Total</span>
                  <span className="text-neutral-200">
                    {typeof total === "number"
                      ? `${currency} ${total.toLocaleString("en-IN")}`
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

            {(order.payment?.razorpayOrderId ||
              order.payment?.razorpayPaymentId ||
              order.payment?.razorpaySignature) && (
              <section className="rounded-2xl border border-neutral-800 p-6">
                <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                  Payment
                </h2>
                <div className="space-y-2 text-sm">
                  {order.payment?.razorpayOrderId && (
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-400 shrink-0">Razorpay order</span>
                      <span className="text-neutral-200 text-right break-all max-w-[65%]">
                        {order.payment.razorpayOrderId}
                      </span>
                    </div>
                  )}
                  {order.payment?.razorpayPaymentId && (
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-400 shrink-0">Razorpay payment</span>
                      <span className="text-neutral-200 text-right break-all max-w-[65%]">
                        {order.payment.razorpayPaymentId}
                      </span>
                    </div>
                  )}
                  {order.payment?.razorpaySignature && (
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-400 shrink-0">Signature</span>
                      <details className="text-right max-w-[65%]">
                        <summary className="cursor-pointer text-neutral-200 text-[11px]">
                          View
                        </summary>
                        <div className="mt-1 font-mono text-[10px] text-neutral-300 break-all">
                          {order.payment.razorpaySignature}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </section>
            )}

            {(order.tracking?.awb ||
              order.tracking?.carrier ||
              order.tracking?.trackingUrl ||
              (order.tracking?.events && order.tracking.events.length > 0)) && (
              <section className="rounded-2xl border border-neutral-800 p-6">
                <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                  Tracking
                </h2>
                <div className="space-y-2 text-sm">
                  {order.tracking?.carrier && (
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-400">Carrier</span>
                      <span className="text-neutral-200 text-right">
                        {order.tracking.carrier}
                      </span>
                    </div>
                  )}
                  {order.tracking?.awb && (
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-400">AWB</span>
                      <span className="text-neutral-200 text-right">
                        {order.tracking.awb}
                      </span>
                    </div>
                  )}
                  {order.tracking?.trackingUrl && (
                    <div className="flex justify-between gap-4">
                      <span className="text-neutral-400">Tracking URL</span>
                      <a
                        href={order.tracking.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-yellow-200 hover:underline text-right"
                      >
                        Open
                      </a>
                    </div>
                  )}
                </div>

                {order.tracking?.events && order.tracking.events.length > 0 && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-neutral-800">
                    <table className="min-w-full divide-y divide-neutral-800">
                      <thead className="bg-neutral-900/60">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                            Time
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">
                            Location
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {order.tracking.events.map((ev, idx) => (
                          <tr key={idx} className="bg-neutral-950/40">
                            <td className="px-4 py-2 text-neutral-200">
                              {ev.status}
                              {ev.message && (
                                <div className="text-[11px] text-neutral-500 mt-0.5">
                                  {ev.message}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-neutral-300">
                              {ev.timestamp}
                            </td>
                            <td className="px-4 py-2 text-neutral-300">
                              {ev.location || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-neutral-800 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">
                Actions
              </h2>
              <div className="flex items-center gap-2">
                <button
                  disabled={invoiceLoading}
                  onClick={downloadInvoice}
                  className="text-[11px] rounded-full border border-yellow-500/60 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition disabled:opacity-60"
                >
                  {invoiceLoading ? "Generating…" : "Download invoice"}
                </button>
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
