import { useEffect, useMemo, useState } from "react";
import { db, doc, getDoc, setDoc, serverTimestamp } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { getFunctions, httpsCallable } from "firebase/functions";

type Courier = {
  id: string;
  name: string;
  raw?: any;
};

const normalize = (v: unknown) => String(v ?? "").trim();

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const parseNonNegativeNumber = (value: string): number => {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
};

const asStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out = value
    .map((v) => normalize(v))
    .flatMap((v) => v.split(/[\n,]+/g).map((x) => normalize(x)))
    .filter(Boolean);
  return Array.from(new Set(out));
};

const listFromText = (value: string) => {
  const out = value
    .split(/[\n,]+/g)
    .map((v) => normalize(v))
    .filter(Boolean);
  return Array.from(new Set(out));
};

const asCouriers = (value: unknown): Courier[] => {
  if (!Array.isArray(value)) return [];
  const out: Courier[] = [];
  for (const it of value) {
    if (typeof it === "string") {
      const name = normalize(it);
      if (name) out.push({ id: name, name });
      continue;
    }
    if (it && typeof it === "object") {
      const id = normalize((it as any).id) || normalize((it as any).code) || normalize((it as any).name);
      const name = normalize((it as any).name) || id;
      if (id && name) out.push({ id, name, raw: (it as any).raw ?? it });
    }
  }
  const byId: Record<string, Courier> = {};
  out.forEach((c) => (byId[c.id] = c));
  return Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
};

