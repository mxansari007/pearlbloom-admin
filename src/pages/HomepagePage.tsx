import { useEffect, useState } from "react";
import {
  db,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";

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

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  /* ---------------- Fetch homepage sections ---------------- */

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

  /* ---------------- Handlers ---------------- */

  const handleChange = (field: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let configParsed: Record<string, any> | undefined;
    if (form.configJson.trim()) {
      try {
        configParsed = JSON.parse(form.configJson);
      } catch {
        alert("Config JSON is invalid.");
        setSaving(false);
        return;
      }
    }

    const productIds = selectedProductIds;
    const collectionIds = selectedCollectionIds;

    const docRef = await addDoc(collection(db, "homepageSections"), {
      page: "home",
      title: form.title,
      type: form.type,
      order: Number(form.order),
      productIds,
      collectionIds,
      config: configParsed,
    });

    setSections((prev) => [
      ...prev,
      {
        id: docRef.id,
        title: form.title,
        type: form.type,
        order: Number(form.order),
        productIds,
        collectionIds,
        config: configParsed,
      },
    ]);

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
      subtitle="Control sections like hero, featured pieces and collections rows."
    >
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
      >
        <p className="text-sm text-neutral-400 mb-2">
          These sections are rendered in order on the homepage. Your public site
          should read from this collection to build rows.
        </p>

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
            <option value="featuredProducts">Featured products row</option>
            <option value="collectionsRow">Collections row</option>
            <option value="banner">Banner / text block</option>
          </select>
        </div>

        {/* Product selector */}
        <div>
          <label className="text-sm">Select products (optional)</label>
          <select
            multiple
            className="mt-1 w-full h-40 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
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
          <p className="text-xs text-neutral-500 mt-1">
            Hold Ctrl / Cmd to select multiple products
          </p>
        </div>

        {/* Collection selector */}
        <div>
          <label className="text-sm">Select collections (optional)</label>
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
          <label className="text-sm">
            Config JSON (optional – layout tweaks per section)
          </label>
          <textarea
            className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs font-mono"
            rows={5}
            value={form.configJson}
            onChange={(e) => handleChange("configJson", e.target.value)}
          />
        </div>

        <button
          disabled={saving}
          className="mt-2 rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add section"}
        </button>
      </form>

      {/* List */}
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
              {s.productIds?.length > 0 && (
                <p className="text-xs text-neutral-400 mt-1">
                  Products: {s.productIds.join(", ")}
                </p>
              )}
              {s.collectionIds?.length > 0 && (
                <p className="text-xs text-neutral-400 mt-1">
                  Collections: {s.collectionIds.join(", ")}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDelete(s.id)}
              className="text-xs px-3 py-1 rounded-full bg-red-600/80"
            >
              Delete
            </button>
          </div>
        ))}

        {sections.length === 0 && (
          <p className="text-sm text-neutral-400">
            No sections yet. Add your first homepage section above.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
