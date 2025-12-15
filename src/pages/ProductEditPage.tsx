// src/pages/ProductEditPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  db,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  serverTimestamp
} from "../firebase";
import AdminLayout from "../layouts/AdminLayout";

import { getUploadCallable, getDeleteCallable } from "../lib/functions";
import type { HttpsCallable } from "firebase/functions";

type Attribute = {
  key: string;
  value: string;
};

type Marketplaces = {
  amazon: string;
  flipkart: string;
  meesho: string;
};

type ProductForm = {
  name: string;
  slug: string;
  brand: string;
  price: number;
  currency: string;
  shortDescription: string;
  description: string;
  attributes: Attribute[]; // dynamic specs: Metal, Gemstone, SKU, etc.
  categories: string[];
  collectionId: string;
  isFeatured: boolean;
  thumbnailUrl: string;
  images: string[];
  marketplaces: Marketplaces;
};

type CollectionOption = {
  id: string;
  name: string;
};


const emptyForm: ProductForm = {
  name: "",
  slug: "",
  brand: "",
  price: 0,
  currency: "INR",
  shortDescription: "",
  description: "",
  attributes: [],
  categories: [],
  collectionId: "",
  isFeatured: false,
  thumbnailUrl: "",
  images: [],
  marketplaces: {
    amazon: "",
    flipkart: "",
    meesho: "",
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ProductEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
const [collections, setCollections] = useState<CollectionOption[]>([]);

  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingGalleryMap, setUploadingGalleryMap] = useState<Record<string, boolean>>({});
  const [imagesMeta, setImagesMeta] = useState<Record<string, string>>({});

  const isNew = id === "new";

  useEffect(() => {
  (async () => {
    const snap = await getDocs(collection(db, "collections"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      name: d.data().name,
    }));
    setCollections(list);
  })();
}, []);

  // create callable handlers (deployed or emulator per src/lib/functions.ts)
  const callUploadImage = useMemo(() => {
    try {
      return getUploadCallable();
    } catch (e) {
      console.error("Failed to create upload callable:", e);
      return undefined;
    }
  }, []) as HttpsCallable | undefined;

  const callDeleteImage = useMemo(() => {
    try {
      return getDeleteCallable();
    } catch (e) {
      console.error("Failed to create delete callable:", e);
      return undefined;
    }
  }, []) as HttpsCallable | undefined;

  // Load existing product (if editing)
  useEffect(() => {
    if (!isNew && id) {
      (async () => {
        try {
          const snap = await getDoc(doc(db, "products", id));
          if (snap.exists()) {
            const data = snap.data() as any;
            const attrs: Attribute[] = Array.isArray(data.attributes) ? data.attributes : [];

            const addIfNotExists = (key: string, value?: string) => {
              if (!value) return;
              const exists = attrs.some((a) => a.key.toLowerCase() === key.toLowerCase());
              if (!exists) attrs.push({ key, value });
            };

            addIfNotExists("Metal", data.metal);
            addIfNotExists("Gemstone", data.gemstone);
            addIfNotExists("SKU", data.sku);

            setForm({
              name: data.name ?? "",
              slug: data.slug ?? "",
              brand: data.brand ?? "",
              price: data.price ?? 0,
              currency: data.currency ?? "INR",
              shortDescription: data.shortDescription ?? "",
              description: data.description ?? data.fullDescription ?? "",
              attributes: attrs,
              categories: Array.isArray(data.categories) ? data.categories : [],
              collectionId: data.collectionId ?? "",
              isFeatured: data.isFeatured ?? false,
              thumbnailUrl: data.thumbnailUrl ?? "",
              images: Array.isArray(data.images) ? data.images : [],
              marketplaces: {
                amazon: data.marketplaces?.amazon ?? "",
                flipkart: data.marketplaces?.flipkart ?? "",
                meesho: data.marketplaces?.meesho ?? "",
              },
            });

            if (data.imagesMeta && typeof data.imagesMeta === "object") {
              setImagesMeta(data.imagesMeta);
            }
          }
        } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to load product.");
        }
      })();
    }
  }, [id, isNew]);

  const handleChange = (field: keyof ProductForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateMarketplace = (field: keyof Marketplaces, value: string) => {
    setForm((prev) => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [field]: value,
      },
    }));
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = (e) => reject(e);
      fr.readAsDataURL(file);
    });

  const uploadFileViaCallable = async (file: File) => {
    if (!callUploadImage) throw new Error("Cloud function client not initialized.");
    const dataUrl = await fileToDataUrl(file);
    const payload = { filename: file.name, mimeType: file.type, base64: dataUrl };

    try {
      const res = await callUploadImage(payload);
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err: any) {
      console.error("uploadFileViaCallable error:", err);
      throw new Error(err?.message || "Upload failed");
    }
  };

  const deleteImageViaCallable = async (publicId: string) => {
    if (!callDeleteImage) throw new Error("Cloud function client not initialized.");
    try {
      const res = await callDeleteImage({ public_id: publicId });
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      return data.result;
    } catch (err: any) {
      console.error("deleteImageViaCallable error:", err);
      throw new Error(err?.message || "Delete failed");
    }
  };

  const handleThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingThumbnail(true);

    const localPreview = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, thumbnailUrl: localPreview }));

    try {
      const uploaded = await uploadFileViaCallable(file);
      if (!uploaded?.url) throw new Error("No URL returned from upload");
      setForm((prev) => ({ ...prev, thumbnailUrl: uploaded.url }));
      if (uploaded.public_id) setImagesMeta((m) => ({ ...m, [uploaded.url]: uploaded.public_id }));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Thumbnail upload failed.");
      setForm((prev) => ({ ...prev, thumbnailUrl: "" }));
    } finally {
      setUploadingThumbnail(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);

    for (const file of Array.from(files)) {
      const tempKey = `${file.name}-${Date.now()}`;
      setUploadingGalleryMap((m) => ({ ...m, [tempKey]: true }));

      const localPreview = URL.createObjectURL(file);
      setForm((prev) => ({ ...prev, images: [...prev.images, localPreview] }));

      try {
        const uploaded = await uploadFileViaCallable(file);
        if (!uploaded?.url) throw new Error("No URL returned from upload");

        setForm((prev) => {
          const images = [...prev.images];
          const idx = images.indexOf(localPreview);
          if (idx !== -1) images[idx] = uploaded.url;
          else images.push(uploaded.url);
          return { ...prev, images };
        });

        if (uploaded.public_id) setImagesMeta((m) => ({ ...m, [uploaded.url]: uploaded.public_id }));
      } catch (err: any) {
        console.error("File upload failed", err);
        setError(err.message || "One file failed to upload.");
        setForm((prev) => ({ ...prev, images: prev.images.filter((u) => u !== localPreview) }));
      } finally {
        setUploadingGalleryMap((m) => {
          const copy = { ...m };
          delete copy[tempKey];
          return copy;
        });
      }
    }

    if (e.target) e.target.value = "";
  };

  const removeGalleryImage = async (url: string) => {
    setError(null);
    setForm((prev) => ({ ...prev, images: prev.images.filter((img) => img !== url) }));

    const publicId = imagesMeta[url];
    if (!publicId) {
      setImagesMeta((m) => {
        const copy = { ...m };
        delete copy[url];
        return copy;
      });
      return;
    }

    try {
      await deleteImageViaCallable(publicId);
      setImagesMeta((m) => {
        const copy = { ...m };
        delete copy[url];
        return copy;
      });
    } catch (err: any) {
      console.error("Delete failed", err);
      setError(err.message || "Failed to delete image on server.");
      setForm((prev) => ({ ...prev, images: [...prev.images, url] }));
    }
  };

  const addAttribute = () => {
    setForm((prev) => ({ ...prev, attributes: [...prev.attributes, { key: "", value: "" }] }));
  };

  const updateAttribute = (index: number, field: keyof Attribute, value: string) => {
    setForm((prev) => {
      const attrs = [...prev.attributes];
      attrs[index] = { ...attrs[index], [field]: value };
      return { ...prev, attributes: attrs };
    });
  };

  const removeAttributeIndex = (index: number) => {
    setForm((prev) => {
      const attrs = [...prev.attributes];
      attrs.splice(index, 1);
      return { ...prev, attributes: attrs };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const idToUse = isNew ? crypto.randomUUID() : id!;
      const productRef = doc(db, "products", idToUse);

      const slugToSave = form.slug || slugify(form.name);

      await setDoc(
        productRef,
        {
          name: form.name,
          slug: slugToSave,
          brand: form.brand,
          price: Number(form.price),
          currency: form.currency,
          shortDescription: form.shortDescription,
          description: form.description,
          attributes: form.attributes,
          categories: form.categories,
          collectionId: form.collectionId,
          isFeatured: form.isFeatured,
          thumbnailUrl: form.thumbnailUrl,
          images: form.images ?? [],
          imagesMeta: imagesMeta, // persisted so deletes work later
          marketplaces: {
            amazon: form.marketplaces.amazon,
            flipkart: form.marketplaces.flipkart,
            meesho: form.marketplaces.meesho,
          },
          updatedAt: serverTimestamp(),
          ...(isNew && { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      navigate("/products");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const uploadingGalleryCount = Object.keys(uploadingGalleryMap).length;

  return (
    <AdminLayout
      title={isNew ? "Add product" : "Edit product"}
      subtitle="Details, images and metadata for a single piece."
      actions={
        <Link
          to="/products"
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-200 hover:border-yellow-500/70 hover:text-yellow-200 transition"
        >
          ← Back to products
        </Link>
      }
    >
      {error && (
        <p className="mb-4 text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
        {/* Name & slug */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm">Name</label>
            <input
              className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name: value,
                  slug: prev.slug.trim().length === 0 ? slugify(value) : prev.slug,
                }));
              }}
              required
            />
          </div>
          <div>
            <label className="text-sm">Slug (URL identifier)</label>
            <input
              className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
              value={form.slug}
              onChange={(e) => handleChange("slug", e.target.value)}
              placeholder="solitaire-diamond-ring"
            />
          </div>
        </div>

        {/* Price / currency / featured */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm">Price</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
              value={form.price}
              onChange={(e) => handleChange("price", e.target.valueAsNumber)}
              required
            />
          </div>
          <div>
            <label className="text-sm">Currency</label>
            <input
              className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
              value={form.currency}
              onChange={(e) => handleChange("currency", e.target.value)}
            />
          </div>
          <label className="flex items-end space-x-2 text-sm">
            <input type="checkbox" checked={form.isFeatured} onChange={(e) => handleChange("isFeatured", e.target.checked)} />
            <span>Featured on homepage</span>
          </label>
        </div>

        {/* Brand */}
        <div>
          <label className="text-sm">Brand</label>
          <input
            className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
            value={form.brand}
            onChange={(e) => handleChange("brand", e.target.value)}
            placeholder="Aurum"
          />
        </div>

        {/* collection */}

        <div>
  <label className="text-sm">Collection (optional)</label>
  <select
    className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
    value={form.collectionId}
    onChange={(e) => handleChange("collectionId", e.target.value)}
  >
    <option value="">— No collection —</option>
    {collections.map((c) => (
      <option key={c.id} value={c.id}>
        {c.name}
      </option>
    ))}
  </select>
</div>


        {/* Categories */}
        <div>
          <label className="text-sm">Categories (comma separated)</label>
          <input
            className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
            value={form.categories.join(", ")}
            onChange={(e) =>
              handleChange(
                "categories",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="Rings, Engagement"
          />
        </div>

        {/* Short + full description */}
        <div>
          <label className="text-sm">Short description</label>
          <textarea
            className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
            rows={2}
            value={form.shortDescription}
            onChange={(e) => handleChange("shortDescription", e.target.value)}
            placeholder="A timeless solitaire diamond ring in 18K white gold."
          />
        </div>

        <div>
          <label className="text-sm">Full description</label>
          <textarea
            className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
            rows={5}
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Longer storytelling copy for the product page."
          />
        </div>

        {/* Dynamic attributes */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">Specifications / Attributes</p>
            <button
              type="button"
              className="text-xs bg-neutral-800 px-3 py-1 rounded-lg border border-neutral-700 hover:border-yellow-400 hover:text-yellow-300"
              onClick={addAttribute}
            >
              + Add attribute
            </button>
          </div>

          {form.attributes.length === 0 && (
            <p className="text-xs text-neutral-500">
              Add product specs like Metal, Gemstone, SKU, Weight, Size, Certification etc.
            </p>
          )}

          <div className="space-y-2">
            {form.attributes.map((attr, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-center">
                <input
                  className="rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs"
                  placeholder="Attribute name (e.g. Metal)"
                  value={attr.key}
                  onChange={(e) => updateAttribute(index, "key", e.target.value)}
                />
                <input
                  className="rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs"
                  placeholder="Value (e.g. 18K White Gold)"
                  value={attr.value}
                  onChange={(e) => updateAttribute(index, "value", e.target.value)}
                />
                <button type="button" onClick={() => removeAttributeIndex(index)} className="text-xs rounded-lg bg-red-600/80 px-2 py-1">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Thumbnail */}
        <div>
          <label className="text-sm">Thumbnail image (card)</label>
          <input className="mt-1 block text-sm" type="file" accept="image/*" onChange={handleThumbnailChange} />
          {uploadingThumbnail && <p className="mt-2 text-xs text-neutral-400">Uploading thumbnail…</p>}
          {form.thumbnailUrl && <img src={form.thumbnailUrl} alt="Thumbnail" className="mt-2 h-32 rounded-lg object-cover" />}
          <p className="mt-1 text-xs text-neutral-500">Used in product cards / featured pieces.</p>
        </div>

        {/* Gallery */}
        <div>
          <label className="text-sm">Gallery images (for product detail page)</label>
          <input className="mt-1 block text-sm" type="file" accept="image/*" multiple onChange={handleGalleryChange} />
          {form.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {form.images.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="Product" className="h-24 w-24 rounded-lg object-cover border border-neutral-700" />
                  <button type="button" onClick={() => removeGalleryImage(url)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/80 text-xs text-white flex items-center justify-center">
                    ×
                  </button>
                </div>
              ))}

              {uploadingGalleryCount > 0 && (
                <div className="flex items-center space-x-2 text-xs text-neutral-400 mt-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  </svg>
                  <span>Uploading {uploadingGalleryCount} file(s)…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Marketplaces */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-3">
          <p className="text-sm font-medium">Marketplace links</p>
          <p className="text-xs text-neutral-400">URLs used for the “Buy on Amazon / Flipkart / Meesho” buttons.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-300">Amazon URL</label>
              <input className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs" value={form.marketplaces.amazon} onChange={(e) => updateMarketplace("amazon", e.target.value)} placeholder="https://www.amazon.in/dp/EXAMPLE-ASIN" />
            </div>
            <div>
              <label className="text-xs text-neutral-300">Flipkart URL</label>
              <input className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs" value={form.marketplaces.flipkart} onChange={(e) => updateMarketplace("flipkart", e.target.value)} placeholder="https://www.flipkart.com/example-product/p/itmEXAMPLE" />
            </div>
            <div>
              <label className="text-xs text-neutral-300">Meesho URL</label>
              <input className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs" value={form.marketplaces.meesho} onChange={(e) => updateMarketplace("meesho", e.target.value)} placeholder="https://www.meesho.com/product/example/p/EXAMPLE" />
            </div>
          </div>
        </div>

        <button disabled={saving} className="mt-4 rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </AdminLayout>
  );
}