const ShipmentsPageSkeleton = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
    <div className="lg:col-span-2 space-y-6">
      {/* Shipping rates */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
            <div className="h-9 bg-neutral-800 rounded w-full"></div>
          </div>
          <div>
            <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
            <div className="h-9 bg-neutral-800 rounded w-full"></div>
          </div>
        </div>
      </div>
      {/* Courier whitelist */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-neutral-800 rounded w-full"></div>
      </div>
      {/* Pincodes */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/3 mb-4"></div>
        <div className="h-32 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>
    <div className="space-y-6">
      {/* Nimbuspost */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
        <div className="h-5 bg-neutral-700 rounded w-1/2 mb-4"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>
  </div>
);

export default function ShipmentsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [whitelist, setWhitelist] = useState<Courier[]>([]);
  const [deliverablePincodes, setDeliverablePincodes] = useState<string[]>([]);
  const [deliverableText, setDeliverableText] = useState("");
  const [deliverableDirty, setDeliverableDirty] = useState(false);

  const [globalShippingRateText, setGlobalShippingRateText] = useState<string>("0");
  const [freeShippingAboveText, setFreeShippingAboveText] = useState<string>("0");

  const [fetchingCouriers, setFetchingCouriers] = useState(false);
  const [courierQuery, setCourierQuery] = useState("");
  const [availableCouriers, setAvailableCouriers] = useState<Courier[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [selectedCourier, setSelectedCourier] = useState<Courier | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "siteSettings", "main"));
        const data = snap.exists() ? (snap.data() as any) : {};
        const shipments = data?.shipments ?? {};
        setWhitelist(asCouriers(shipments?.courierWhitelist));
        const pins = asStringList(
          shipments?.deliverablePincodes ??
            data?.deliverablePincodes ??
            data?.shipping?.deliverablePincodes ??
            shipments?.deliverableWhitelist ??
            data?.deliverableWhitelist
        );
        setDeliverablePincodes(pins);
        setDeliverableText(pins.join("\n"));

        const globalShippingRate =
          asNumber(
            shipments?.globalShippingRate ??
              data?.globalShippingRate ??
              data?.shipping?.globalShippingRate
          ) ?? 0;
        const freeShippingAbove =
          asNumber(
            shipments?.freeShippingAbove ??
              data?.freeShippingAbove ??
              data?.shipping?.freeShippingAbove
          ) ?? 0;

        setGlobalShippingRateText(String(globalShippingRate));
        setFreeShippingAboveText(String(freeShippingAbove));
      } catch (err: any) {
        setError(err?.message || "Failed to load shipment settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredAvailable = useMemo(() => {
    const q = normalize(courierQuery).toLowerCase();
    if (!q) return availableCouriers;
    return availableCouriers.filter((c) => {
      return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });
  }, [availableCouriers, courierQuery]);

  const addToWhitelist = (items: Courier[]) => {
    if (!items.length) return;
    setWhitelist((prev) => {
      const byId: Record<string, Courier> = {};
      prev.forEach((c) => (byId[c.id] = c));
      items.forEach((c) => (byId[c.id] = c));
      return Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  const removeFromWhitelist = (id: string) => {
    setWhitelist((prev) => prev.filter((c) => c.id !== id));
  };

  const fetchNimbuspostCouriers = async () => {
    setFetchingCouriers(true);
    setError(null);
    setSavedMsg(null);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const getCouriers = httpsCallable(functions, "nimbuspostCouriersCallable");
      const res: any = await getCouriers({});
      const couriers = asCouriers(res?.data?.couriers);
      setAvailableCouriers(couriers);
      setSelectedIds({});
    } catch (err: any) {
      setError(err?.message || "Failed to fetch couriers");
      setAvailableCouriers([]);
      setSelectedIds({});
    } finally {
      setFetchingCouriers(false);
    }
  };

  const handleAddSelected = () => {
    const chosen = availableCouriers.filter((c) => selectedIds[c.id]);
    addToWhitelist(chosen);
    setSelectedIds({});
  };

  const handleAddManual = () => {
    const name = normalize(manualName);
    const id = normalize(manualId) || name;
    if (!name) return;
    addToWhitelist([{ id, name }]);
    setManualName("");
    setManualId("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const pins = deliverableDirty ? listFromText(deliverableText) : deliverablePincodes;
      const globalRateToSave = parseNonNegativeNumber(globalShippingRateText);
      const freeAboveToSave = parseNonNegativeNumber(freeShippingAboveText);
      await setDoc(
        doc(db, "siteSettings", "main"),
        {
          shipments: {
            courierWhitelist: whitelist.map((c) => ({ id: c.id, name: c.name })),
            deliverablePincodes: pins,
            globalShippingRate: globalRateToSave,
            freeShippingAbove: freeAboveToSave,
          },
          deliverablePincodes: pins,
          globalShippingRate: globalRateToSave,
          freeShippingAbove: freeAboveToSave,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSavedMsg("Shipment settings saved.");
      setDeliverablePincodes(pins);
      setDeliverableText(pins.join("\n"));
      setDeliverableDirty(false);
      setGlobalShippingRateText(String(globalRateToSave));
      setFreeShippingAboveText(String(freeAboveToSave));
    } catch (err: any) {
      setError(err?.message || "Failed to save shipment settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title="Shipments"
      subtitle="Choose which couriers can be used for fulfilment."
      actions={
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-full bg-yellow-500 text-black px-4 py-1.5 text-xs font-medium hover:bg-yellow-400 transition disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      {loading && <ShipmentsPageSkeleton />}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">Shipping rates</h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Storefront can use these values to calculate shipping and free-shipping eligibility.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm">Global shipping rate</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={globalShippingRateText}
                    onChange={(e) => setGlobalShippingRateText(e.target.value)}
                    onBlur={() => setGlobalShippingRateText(String(parseNonNegativeNumber(globalShippingRateText)))}
                    placeholder="e.g. 99"
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Applied when a product has no custom shippingRate.
                  </div>
                </div>
                <div>
                  <label className="text-sm">Free shipping above</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                    value={freeShippingAboveText}
                    onChange={(e) => setFreeShippingAboveText(e.target.value)}
                    onBlur={() => setFreeShippingAboveText(String(parseNonNegativeNumber(freeShippingAboveText)))}
                    placeholder="e.g. 999"
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Set to 0 to disable free shipping threshold.
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-200">Courier whitelist</h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    Only these couriers are eligible when you create shipments.
                  </p>
                </div>
                <span className="text-[11px] rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300">
                  {whitelist.length} selected
                </span>
              </div>

              {whitelist.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-4 text-sm text-neutral-400">
                  No couriers whitelisted yet.
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden border border-neutral-800">
                  <table className="min-w-full divide-y divide-neutral-800 text-sm">
                    <thead className="bg-neutral-950/70">
                      <tr className="text-neutral-400">
                        <th className="px-4 py-2 text-left text-xs font-medium">Courier</th>
                        <th className="px-4 py-2 text-left text-xs font-medium">ID</th>
                        <th className="px-4 py-2 text-right text-xs font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {whitelist.map((c) => (
                        <tr key={c.id} className="bg-neutral-950/40">
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => {
                                const match = availableCouriers.find((x) => x.id === c.id);
                                setSelectedCourier(match ?? c);
                              }}
                              className="text-neutral-200 hover:underline text-left"
                            >
                              {c.name}
                            </button>
                          </td>
                          <td className="px-4 py-2 text-neutral-400 break-all">{c.id}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeFromWhitelist(c.id)}
                              className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-200">
                    Deliverable whitelist (pincodes)
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    Storefront can use this to allow/deny delivery by pincode.
                  </p>
                </div>
                <span className="text-[11px] rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300">
                  {(deliverableDirty ? listFromText(deliverableText) : deliverablePincodes).length} pincodes
                </span>
              </div>

              <textarea
                rows={6}
                value={deliverableText}
                onChange={(e) => {
                  setDeliverableText(e.target.value);
                  setDeliverableDirty(true);
                }}
                placeholder={"Enter one pincode per line\n110001\n400001\n560001"}
                className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const pins = deliverableDirty
                      ? listFromText(deliverableText)
                      : deliverablePincodes;
                    setDeliverablePincodes(pins);
                    setDeliverableText(pins.join("\n"));
                    setDeliverableDirty(false);
                  }}
                  className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-950 transition"
                >
                  Normalize
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeliverableText("");
                    setDeliverableDirty(true);
                  }}
                  className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                >
                  Clear
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">Add courier manually</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Courier name"
                  className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                />
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Courier ID (optional)"
                  className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                />
                <button
                  type="button"
                  onClick={handleAddManual}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-950 transition"
                >
                  Add
                </button>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-2">
                Nimbuspost courier list
              </h2>
              <p className="text-xs text-neutral-500 mb-4">
                Fetch couriers from Nimbuspost using server-side credentials.
              </p>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={fetchNimbuspostCouriers}
                  disabled={fetchingCouriers}
                  className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-950 transition disabled:opacity-60"
                >
                  {fetchingCouriers ? "Fetching…" : "Fetch couriers"}
                </button>
              </div>
            </section>

            {availableCouriers.length > 0 && (
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-neutral-200">Available couriers</h3>
                  <button
                    type="button"
                    onClick={handleAddSelected}
                    className="text-[11px] rounded-full border border-yellow-500/60 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition"
                  >
                    Add selected
                  </button>
                </div>
                <input
                  value={courierQuery}
                  onChange={(e) => setCourierQuery(e.target.value)}
                  placeholder="Search couriers…"
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 mb-3"
                />
                <div className="max-h-[420px] overflow-auto rounded-xl border border-neutral-800">
                  <table className="min-w-full divide-y divide-neutral-800 text-sm">
                    <thead className="bg-neutral-950/70 sticky top-0">
                      <tr className="text-neutral-400">
                        <th className="px-4 py-2 text-left text-xs font-medium">Pick</th>
                        <th className="px-4 py-2 text-left text-xs font-medium">Courier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {filteredAvailable.map((c) => (
                        <tr key={c.id} className="bg-neutral-950/40">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={!!selectedIds[c.id]}
                              onChange={(e) =>
                                setSelectedIds((prev) => ({ ...prev, [c.id]: e.target.checked }))
                              }
                            />
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedCourier(c)}
                              className="text-neutral-200 hover:underline text-left"
                            >
                              {c.name}
                            </button>
                            <div className="text-[11px] text-neutral-500 break-all">{c.id}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {(error || savedMsg) && (
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
                {savedMsg && <div className="text-sm text-green-300">{savedMsg}</div>}
                {error && <div className="text-sm text-red-300">{error}</div>}
              </section>
            )}
          </div>
        </div>
      )}

      {selectedCourier && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSelectedCourier(null)}
          />
          <div className="absolute inset-x-0 top-16 mx-auto w-[92vw] max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-100 truncate">
                  {selectedCourier.name}
                </div>
                <div className="text-xs text-neutral-500 mt-1 break-all">
                  {selectedCourier.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCourier(null)}
                className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-neutral-400">
                  {whitelist.some((w) => w.id === selectedCourier.id)
                    ? "Whitelisted"
                    : "Not whitelisted"}
                </div>
                <div className="flex items-center gap-2">
                  {whitelist.some((w) => w.id === selectedCourier.id) ? (
                    <button
                      type="button"
                      onClick={() => removeFromWhitelist(selectedCourier.id)}
                      className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToWhitelist([selectedCourier])}
                      className="text-[11px] rounded-full border border-yellow-500/60 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition"
                    >
                      Add to whitelist
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="text-[11px] text-neutral-500">Courier name</div>
                  <div className="text-neutral-200 mt-1 wrap-break-word">{selectedCourier.name}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="text-[11px] text-neutral-500">Courier ID</div>
                  <div className="text-neutral-200 mt-1 break-all">{selectedCourier.id}</div>
                </div>
              </div>

              {selectedCourier.raw && (
                <details className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <summary className="cursor-pointer text-sm text-neutral-200">
                    Provider details
                  </summary>
                  <pre className="mt-3 text-[11px] text-neutral-300 overflow-auto max-h-80 whitespace-pre-wrap wrap-break-word">
                    {JSON.stringify(selectedCourier.raw, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
