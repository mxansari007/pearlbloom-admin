import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Timestamp, deleteField } from "firebase/firestore";
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";

type ProductOption = { id: string; name: string };
type CollectionOption = { id: string; name: string };

type DiscountType = "percent" | "flat";
type ApplyScope = "all" | "products" | "collections" | "categories";

const normalize = (v: unknown) => String(v ?? "").trim();

const normalizeCode = (value: string) => {
  const upper = normalize(value).toUpperCase();
  return upper
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
};

const parseNonNegativeNumberOrUndefined = (value: string): number | undefined => {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return n < 0 ? 0 : n;
};

const toLocalStartOfDayTimestamp = (dateStr: string): Timestamp | undefined => {
  const raw = normalize(dateStr);
  if (!raw) return undefined;
  const [y, m, d] = raw.split("-").map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return undefined;
  return Timestamp.fromDate(dt);
};

const toLocalEndOfDayTimestamp = (dateStr: string): Timestamp | undefined => {
  const raw = normalize(dateStr);
  if (!raw) return undefined;
  const [y, m, d] = raw.split("-").map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(dt.getTime())) return undefined;
  return Timestamp.fromDate(dt);
};

const asDateInputValue = (value: any) => {
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
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
};

const CouponEditPageSkeleton = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
      <div className="lg:col-span-2 space-y-6">
        {/* Section 1: Coupon Code and Title */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
          </div>
          <div className="mt-4 h-6 bg-neutral-700 rounded w-1/4"></div>
        </div>

        {/* Section 2: Discount */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
          <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
          </div>
        </div>

        {/* Section 3: Eligibility */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
          <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
          </div>
        </div>
        
        {/* Section 4: Dates and Limits */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
          <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
            <div>
              <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
              <div className="mt-2 h-9 bg-neutral-800 rounded w-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Preview */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
          <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-4">
            <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
            <div className="h-5 bg-neutral-800 rounded w-1/2"></div>
            <div className="h-4 bg-neutral-700 rounded w-1/4 mt-3"></div>
            <div className="h-5 bg-neutral-800 rounded w-1/2"></div>
            <div className="h-4 bg-neutral-700 rounded w-1/4 mt-3"></div>
            <div className="h-5 bg-neutral-800 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function CouponEditPage() {
  const { code } = useParams();
  const isNew = !code;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codeText, setCodeText] = useState("");
  const [title, setTitle] = useState("");
  const [active, setActive] = useState(true);

  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValueText, setDiscountValueText] = useState("");
  const [maxDiscountText, setMaxDiscountText] = useState("");

  const [minSubtotalText, setMinSubtotalText] = useState("");
  const [usageLimitText, setUsageLimitText] = useState("");
  const [perUserLimitText, setPerUserLimitText] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [scope, setScope] = useState<ApplyScope>("all");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [categoriesText, setCategoriesText] = useState("");

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [pickQuery, setPickQuery] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [pSnap, cSnap] = await Promise.all([
          getDocs(collection(db, "products")),
          getDocs(collection(db, "collections")),
        ]);

        const prodList: ProductOption[] = pSnap.docs
          .map((d) => {
            const data = d.data() as any;
            return { id: d.id, name: String(data.name ?? "Untitled product") };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const collList: CollectionOption[] = cSnap.docs
          .map((d) => {
            const data = d.data() as any;
            return { id: d.id, name: String(data.name ?? "Untitled collection") };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        setProducts(prodList);
        setCollections(collList);

        if (!isNew) {
          const couponCode = normalizeCode(code!);
          const snap = await getDoc(doc(db, "coupons", couponCode));
          if (snap.exists()) {
            const data = snap.data() as any;
            setCodeText(String(data.code ?? couponCode));
            setTitle(typeof data.title === "string" ? data.title : "");
            setActive(Boolean(data.active));

            const dt: DiscountType =
              data?.discount?.type === "flat" ? "flat" : "percent";
            setDiscountType(dt);
            setDiscountValueText(
              typeof data?.discount?.value === "number" ? String(data.discount.value) : ""
            );
            setMaxDiscountText(
              typeof data?.discount?.maxDiscount === "number"
                ? String(data.discount.maxDiscount)
                : ""
            );

            setMinSubtotalText(typeof data.minSubtotal === "number" ? String(data.minSubtotal) : "");
            setUsageLimitText(typeof data.usageLimit === "number" ? String(data.usageLimit) : "");
            setPerUserLimitText(typeof data.perUserLimit === "number" ? String(data.perUserLimit) : "");

            setStartDate(asDateInputValue(data.startAt));
            setEndDate(asDateInputValue(data.endAt));

            const sc: ApplyScope =
              data?.appliesTo?.scope === "products"
                ? "products"
                : data?.appliesTo?.scope === "collections"
                  ? "collections"
                  : data?.appliesTo?.scope === "categories"
                    ? "categories"
                    : "all";
            setScope(sc);
            setProductIds(Array.isArray(data?.appliesTo?.productIds) ? data.appliesTo.productIds : []);
            setCollectionIds(
              Array.isArray(data?.appliesTo?.collectionIds) ? data.appliesTo.collectionIds : []
            );
            setCategoriesText(
              Array.isArray(data?.appliesTo?.categories) ? data.appliesTo.categories.join(", ") : ""
            );
          } else {
            setCodeText(couponCode);
          }
        } else {
          setCodeText("");
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load coupon");
      } finally {
        setLoading(false);
      }
    })();
  }, [code, isNew]);

  const pickList = useMemo(() => {
    const q = normalize(pickQuery).toLowerCase();
    if (scope === "products") {
      const base = products;
      if (!q) return base;
      return base.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    if (scope === "collections") {
      const base = collections;
      if (!q) return base;
      return base.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    return [];
  }, [collections, pickQuery, products, scope]);

  const selectedCount = scope === "products" ? productIds.length : scope === "collections" ? collectionIds.length : 0;

  const toggleSelected = (id: string) => {
    if (scope === "products") {
      setProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      return;
    }
    if (scope === "collections") {
      setCollectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
  };

  const handleScopeChange = (next: ApplyScope) => {
    setScope(next);
    setPickQuery("");
    if (next !== "products") setProductIds([]);
    if (next !== "collections") setCollectionIds([]);
    if (next !== "categories") setCategoriesText("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const couponCode = isNew ? normalizeCode(codeText) : normalizeCode(code!);
      if (!couponCode) throw new Error("Coupon code is required");

      const discountValue = parseNonNegativeNumberOrUndefined(discountValueText);
      if (typeof discountValue !== "number") throw new Error("Discount value is required");
      if (discountType === "percent" && discountValue > 100) throw new Error("Percent discount cannot exceed 100");

      const maxDiscount = discountType === "percent" ? parseNonNegativeNumberOrUndefined(maxDiscountText) : undefined;
      const minSubtotal = parseNonNegativeNumberOrUndefined(minSubtotalText);
      const usageLimit = parseNonNegativeNumberOrUndefined(usageLimitText);
      const perUserLimit = parseNonNegativeNumberOrUndefined(perUserLimitText);

      const startAt = toLocalStartOfDayTimestamp(startDate);
      const endAt = toLocalEndOfDayTimestamp(endDate);

      if (startAt && endAt && startAt.toMillis() > endAt.toMillis()) {
        throw new Error("Start date cannot be after expiry date");
      }

      const categories =
        scope === "categories"
          ? Array.from(
              new Set(
                normalize(categoriesText)
                  .split(/[\n,]+/g)
                  .map((x) => normalize(x))
                  .filter(Boolean)
              )
            )
          : [];

      if (scope === "products" && productIds.length === 0) {
        throw new Error("Select at least one product for this coupon");
      }
      if (scope === "collections" && collectionIds.length === 0) {
        throw new Error("Select at least one collection for this coupon");
      }
      if (scope === "categories" && categories.length === 0) {
        throw new Error("Enter at least one category for this coupon");
      }

      await setDoc(
        doc(db, "coupons", couponCode),
        {
          code: couponCode,
          title: normalize(title) || deleteField(),
          active: Boolean(active),
          discount: {
            type: discountType,
            value: discountValue,
            maxDiscount: typeof maxDiscount === "number" ? maxDiscount : deleteField(),
          },
          appliesTo: {
            scope,
            productIds: scope === "products" ? productIds : deleteField(),
            collectionIds: scope === "collections" ? collectionIds : deleteField(),
            categories: scope === "categories" ? categories : deleteField(),
          },
          minSubtotal: typeof minSubtotal === "number" ? minSubtotal : deleteField(),
          usageLimit: typeof usageLimit === "number" ? usageLimit : deleteField(),
          perUserLimit: typeof perUserLimit === "number" ? perUserLimit : deleteField(),
          startAt: startAt ?? deleteField(),
          endAt: endAt ?? deleteField(),
          updatedAt: serverTimestamp(),
          ...(isNew && { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      navigate("/coupons");
    } catch (e: any) {
      setError(e?.message || "Failed to save coupon");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title={isNew ? "New coupon" : `Edit coupon`}
      subtitle="Set discount rules, scope, limits and dates."
      actions={
        <Link
          to="/coupons"
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-200 hover:border-yellow-500/70 hover:text-yellow-200 transition"
        >
          ← Back to coupons
        </Link>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <CouponEditPageSkeleton />
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm">Coupon code</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={codeText}
                    onChange={(e) => setCodeText(normalizeCode(e.target.value))}
                    placeholder="WELCOME10"
                    disabled={!isNew}
                    required
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Use uppercase letters and numbers. Hyphen is allowed.
                  </div>
                </div>
                <div>
                  <label className="text-sm">Title (optional)</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="New Year Offer"
                  />
                </div>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">Discount</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm">Type</label>
                  <select
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                  >
                    <option value="percent">Percent (%)</option>
                    <option value="flat">Flat amount</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">{discountType === "percent" ? "Percent off" : "Amount off"}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={discountValueText}
                    onChange={(e) => setDiscountValueText(e.target.value)}
                    placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 200"}
                  />
                </div>

                <div>
                  <label className="text-sm">Max discount (optional)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 ${
                      discountType === "flat" ? "opacity-60" : ""
                    }`}
                    value={maxDiscountText}
                    onChange={(e) => setMaxDiscountText(e.target.value)}
                    placeholder="e.g. 500"
                    disabled={discountType === "flat"}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">Eligibility</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm">Minimum subtotal (optional)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={minSubtotalText}
                    onChange={(e) => setMinSubtotalText(e.target.value)}
                    placeholder="e.g. 999"
                  />
                </div>
                <div>
                  <label className="text-sm">Scope</label>
                  <select
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={scope}
                    onChange={(e) => handleScopeChange(e.target.value as ApplyScope)}
                  >
                    <option value="all">All products</option>
                    <option value="products">Specific products</option>
                    <option value="collections">Specific collections</option>
                    <option value="categories">Specific categories</option>
                  </select>
                </div>
              </div>

              {(scope === "products" || scope === "collections") && (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/30 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-sm text-neutral-200">
                      Select {scope === "products" ? "products" : "collections"}
                    </div>
                    <div className="text-[11px] text-neutral-400">{selectedCount} selected</div>
                  </div>

                  <input
                    value={pickQuery}
                    onChange={(e) => setPickQuery(e.target.value)}
                    placeholder={`Search ${scope === "products" ? "products" : "collections"}…`}
                    className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 mb-3"
                  />

                  <div className="max-h-[320px] overflow-auto rounded-lg border border-neutral-800">
                    <table className="min-w-full divide-y divide-neutral-800 text-sm">
                      <thead className="bg-neutral-950/70 sticky top-0">
                        <tr className="text-neutral-400">
                          <th className="px-4 py-2 text-left text-xs font-medium">Pick</th>
                          <th className="px-4 py-2 text-left text-xs font-medium">Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {pickList.map((it: any) => (
                          <tr key={it.id} className="bg-neutral-950/40">
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={scope === "products" ? productIds.includes(it.id) : collectionIds.includes(it.id)}
                                onChange={() => toggleSelected(it.id)}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <div className="text-neutral-200">{it.name}</div>
                              <div className="text-[11px] text-neutral-500 break-all">{it.id}</div>
                            </td>
                          </tr>
                        ))}

                        {pickList.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-4 py-6 text-center text-neutral-500">
                              No results.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {scope === "categories" && (
                <div className="mt-4">
                  <label className="text-sm">Categories (comma separated)</label>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={categoriesText}
                    onChange={(e) => setCategoriesText(e.target.value)}
                    placeholder="Rings, Earrings"
                  />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">Dates & limits</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm">Start date (optional)</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm">Expiry date (optional)</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm">Total usage limit (optional)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={usageLimitText}
                    onChange={(e) => setUsageLimitText(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </div>
                <div>
                  <label className="text-sm">Per-user limit (optional)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={perUserLimitText}
                    onChange={(e) => setPerUserLimitText(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium hover:bg-yellow-400 transition disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save coupon"}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">Preview</h2>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-2">
                <div className="text-xs text-neutral-500">Code</div>
                <div className="text-sm text-neutral-100 font-medium">{normalizeCode(codeText) || "—"}</div>

                <div className="text-xs text-neutral-500 mt-3">Discount</div>
                <div className="text-sm text-neutral-200">
                  {discountType === "percent" ? `${normalize(discountValueText) || "—"}%` : `₹${normalize(discountValueText) || "—"}`}
                </div>

                <div className="text-xs text-neutral-500 mt-3">Scope</div>
                <div className="text-sm text-neutral-300">
                  {scope === "all"
                    ? "All products"
                    : scope === "products"
                      ? `${productIds.length} product(s)`
                      : scope === "collections"
                        ? `${collectionIds.length} collection(s)`
                        : `${normalize(categoriesText).split(/[\n,]+/g).filter(Boolean).length} category(ies)`}
                </div>
              </div>
            </section>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}

