import { useEffect, useState } from "react";
import {
  db,
  collection,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  doc,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import { Timestamp, deleteField } from "firebase/firestore";

const normalize = (v: unknown) => String(v ?? "").trim();

/* ---------------- Types ---------------- */

type Section = {
  id: string;
  title: string;
  type: "featuredProducts" | "collectionsRow" | "banner" | string;
  order: number;
  productIds?: string[];
  collectionIds?: string[];
  config?: Record<string, any>;
};

type ProductOption = {
  id: string;
  name: string;
};

type CollectionOption = {
  id: string;
  name: string;
};

export type BannerPlacement = "home_top" | "home_bottom";
export type BannerSize = "sm" | "md" | "lg";

export type BannerCarouselItemDoc = {
  id: string;
  imageUrl: string;
  alt?: string;
  href?: string;
  label?: string;
  active?: boolean;
  order?: number;
};

export type BannerCarouselDoc = {
  active: boolean;
  placement: BannerPlacement;
  size: BannerSize;
  title?: string;
  subtitle?: string;
  items: BannerCarouselItemDoc[];
  createdAt?: number | Timestamp;
  updatedAt?: number | Timestamp;
};

type BannerCarouselItemForm = {
  id: string;
  imageUrl: string;
  alt: string;
  href: string;
  label: string;
  active: boolean;
  order: number;
};

type BannerCarouselForm = {
  active: boolean;
  placement: BannerPlacement;
  size: BannerSize;
  title: string;
  subtitle: string;
  items: BannerCarouselItemForm[];
};

const makeDefaultCarouselForm = (placement: BannerPlacement): BannerCarouselForm => ({
  active: false,
  placement,
  size: placement === "home_top" ? "md" : "sm",
  title: "",
  subtitle: "",
  items: [
    {
      id: crypto.randomUUID(),
      imageUrl: "",
      alt: "",
      href: "",
      label: "",
      active: true,
      order: 0,
    },
  ],
});

/* ---------------- Defaults ---------------- */

const emptyForm = {
  title: "",
  type: "featuredProducts" as Section["type"],
  order: 1,
  configJson: "{\n  \"columns\": 3\n}",
};

export default function HomepagePage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  const [carouselPlacement, setCarouselPlacement] = useState<BannerPlacement>("home_top");
  const [carouselLoading, setCarouselLoading] = useState(true);
  const [carouselSaving, setCarouselSaving] = useState(false);
  const [carouselError, setCarouselError] = useState<string | null>(null);
  const [carouselSavedMsg, setCarouselSavedMsg] = useState<string | null>(null);
  const [carousels, setCarousels] = useState<Record<BannerPlacement, BannerCarouselForm>>(() => ({
    home_top: makeDefaultCarouselForm("home_top"),
    home_bottom: makeDefaultCarouselForm("home_bottom"),
  }));

  /* ---------------- Fetch sections ---------------- */

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "homepageSections"));
      const items: Section[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setSections(items);
    })();
  }, []);

  /* ---------------- Fetch products & collections ---------------- */

  useEffect(() => {
    (async () => {
      const prodSnap = await getDocs(collection(db, "products"));
      setProducts(
        prodSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
        }))
      );

      const colSnap = await getDocs(collection(db, "collections"));
      setCollections(
        colSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
        }))
      );
    })();
  }, []);

  /* ---------------- Fetch banner carousels ---------------- */

  useEffect(() => {
    (async () => {
      setCarouselLoading(true);
      setCarouselError(null);
      try {
        const placements: BannerPlacement[] = ["home_top", "home_bottom"];
        const loaded: Partial<Record<BannerPlacement, BannerCarouselForm>> = {};
        for (const placement of placements) {
          const snap = await getDoc(doc(db, "bannerCarousels", placement));
          if (!snap.exists()) continue;
          const data = snap.data() as any;
          const itemsRaw: any[] = Array.isArray(data.items) ? data.items : [];
          const items: BannerCarouselItemForm[] = itemsRaw.map((it, index) => ({
            id: String(it?.id ?? crypto.randomUUID()),
            imageUrl: String(it?.imageUrl ?? ""),
            alt: String(it?.alt ?? ""),
            href: String(it?.href ?? ""),
            label: String(it?.label ?? ""),
            active: it?.active === false ? false : true,
            order:
              typeof it?.order === "number" && Number.isFinite(it.order) ? it.order : index,
          }));
          items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          loaded[placement] = {
            active: Boolean(data.active),
            placement,
            size: data.size === "sm" || data.size === "lg" ? data.size : "md",
            title: typeof data.title === "string" ? data.title : "",
            subtitle: typeof data.subtitle === "string" ? data.subtitle : "",
            items: items.length
              ? items
              : [
                  {
                    id: crypto.randomUUID(),
                    imageUrl: "",
                    alt: "",
                    href: "",
                    label: "",
                    active: true,
                    order: 0,
                  },
                ],
          };
        }
        setCarousels((prev) => ({ ...prev, ...(loaded as any) }));
      } catch (e: any) {
        setCarouselError(e?.message || "Failed to load banner carousels");
      } finally {
        setCarouselLoading(false);
      }
    })();
  }, []);

  /* ---------------- Helpers ---------------- */

  const handleChange = (field: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const startEdit = (section: Section) => {
    setEditingId(section.id);
    setForm({
      title: section.title,
      type: section.type,
      order: section.order,
      configJson: section.config
        ? JSON.stringify(section.config, null, 2)
        : "",
    });

    setSelectedProductIds(section.productIds || []);
    setSelectedCollectionIds(section.collectionIds || []);
  };

  const setCarousel = (placement: BannerPlacement, updater: (prev: BannerCarouselForm) => BannerCarouselForm) => {
    setCarousels((prev) => ({ ...prev, [placement]: updater(prev[placement]) }));
  };

  const normalizeCarouselOrder = (placement: BannerPlacement) => {
    setCarousel(placement, (prev) => {
      const items = [...prev.items]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((it, idx) => ({ ...it, order: idx }));
      return { ...prev, items };
    });
  };

  const moveCarouselItem = (placement: BannerPlacement, index: number, dir: -1 | 1) => {
    setCarousel(placement, (prev) => {
      const items = [...prev.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const nextIndex = index + dir;
      if (nextIndex < 0 || nextIndex >= items.length) return prev;
      const a = items[index];
      const b = items[nextIndex];
      items[index] = { ...b, order: a.order };
      items[nextIndex] = { ...a, order: b.order };
      return { ...prev, items: items.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)) };
    });
  };

  const saveCarousel = async (placement: BannerPlacement) => {
    setCarouselSaving(true);
    setCarouselError(null);
    setCarouselSavedMsg(null);
    try {
      const c = carousels[placement];
      const items = [...c.items]
        .map((it, idx) => ({
          ...it,
          id: normalize(it.id) || crypto.randomUUID(),
          imageUrl: normalize(it.imageUrl),
          alt: normalize(it.alt),
          href: normalize(it.href),
          label: normalize(it.label),
          active: it.active !== false,
          order: typeof it.order === "number" && Number.isFinite(it.order) ? it.order : idx,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((it, idx) => ({ ...it, order: idx }));

      if (!items.length) throw new Error("Add at least 1 carousel item");
      const missing = items.findIndex((it) => !it.imageUrl);
      if (missing !== -1) throw new Error(`Item #${missing + 1} imageUrl is required`);

      await setDoc(
        doc(db, "bannerCarousels", placement),
        {
          active: Boolean(c.active),
          placement,
          size: c.size,
          title: normalize(c.title) ? c.title : deleteField(),
          subtitle: normalize(c.subtitle) ? c.subtitle : deleteField(),
          items: items.map((it) => {
            const out: any = {
              id: it.id,
              imageUrl: it.imageUrl,
              active: it.active,
              order: it.order,
            };
            if (it.alt) out.alt = it.alt;
            if (it.href) out.href = it.href;
            if (it.label) out.label = it.label;
            return out;
          }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCarousel(placement, (prev) => ({ ...prev, items }));
      setCarouselSavedMsg(`Saved ${placement.replace("_", " ")} carousel`);
    } catch (e: any) {
      setCarouselError(e?.message || "Failed to save carousel");
    } finally {
      setCarouselSaving(false);
    }
  };

  const deleteCarousel = async (placement: BannerPlacement) => {
    if (!confirm(`Delete ${placement.replace("_", " ")} carousel?`)) return;
    setCarouselSaving(true);
    setCarouselError(null);
    setCarouselSavedMsg(null);
    try {
      await deleteDoc(doc(db, "bannerCarousels", placement));
      setCarousels((prev) => ({ ...prev, [placement]: makeDefaultCarouselForm(placement) }));
      setCarouselSavedMsg(`Deleted ${placement.replace("_", " ")} carousel`);
    } catch (e: any) {
      setCarouselError(e?.message || "Failed to delete carousel");
    } finally {
      setCarouselSaving(false);
    }
  };

  /* ---------------- Submit ---------------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let configParsed: Record<string, any> | undefined;
    if (form.configJson.trim()) {
      try {
        configParsed = JSON.parse(form.configJson);
      } catch {
        alert("Invalid config JSON");
        setSaving(false);
        return;
      }
    }

    const payload = {
      page: "home",
      title: form.title,
      type: form.type,
      order: Number(form.order),
      productIds: selectedProductIds,
      collectionIds: selectedCollectionIds,
      config: configParsed,
    };

    if (editingId) {
      await updateDoc(doc(db, "homepageSections", editingId), payload);
      setSections((prev) =>
        prev.map((s) =>
          s.id === editingId ? { ...s, ...payload } : s
        )
      );
    } else {
      const ref = await addDoc(
        collection(db, "homepageSections"),
        payload
      );
      setSections((prev) => [...prev, { id: ref.id, ...payload }]);
    }

    setEditingId(null);
    setForm(emptyForm);
    setSelectedProductIds([]);
    setSelectedCollectionIds([]);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this section?")) return;
    await deleteDoc(doc(db, "homepageSections", id));
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  /* ---------------- UI ---------------- */

  return (
    <AdminLayout
      title="Homepage layout"
      subtitle="Add, edit, and control homepage sections."
    >
      <section className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-200">Homepage banner carousel</div>
            <div className="text-xs text-neutral-400 mt-1">
              Showcase offers, launches and curated collections with a rotating carousel.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCarouselPlacement("home_top")}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                carouselPlacement === "home_top"
                  ? "border-yellow-500/60 text-yellow-200 bg-yellow-500/10"
                  : "border-neutral-700 text-neutral-200 hover:bg-neutral-950"
              }`}
            >
              Home top
            </button>
            <button
              type="button"
              onClick={() => setCarouselPlacement("home_bottom")}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                carouselPlacement === "home_bottom"
                  ? "border-yellow-500/60 text-yellow-200 bg-yellow-500/10"
                  : "border-neutral-700 text-neutral-200 hover:bg-neutral-950"
              }`}
            >
              Home bottom
            </button>
          </div>
        </div>

        {carouselLoading ? (
          <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/30 p-4 text-sm text-neutral-400">
            Loading carousel…
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex items-center gap-2 text-sm md:col-span-1">
                    <input
                      type="checkbox"
                      checked={carousels[carouselPlacement].active}
                      onChange={(e) =>
                        setCarousel(carouselPlacement, (prev) => ({ ...prev, active: e.target.checked }))
                      }
                    />
                    Active
                  </label>
                  <div className="md:col-span-1">
                    <label className="text-sm">Placement</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
                      value={carousels[carouselPlacement].placement}
                      disabled
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-sm">Size</label>
                    <select
                      className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                      value={carousels[carouselPlacement].size}
                      onChange={(e) =>
                        setCarousel(carouselPlacement, (prev) => ({ ...prev, size: e.target.value as any }))
                      }
                    >
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm">Title (optional)</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                      value={carousels[carouselPlacement].title}
                      onChange={(e) =>
                        setCarousel(carouselPlacement, (prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="Festive offers"
                    />
                  </div>
                  <div>
                    <label className="text-sm">Subtitle (optional)</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                      value={carousels[carouselPlacement].subtitle}
                      onChange={(e) =>
                        setCarousel(carouselPlacement, (prev) => ({ ...prev, subtitle: e.target.value }))
                      }
                      placeholder="Limited-time savings across curated collections"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-semibold text-neutral-200">Carousel items</div>
                    <div className="text-xs text-neutral-500 mt-1">imageUrl is required for every item.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => normalizeCarouselOrder(carouselPlacement)}
                      className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-950 transition"
                    >
                      Normalize order
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCarousel(carouselPlacement, (prev) => ({
                          ...prev,
                          items: [
                            ...prev.items,
                            {
                              id: crypto.randomUUID(),
                              imageUrl: "",
                              alt: "",
                              href: "",
                              label: "",
                              active: true,
                              order: prev.items.length,
                            },
                          ],
                        }))
                      }
                      className="text-[11px] rounded-full border border-yellow-500/60 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition"
                    >
                      + Add item
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {[...carousels[carouselPlacement].items]
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map((it, idx, arr) => (
                      <div key={it.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-neutral-400">Item #{idx + 1}</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => moveCarouselItem(carouselPlacement, idx, -1)}
                              disabled={idx === 0}
                              className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-950 transition disabled:opacity-50"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveCarouselItem(carouselPlacement, idx, 1)}
                              disabled={idx === arr.length - 1}
                              className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-950 transition disabled:opacity-50"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCarousel(carouselPlacement, (prev) => ({
                                  ...prev,
                                  items: prev.items.filter((x) => x.id !== it.id),
                                }))
                              }
                              className="text-[11px] rounded-full border border-red-500/60 px-3 py-1.5 text-red-200 hover:bg-red-500/10 transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <label className="text-sm">Image URL</label>
                            <input
                              className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                              value={it.imageUrl}
                              onChange={(e) =>
                                setCarousel(carouselPlacement, (prev) => ({
                                  ...prev,
                                  items: prev.items.map((x) =>
                                    x.id === it.id ? { ...x, imageUrl: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="https://..."
                              required
                            />
                          </div>

                          <div>
                            <label className="text-sm">Alt (optional)</label>
                            <input
                              className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                              value={it.alt}
                              onChange={(e) =>
                                setCarousel(carouselPlacement, (prev) => ({
                                  ...prev,
                                  items: prev.items.map((x) =>
                                    x.id === it.id ? { ...x, alt: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="Elegant diamond pendant"
                            />
                          </div>

                          <div>
                            <label className="text-sm">Link (optional)</label>
                            <input
                              className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                              value={it.href}
                              onChange={(e) =>
                                setCarousel(carouselPlacement, (prev) => ({
                                  ...prev,
                                  items: prev.items.map((x) =>
                                    x.id === it.id ? { ...x, href: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="/collection/xyz or https://..."
                            />
                          </div>

                          <div>
                            <label className="text-sm">Label (optional)</label>
                            <input
                              className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                              value={it.label}
                              onChange={(e) =>
                                setCarousel(carouselPlacement, (prev) => ({
                                  ...prev,
                                  items: prev.items.map((x) =>
                                    x.id === it.id ? { ...x, label: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="New"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-3 md:col-span-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={it.active}
                                onChange={(e) =>
                                  setCarousel(carouselPlacement, (prev) => ({
                                    ...prev,
                                    items: prev.items.map((x) =>
                                      x.id === it.id ? { ...x, active: e.target.checked } : x
                                    ),
                                  }))
                                }
                              />
                              Active
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-neutral-500">Order</div>
                              <input
                                type="number"
                                className="w-24 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
                                value={it.order}
                                onChange={(e) =>
                                  setCarousel(carouselPlacement, (prev) => ({
                                    ...prev,
                                    items: prev.items.map((x) =>
                                      x.id === it.id ? { ...x, order: e.target.valueAsNumber } : x
                                    ),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-neutral-400">
                    {carousels[carouselPlacement].items.length} item(s)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => deleteCarousel(carouselPlacement)}
                      disabled={carouselSaving}
                      className="rounded-lg border border-red-500/60 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/10 transition disabled:opacity-60"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCarousel(carouselPlacement)}
                      disabled={carouselSaving}
                      className="rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium hover:bg-yellow-400 transition disabled:opacity-60"
                    >
                      {carouselSaving ? "Saving…" : "Save carousel"}
                    </button>
                  </div>
                </div>

                {(carouselError || carouselSavedMsg) && (
                  <div className="mt-4">
                    {carouselSavedMsg && <div className="text-sm text-green-300">{carouselSavedMsg}</div>}
                    {carouselError && <div className="text-sm text-red-300">{carouselError}</div>}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-5">
                <div className="text-sm font-semibold text-neutral-200">Size suggestions</div>
                <div className="mt-3 space-y-3 text-sm text-neutral-300">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="text-xs text-neutral-400">Recommended default</div>
                    <div className="mt-1 text-sm text-neutral-100">Medium (md)</div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Best balance of visibility and conversion. Keeps products close to the fold.
                    </div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="text-xs text-neutral-400">Use Large (lg) when</div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Big campaigns (sale launch, new collection drop). Use short durations so it doesn’t push product discovery down.
                    </div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="text-xs text-neutral-400">Use Small (sm) when</div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Subtle promotions or trust-building banners near the bottom of the homepage.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-5">
                <div className="text-sm font-semibold text-neutral-200">Placement tips</div>
                <div className="mt-2 text-[11px] text-neutral-400">
                  Home top is best for flagship promotions. Home bottom works well for secondary offers and category discovery.
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-sm">Section title</label>
            <input
              className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm">Order</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.order}
              onChange={(e) =>
                handleChange("order", e.target.valueAsNumber || 1)
              }
            />
          </div>
        </div>

        <div>
          <label className="text-sm">Section type</label>
          <select
            className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.type}
            onChange={(e) =>
              handleChange("type", e.target.value as any)
            }
          >
            <option value="featuredProducts">Featured products</option>
            <option value="collectionsRow">Collections row</option>
            <option value="banner">Banner / text</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Products</label>
          <select
            multiple
            className="mt-1 w-full h-36 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={selectedProductIds}
            onChange={(e) =>
              setSelectedProductIds(
                Array.from(e.target.selectedOptions).map((o) => o.value)
              )
            }
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm">Collections</label>
          <select
            multiple
            className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={selectedCollectionIds}
            onChange={(e) =>
              setSelectedCollectionIds(
                Array.from(e.target.selectedOptions).map((o) => o.value)
              )
            }
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm">Config JSON</label>
          <textarea
            className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs font-mono"
            rows={5}
            value={form.configJson}
            onChange={(e) => handleChange("configJson", e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={saving}
            className="rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : editingId
              ? "Update section"
              : "Add section"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setSelectedProductIds([]);
                setSelectedCollectionIds([]);
              }}
              className="text-sm text-neutral-400 underline"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {/* LIST */}
      <div className="space-y-3">
        {sections.map((s) => (
          <div
            key={s.id}
            className="flex justify-between items-start rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium">
                #{s.order} · {s.title}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Type: {s.type}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startEdit(s)}
                className="text-xs px-3 py-1 rounded-full bg-blue-600/80"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-xs px-3 py-1 rounded-full bg-red-600/80"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
