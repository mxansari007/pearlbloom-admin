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
import { getCached, invalidateCache } from "../lib/cache";

// Cache TTL for collections list (2 minutes)
const CACHE_TTL_COLLECTIONS = 2 * 60 * 1000;

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

const CollectionRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-4 py-3">
      <div className="h-10 w-10 rounded-md bg-neutral-700"></div>
    </td>
    <td className="px-4 py-3">
      <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
    </td>
    <td className="px-4 py-3">
      <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
    </td>
    <td className="px-4 py-3">
      <div className="h-4 bg-neutral-700 rounded w-1/4"></div>
    </td>
    <td className="px-4 py-3 text-right space-x-2">
      <div className="h-6 w-12 bg-neutral-700 rounded-full inline-block"></div>
      <div className="h-6 w-16 bg-neutral-700 rounded-full inline-block"></div>
    </td>
  </tr>
);

export default function CollectionsPage() {
  const [collectionsList, setCollectionsList] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof typeof emptyForm, string>>
  >({});
  const [slugTouched, setSlugTouched] = useState(false);

  const functions = getFunctions(undefined, "us-central1");
  const uploadImage = httpsCallable(functions, "uploadImageCallable");
  const deleteImage = httpsCallable(functions, "deleteImageCallable");

  /* ---------------- Fetch collections ---------------- */

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const items = await getCached<CollectionItem[]>(
          "collections:list",
          async () => {
            const snap = await getDocs(collection(db, "collections"));
            const data: CollectionItem[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            }));
            data.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
            return data;
          },
          CACHE_TTL_COLLECTIONS
        );
        setCollectionsList(items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------------- Helpers ---------------- */

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFieldErrors({});
    setFormError(null);
    setFormSuccess(null);
    setSlugTouched(false);
  };

  const handleChange = (field: keyof typeof form, value: any) => {
    if (field === "slug") setSlugTouched(true);
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
    setFormError(null);
    setFormSuccess(null);
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && !slugTouched) {
        next.slug = slugify(String(value || ""));
      }
      return next;
    });
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
    setFormError(null);
    setFormSuccess(null);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select a valid image file.");
      }
      const maxBytes = 3 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error("Image is too large. Max size is 3MB.");
      }

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

      if (!res?.data?.url || !res?.data?.public_id) {
        throw new Error("Upload failed. No image URL returned.");
      }

      setForm((prev) => ({
        ...prev,
        thumbnail: {
          url: res.data.url,
          public_id: res.data.public_id,
        },
      }));
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error ? err.message : "Thumbnail upload failed"
      );
    } finally {
      setUploadingThumb(false);
      if (e.target) e.target.value = "";
    }
  };

  /* ---------------- Submit ---------------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const normalizedName = form.name.trim();
      const normalizedSlug = slugify(form.slug || normalizedName);
      const priorityNumber = Number(form.priority);

      const nextFieldErrors: Partial<Record<keyof typeof emptyForm, string>> =
        {};
      if (!normalizedName) nextFieldErrors.name = "Name is required.";
      if (!normalizedSlug) nextFieldErrors.slug = "Slug is required.";
      if (normalizedSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
        nextFieldErrors.slug =
          "Slug must contain only lowercase letters, numbers, and hyphens.";
      }
      if (!Number.isFinite(priorityNumber) || priorityNumber < 0) {
        nextFieldErrors.priority = "Priority must be 0 or more.";
      }

      if (Object.keys(nextFieldErrors).length) {
        setFieldErrors(nextFieldErrors);
        return;
      }

      const payload: Omit<CollectionItem, "id"> = {
        ...form,
        name: normalizedName,
        slug: normalizedSlug,
        priority: priorityNumber,
      };

      if (editingId) {
        await updateDoc(doc(db, "collections", editingId), payload);
        setCollectionsList((prev) =>
          prev
            .map((c) => (c.id === editingId ? { ...c, ...payload } : c))
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        );
        setFormSuccess("Collection updated.");
      } else {
        const ref = await addDoc(collection(db, "collections"), payload);
        setCollectionsList((prev) =>
          [...prev, { ...payload, id: ref.id }].sort(
            (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
          )
        );
        setFormSuccess("Collection created.");
      }

      // Invalidate cache
      invalidateCache("collections:list");
      invalidateCache("dashboard:counts");

      resetForm();
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || "Failed to save collection.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: CollectionItem) => {
    setEditingId(item.id);
    setFormError(null);
    setFormSuccess(null);
    setFieldErrors({});
    setSlugTouched(true);
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

    setFormError(null);
    setFormSuccess(null);
    try {
      const item = collectionsList.find((c) => c.id === id);
      if (item?.thumbnail?.public_id) {
        await deleteImage({ public_id: item.thumbnail.public_id });
      }

      await deleteDoc(doc(db, "collections", id));
      setCollectionsList((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) resetForm();
      
      // Invalidate cache
      invalidateCache("collections:list");
      invalidateCache("dashboard:counts");
      
      setFormSuccess("Collection deleted.");
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || "Failed to delete collection.");
    }
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
        className="mb-6 sm:mb-8 rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">{editingId ? "✏️" : "➕"}</span>
          <h3 className="text-sm font-semibold">{editingId ? "Edit Collection" : "Add New Collection"}</h3>
        </div>

        {formError && (
          <div className="rounded-xl border border-red-500/30 bg-gradient-to-r from-red-950/40 to-red-900/20 px-4 py-3 flex items-start gap-2">
            <span>⚠️</span>
            <p className="text-[12px] text-red-300">{formError}</p>
          </div>
        )}
        {formSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 px-4 py-3 flex items-start gap-2">
            <span>✅</span>
            <p className="text-[12px] text-emerald-300">{formSuccess}</p>
          </div>
        )}

        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Name</label>
            <input
              placeholder="e.g. Engagement Rings"
              className={`w-full rounded-xl bg-neutral-900/60 border px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition ${
                fieldErrors.name ? "border-red-500/60" : "border-neutral-700"
              }`}
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && (
              <p className="text-[10px] text-red-300 mt-1">{fieldErrors.name}</p>
            )}
          </div>
          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Slug</label>
            <input
              placeholder="engagement-rings"
              className={`w-full rounded-xl bg-neutral-900/60 border px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition ${
                fieldErrors.slug ? "border-red-500/60" : "border-neutral-700"
              }`}
              value={form.slug}
              onChange={(e) => handleChange("slug", e.target.value)}
              aria-invalid={Boolean(fieldErrors.slug)}
            />
            {fieldErrors.slug ? (
              <p className="text-[10px] text-red-300 mt-1">{fieldErrors.slug}</p>
            ) : (
              <p className="text-[10px] text-neutral-500 mt-1">
                Auto-generated from name
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Description</label>
          <textarea
            rows={2}
            placeholder="Brief description of this collection..."
            className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none"
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Priority</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              className={`w-20 rounded-xl bg-neutral-900/60 border px-3 py-2.5 text-sm text-center focus:outline-none focus:border-yellow-500/50 transition ${
                fieldErrors.priority ? "border-red-500/60" : "border-neutral-700"
              }`}
              value={form.priority}
              onChange={(e) =>
                handleChange("priority", e.target.valueAsNumber || 0)
              }
              aria-invalid={Boolean(fieldErrors.priority)}
            />
            {fieldErrors.priority && (
              <p className="text-[10px] text-red-300 mt-1">{fieldErrors.priority}</p>
            )}
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer bg-neutral-900/40 px-3 py-2.5 rounded-xl border border-neutral-800 hover:border-yellow-500/40 transition">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-yellow-500"
              checked={form.isFeatured}
              onChange={(e) => handleChange("isFeatured", e.target.checked)}
            />
            <span className="text-neutral-300">Featured on homepage</span>
          </label>
        </div>

        {/* Thumbnail */}
        <div>
          <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Thumbnail</label>
          <div className="flex items-center gap-4">
            {form.thumbnail?.url ? (
              <img
                src={form.thumbnail.url}
                alt="Thumbnail"
                className="h-16 w-16 rounded-xl object-cover border border-neutral-700"
              />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-neutral-800 flex items-center justify-center text-2xl border border-dashed border-neutral-600">
                📷
              </div>
            )}
            <div className="flex-1">
              <label className="inline-flex items-center gap-2 cursor-pointer bg-neutral-800 hover:bg-neutral-700 px-3 py-2 rounded-xl text-xs transition">
                <span>Choose file</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleThumbnailUpload}
                />
              </label>
              {uploadingThumb && (
                <p className="text-[10px] text-yellow-400 mt-1.5 animate-pulse">Uploading…</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            disabled={saving || uploadingThumb}
            className="rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Add collection"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="w-12 h-12 bg-neutral-700 rounded-lg"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-neutral-700 rounded w-3/4"></div>
                <div className="h-3 bg-neutral-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        ))}

        {!loading && collectionsList.map((c) => (
          <div key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 hover:border-yellow-500/40 transition">
            <div className="flex gap-3">
              {c.thumbnail?.url ? (
                <img src={c.thumbnail.url} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" alt={c.name} />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center text-xl">🏷️</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-white truncate">{c.name}</h3>
                  {c.isFeatured && <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full">Featured</span>}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">/{c.slug} · Priority: {c.priority}</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleEdit(c)} className="text-[11px] px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition">Edit</button>
                  <button onClick={() => handleDelete(c.id)} className="text-[11px] px-3 py-1 rounded-full bg-red-600/20 text-red-400 hover:bg-red-600/30 transition">Delete</button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {!loading && collectionsList.length === 0 && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-8 text-center">
            <div className="text-4xl mb-3 opacity-40">🏷️</div>
            <p className="text-sm text-neutral-400">No collections yet</p>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60">
              <tr>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Image</th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Name</th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider hidden md:table-cell">Slug</th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Priority</th>
                <th className="px-4 sm:px-6 py-3.5 text-right text-[10px] sm:text-xs font-medium text-neutral-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/40">
              {loading && Array.from({ length: 3 }).map((_, i) => <CollectionRowSkeleton key={i} />)}
              {!loading && collectionsList.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-900/50 transition group">
                  <td className="px-4 sm:px-6 py-4">
                    {c.thumbnail?.url ? (
                      <img src={c.thumbnail.url} className="h-10 w-10 rounded-lg object-cover" alt={c.name} />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-neutral-800 flex items-center justify-center text-lg">🏷️</div>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="font-medium text-white group-hover:text-yellow-200 transition">{c.name}</div>
                    {c.isFeatured && <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full mt-1 inline-block">Featured</span>}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-neutral-500 hidden md:table-cell">
                    <span className="bg-neutral-800/60 px-2 py-1 rounded text-xs">/{c.slug}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300">
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => handleEdit(c)} className="text-[11px] px-3 py-1.5 rounded-full bg-neutral-800 hover:bg-neutral-700 transition font-medium">Edit</button>
                      <button onClick={() => handleDelete(c.id)} className="text-[11px] px-3 py-1.5 rounded-full bg-red-600/20 text-red-400 hover:bg-red-600/30 transition font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && collectionsList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="text-4xl mb-3 opacity-40">🏷️</div>
                    <p className="text-sm text-neutral-400">No collections yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
