import { useEffect, useState } from "react";
import {
  db,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

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
