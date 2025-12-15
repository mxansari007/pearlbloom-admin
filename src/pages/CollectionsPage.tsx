// src/pages/CollectionsPage.tsx
import { useEffect, useState } from "react";
import {
  db,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import AdminLayout from "../layouts/AdminLayout";

/* ---------------- Types ---------------- */

type CloudinaryImage = {
  url: string;
  public_id: string;
};

type CollectionItem = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  priority?: number;
  isFeatured?: boolean;
  thumbnail?: CloudinaryImage;
};

const emptyForm: Omit<CollectionItem, "id"> = {
  name: "",
  slug: "",
  description: "",
  priority: 1,
  isFeatured: true,
  thumbnail: undefined,
};

export default function CollectionsPage() {
  const [collectionsList, setCollectionsList] = useState<CollectionItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  const functions = getFunctions(undefined, "us-central1");
  const uploadImage = httpsCallable(functions, "uploadImageCallable");
  const deleteImage = httpsCallable(functions, "deleteImageCallable");

  /* ---------------- Fetch collections ---------------- */

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "collections"));
      const items: CollectionItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      items.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      setCollectionsList(items);
    })();
  }, []);

  /* ---------------- Helpers ---------------- */

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleChange = (field: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /* ---------------- Thumbnail upload ---------------- */

  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingThumb(true);

    try {
      const base64 = await fileToBase64(file);

      // delete old thumbnail if exists
      if (form.thumbnail?.public_id) {
        await deleteImage({ public_id: form.thumbnail.public_id });
      }

      const res: any = await uploadImage({
        base64,
        filename: file.name,
        folder: "collections",
      });

      setForm((prev) => ({
        ...prev,
        thumbnail: {
          url: res.data.url,
          public_id: res.data.public_id,
        },
      }));
    } catch (err) {
      console.error(err);
      alert("Thumbnail upload failed");
    } finally {
      setUploadingThumb(false);
    }
  };

  /* ---------------- Submit ---------------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      priority: Number(form.priority),
    };

    if (!payload.slug) {
      payload.slug = payload.name.toLowerCase().replace(/\s+/g, "-");
    }

    if (editingId) {
      await updateDoc(doc(db, "collections", editingId), payload);
      setCollectionsList((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, ...payload } : c))
      );
    } else {
      const ref = await addDoc(collection(db, "collections"), payload);
      setCollectionsList((prev) => [...prev, { ...payload, id: ref.id }]);
    }

    resetForm();
    setSaving(false);
  };

  const handleEdit = (item: CollectionItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      slug: item.slug,
      description: item.description ?? "",
      priority: item.priority ?? 1,
      isFeatured: item.isFeatured ?? true,
      thumbnail: item.thumbnail,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection?")) return;

    const item = collectionsList.find((c) => c.id === id);
    if (item?.thumbnail?.public_id) {
      await deleteImage({ public_id: item.thumbnail.public_id });
    }

    await deleteDoc(doc(db, "collections", id));
    setCollectionsList((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
  };

  /* ---------------- UI ---------------- */

  return (
    <AdminLayout
      title="Collections"
      subtitle="Group products into engagement, necklaces, earrings and more."
    >
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input
            placeholder="Name"
            className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
          />
          <input
            placeholder="Slug"
            className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.slug}
            onChange={(e) => handleChange("slug", e.target.value)}
          />
        </div>

        <textarea
          rows={3}
          placeholder="Description"
          className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
        />

        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="number"
            className="w-24 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.priority}
            onChange={(e) =>
              handleChange("priority", e.target.valueAsNumber || 1)
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) =>
                handleChange("isFeatured", e.target.checked)
              }
            />
            Featured on homepage
          </label>
        </div>

        {/* Thumbnail */}
        <div>
          <label className="text-sm">Collection thumbnail</label>
          <input
            type="file"
            accept="image/*"
            className="mt-1 block text-sm"
            onChange={handleThumbnailUpload}
          />
          {uploadingThumb && (
            <p className="text-xs text-neutral-400 mt-1">Uploading…</p>
          )}
          {form.thumbnail?.url && (
            <img
              src={form.thumbnail.url}
              alt="Thumbnail"
              className="mt-2 h-24 rounded-lg object-cover border border-neutral-700"
            />
          )}
        </div>

        <button
          disabled={saving}
          className="rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium"
        >
          {editingId ? "Save changes" : "Add collection"}
        </button>
      </form>

      {/* Table */}
      <table className="w-full text-sm border border-neutral-800 rounded-xl overflow-hidden">
        <thead className="bg-neutral-900">
          <tr>
            <th className="px-4 py-3 text-left">Image</th>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">Slug</th>
            <th className="px-4 py-3 text-left">Priority</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {collectionsList.map((c) => (
            <tr key={c.id} className="border-t border-neutral-800">
              <td className="px-4 py-3">
                {c.thumbnail?.url ? (
                  <img
                    src={c.thumbnail.url}
                    className="h-10 w-10 rounded-md object-cover"
                  />
                ) : (
                  <span className="text-xs text-neutral-500">—</span>
                )}
              </td>
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3 text-neutral-400">{c.slug}</td>
              <td className="px-4 py-3">{c.priority}</td>
              <td className="px-4 py-3 text-right space-x-2">
                <button
                  onClick={() => handleEdit(c)}
                  className="text-xs px-3 py-1 rounded-full bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-xs px-3 py-1 rounded-full bg-red-600/80"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
