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
import { deleteField } from "firebase/firestore";

import { getUploadCallable, getDeleteCallable } from "../lib/functions";

type VariantAttribute = {
  key: string;
  value: string;
};

type Variant = {
  id: string;
  attributes: VariantAttribute[];
  price?: number;
  stock: number;
  discountPercent?: number;
  images?: string[]; // 🔑 NEW: Images for this variant
};

type Inventory = {
  trackStock: boolean;
  stock?: number;
  discountPercent?: number;
};

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
  shippingRate?: number | null;
  currency: string;
  shortDescription: string;
  description: string;
  attributes: Attribute[];
  categories: string[];
  collectionId: string;
  isFeatured: boolean;
  thumbnailUrl: string;
  images: string[];
  marketplaces: Marketplaces;
  inventory?: Inventory;
  variants?: Variant[];
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
  shippingRate: null,
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
  inventory: {
    trackStock: false,
    stock: 0,
    discountPercent: 0,
  },
  variants: [],
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

  // 🔑 NEW: Track which variant's image selector is open
  const [variantImageSelectorOpen, setVariantImageSelectorOpen] = useState<number | null>(null);

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

  const callUploadImage = useMemo(() => {
    try {
      return getUploadCallable();
    } catch (e) {
      console.error("Failed to create upload callable:", e);
      return undefined;
    }
  }, []);

  const callDeleteImage = useMemo(() => {
    try {
      return getDeleteCallable();
    } catch (e) {
      console.error("Failed to create delete callable:", e);
      return undefined;
    }
  }, []);

  // Load existing product
  useEffect(() => {
    if (!isNew && id) {
      (async () => {
        try {
          const snap = await getDoc(doc(db, "products", id));
          if (!snap.exists()) return;

          const data = snap.data() as any;

          const attrs: Attribute[] = Array.isArray(data.attributes)
            ? [...data.attributes]
            : [];

          const addIfNotExists = (key: string, value?: string) => {
            if (!value) return;
            const exists = attrs.some(
              (a) => a.key.toLowerCase() === key.toLowerCase()
            );
            if (!exists) attrs.push({ key, value });
          };

          addIfNotExists("Metal", data.metal);
          addIfNotExists("Gemstone", data.gemstone);
          addIfNotExists("SKU", data.sku);

          const inventory = {
            trackStock: Boolean(data.inventory?.trackStock),
            stock: data.inventory?.stock ?? 0,
            discountPercent: data.inventory?.discountPercent ?? 0,
          };

          // 🔑 Load variant images
          const variants = Array.isArray(data.variants)
            ? data.variants.map((v: any) => ({
                id: v.id ?? crypto.randomUUID(),
                attributes: Array.isArray(v.attributes) ? v.attributes : [],
                price: typeof v.price === "number" ? v.price : data.price ?? 0,
                stock: v.stock ?? 0,
                discountPercent: v.discountPercent ?? 0,
                images: Array.isArray(v.images) ? v.images : [], // 🔑 NEW
              }))
            : [];

          setForm({
            name: data.name ?? "",
            slug: data.slug ?? "",
            brand: data.brand ?? "",
            price: data.price ?? 0,
            shippingRate:
              typeof data.shippingRate === "number"
                ? data.shippingRate
                : typeof data.shippingRate === "string" && Number.isFinite(Number(data.shippingRate))
                  ? Number(data.shippingRate)
                  : null,
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
            inventory,
            variants,
          });

          if (data.imagesMeta && typeof data.imagesMeta === "object") {
            setImagesMeta(data.imagesMeta);
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
      const url = uploaded?.url;
      if (!url) throw new Error("No URL returned from upload");
      setForm((prev) => ({ ...prev, thumbnailUrl: url }));
      const publicId = uploaded.public_id;
      if (publicId) setImagesMeta((m) => ({ ...m, [url]: publicId }));
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
        const url = uploaded?.url;
        if (!url) throw new Error("No URL returned from upload");

        setForm((prev) => {
          const images = [...prev.images];
          const idx = images.indexOf(localPreview);
          if (idx !== -1) images[idx] = url;
          else images.push(url);
          return { ...prev, images };
        });

        const publicId = uploaded.public_id;
        if (publicId) setImagesMeta((m) => ({ ...m, [url]: publicId }));
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

      const inventoryToSave = {
        trackStock: Boolean(form.inventory?.trackStock),
        stock: form.inventory?.stock ?? 0,
        discountPercent: form.inventory?.discountPercent ?? 0,
      };

      // 🔑 Save variant images
      const variantsToSave = Array.isArray(form.variants)
        ? form.variants.map((v) => ({
            id: v.id ?? crypto.randomUUID(),
            attributes: Array.isArray(v.attributes) ? v.attributes : [],
            price: typeof v.price === "number" ? v.price : Number(form.price),
            stock: v.stock ?? 0,
            discountPercent: v.discountPercent ?? 0,
            images: Array.isArray(v.images) ? v.images : [], // 🔑 NEW
          }))
        : [];

      const shippingRateToSave =
        typeof form.shippingRate === "number" && Number.isFinite(form.shippingRate)
          ? form.shippingRate
          : deleteField();

      await setDoc(
        productRef,
        {
          name: form.name,
          slug: slugToSave,
          brand: form.brand,
          price: Number(form.price),
          shippingRate: shippingRateToSave,
          currency: form.currency,
          shortDescription: form.shortDescription,
          description: form.description,
          attributes: form.attributes,
          categories: form.categories,
          collectionId: form.collectionId,
          isFeatured: form.isFeatured,
          thumbnailUrl: form.thumbnailUrl,
          images: form.images ?? [],
          imagesMeta: imagesMeta,
          marketplaces: {
            amazon: form.marketplaces.amazon,
            flipkart: form.marketplaces.flipkart,
            meesho: form.marketplaces.meesho,
          },
          inventory: inventoryToSave,
          variants: variantsToSave,
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

  const addVariant = () => {
    setForm((prev) => ({
      ...prev,
      variants: [
        ...(prev.variants ?? []),
        {
          id: crypto.randomUUID(),
          attributes: [],
          price: prev.price,
          stock: 0,
          discountPercent: 0,
          images: [], // 🔑 NEW
        },
      ],
    }));
  };

  const updateVariant = (index: number, field: keyof Variant, value: any) => {
    setForm((prev) => {
      const variants = [...(prev.variants ?? [])];
      variants[index] = {
        ...variants[index],
        [field]: value,
      };
      return { ...prev, variants };
    });
  };

  const removeVariant = (index: number) => {
    setForm((prev) => {
      const variants = [...(prev.variants ?? [])];
      variants.splice(index, 1);
      return { ...prev, variants };
    });
  };

  const addVariantAttribute = (variantIndex: number) => {
    setForm((prev) => {
      const variants = [...(prev.variants ?? [])];
      variants[variantIndex].attributes.push({ key: "", value: "" });
      return { ...prev, variants };
    });
  };

  const updateVariantAttribute = (
    variantIndex: number,
    attrIndex: number,
    field: "key" | "value",
    value: string
  ) => {
    setForm((prev) => {
      const variants = [...(prev.variants ?? [])];
      const attrs = [...variants[variantIndex].attributes];
      attrs[attrIndex] = { ...attrs[attrIndex], [field]: value };
      variants[variantIndex].attributes = attrs;
      return { ...prev, variants };
    });
  };

  const removeVariantAttribute = (variantIndex: number, attrIndex: number) => {
    setForm((prev) => {
      const variants = [...(prev.variants ?? [])];
      variants[variantIndex].attributes.splice(attrIndex, 1);
      return { ...prev, variants };
    });
  };

  // 🔑 NEW: Toggle image selection for variant
  // 🔑 NEW: Toggle image selection for variant
  const toggleVariantImage = (variantIndex: number, imageUrl: string) => {
    setForm((prev) => {
      const variants = [...(prev.variants ?? [])];
      const variant = { ...variants[variantIndex] };
      const currentImages = Array.isArray(variant.images) ? [...variant.images] : [];
      
      if (currentImages.includes(imageUrl)) {
        // Remove image
        variant.images = currentImages.filter(img => img !== imageUrl);
      } else {
        // Add image
        variant.images = [...currentImages, imageUrl];
      }
      
      variants[variantIndex] = variant;
      return { ...prev, variants };
    });
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
            <label className="text-sm">Shipping rate (optional)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
              value={typeof form.shippingRate === "number" ? form.shippingRate : ""}
              onChange={(e) =>
                handleChange(
                  "shippingRate",
                  Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null
                )
              }
              min={0}
              placeholder="Leave blank for global rate"
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

        {/* Collection */}
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
          <p className="text-xs text-neutral-400">URLs used for the "Buy on Amazon / Flipkart / Meesho" buttons.</p>
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


    {/* ================= Inventory & Variants ================= */}
<div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-4">
<p className="text-sm font-medium">Inventory & variants</p>
<p className="text-xs text-neutral-400">
Optional settings for selling this product on your website.
</p>

{/* Track stock */}
<label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.inventory?.trackStock}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              inventory: {
                ...prev.inventory!,
                trackStock: e.target.checked,
              },
            }))
          }
        />
        Track stock for this product
      </label>

      {/* Simple product (no variants) */}
      {form.inventory?.trackStock && form.variants?.length === 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs">Available stock</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-neutral-900 border px-3 py-2 text-sm"
              value={form.inventory.stock ?? 0}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  inventory: {
                    ...prev.inventory!,
                    stock: e.target.valueAsNumber,
                  },
                }))
              }
            />
          </div>

          <div>
            <label className="text-xs">Discount (%)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-neutral-900 border px-3 py-2 text-sm"
              value={form.inventory.discountPercent ?? 0}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  inventory: {
                    ...prev.inventory!,
                    discountPercent: e.target.valueAsNumber,
                  },
                }))
              }
            />
          </div>
        </div>
      )}

      {/* Variants toggle */}
      <label className="flex items-center gap-2 text-sm pt-2">
        <input
          type="checkbox"
          checked={(form.variants?.length ?? 0) > 0}
          onChange={(e) =>
            e.target.checked
              ? addVariant()
              : setForm((prev) => ({ ...prev, variants: [] }))
          }
        />
        This product has variants (size, color, weight, etc.)
      </label>

      {/* Variants */}
      {form.variants && form.variants.length > 0 && (
        <div className="space-y-4">
          {form.variants.map((v, variantIndex) => (
            <div
              key={v.id}
              className="rounded-xl border border-neutral-800 p-3 space-y-3"
            >
              <p className="text-xs font-medium text-neutral-300">
                Variant #{variantIndex + 1}
              </p>

              {/* Variant attributes */}
              <div className="space-y-2">
                {v.attributes.map((attr, attrIndex) => (
                  <div key={attrIndex} className="grid grid-cols-3 gap-2">
                    <input
                      className="rounded-lg bg-neutral-900 border px-2 py-1 text-sm"
                      placeholder="Attribute (e.g. Size)"
                      value={attr.key}
                      onChange={(e) =>
                        updateVariantAttribute(
                          variantIndex,
                          attrIndex,
                          "key",
                          e.target.value
                        )
                      }
                    />
                    <input
                      className="rounded-lg bg-neutral-900 border px-2 py-1 text-sm"
                      placeholder="Value (e.g. 7)"
                      value={attr.value}
                      onChange={(e) =>
                        updateVariantAttribute(
                          variantIndex,
                          attrIndex,
                          "value",
                          e.target.value
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        removeVariantAttribute(variantIndex, attrIndex)
                      }
                      className="text-red-500 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addVariantAttribute(variantIndex)}
                  className="text-xs underline"
                >
                  + Add attribute
                </button>
              </div>

              {/* Variant pricing & stock */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs">Price override</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg bg-neutral-900 border px-2 py-1 text-sm"
                    value={v.price ?? form.price}
                    onChange={(e) =>
                      updateVariant(variantIndex, "price", e.target.valueAsNumber)
                    }
                  />
                </div>

                <div>
                  <label className="text-xs">Stock</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg bg-neutral-900 border px-2 py-1 text-sm"
                    value={v.stock}
                    onChange={(e) =>
                      updateVariant(variantIndex, "stock", e.target.valueAsNumber)
                    }
                  />
                </div>

                <div>
                  <label className="text-xs">Discount (%)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg bg-neutral-900 border px-2 py-1 text-sm"
                    value={v.discountPercent ?? 0}
                    onChange={(e) =>
                      updateVariant(
                        variantIndex,
                        "discountPercent",
                        e.target.valueAsNumber
                      )
                    }
                  />
                </div>
              </div>

              {/* 🔑 VARIANT IMAGE SELECTION */}
              <div className="border-t border-neutral-800 pt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium">Variant Images</label>
                  <button
                    type="button"
                    onClick={() =>
                      setVariantImageSelectorOpen(
                        variantImageSelectorOpen === variantIndex ? null : variantIndex
                      )
                    }
                    className="text-xs bg-neutral-800 px-2 py-1 rounded border border-neutral-700 hover:border-yellow-400"
                  >
                    {variantImageSelectorOpen === variantIndex ? "Close" : "Select Images"}
                  </button>
                </div>

                {/* Selected images preview */}
                {v.images && v.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {v.images.map((img) => (
                      <div key={img} className="relative">
                        <img
                          src={img}
                          alt="Variant"
                          className="h-16 w-16 rounded-lg object-cover border-2 border-yellow-500"
                        />
                        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 text-black text-xs flex items-center justify-center font-bold">
                          ✓
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Image selector dropdown */}
                {variantImageSelectorOpen === variantIndex && (
                  <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-700 space-y-2">
                    <p className="text-xs text-neutral-400">
                      Select from uploaded gallery images:
                    </p>
                    
                    {form.images.length === 0 ? (
                      <p className="text-xs text-neutral-500 italic">
                        No gallery images uploaded yet. Upload images above first.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {form.images.map((img) => {
                          const isSelected = v.images?.includes(img);
                          return (
                            <button
                              key={img}
                              type="button"
                              onClick={() => toggleVariantImage(variantIndex, img)}
                              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? "border-yellow-500 ring-2 ring-yellow-500/50"
                                  : "border-neutral-700 hover:border-neutral-500"
                              }`}
                            >
                              <img
                                src={img}
                                alt="Gallery"
                                className="h-20 w-20 object-cover"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-yellow-500/20 flex items-center justify-center">
                                  <div className="h-6 w-6 rounded-full bg-yellow-500 text-black text-sm flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeVariant(variantIndex)}
                className="text-red-500 text-sm"
              >
                Remove variant
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addVariant}
            className="text-xs underline"
          >
            + Add another variant
          </button>
        </div>
      )}
    </div>

    <button disabled={saving} className="mt-4 rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium disabled:opacity-50">
      {saving ? "Saving..." : "Save"}
    </button>
  </form>
</AdminLayout>)
}
