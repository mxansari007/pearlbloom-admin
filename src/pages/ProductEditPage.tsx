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
import { invalidateCache } from "../lib/cache";

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

// ---- Product-page highlights (mirror the storefront PDP) -------------------
// `icon` is a key from ICON_OPTIONS below; the storefront maps the same keys to
// line icons (pearlbloom/components/product/featureIcons.tsx).
type FeatureBadge = {
  icon: string;
  title: string;
  subtitle: string;
  highlight: boolean;
};

type AssuranceCard = {
  icon: string;
  eyebrow: string;
  title: string;
};

type DispatchTimer = {
  enabled: boolean;
  cutoffHour: number;
  cutoffMinute: number;
  label: string;
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
  metaTitle: string;
  metaDescription: string;
  noindex: boolean;
  attributes: Attribute[];
  categories: string[];
  style: string[];
  finish: string[];
  occasion: string[];
  collectionId: string;
  isFeatured: boolean;
  thumbnailUrl: string;
  images: string[];
  marketplaces: Marketplaces;
  featureBadges: FeatureBadge[];
  assuranceCards: AssuranceCard[];
  dispatchTimer: DispatchTimer;
  inventory?: Inventory;
  variants?: Variant[];
};

type CollectionOption = {
  id: string;
  name: string;
};

/* Icon choices for feature badges & assurance cards. The `key` MUST match the
   storefront registry (pearlbloom/components/product/featureIcons.tsx). The
   emoji is only a friendly preview here — the storefront renders a matching
   line icon. */
const ICON_OPTIONS: { key: string; label: string; emoji: string }[] = [
  { key: "shield-half", label: "Shield — anti-tarnish", emoji: "🛡️" },
  { key: "shield-check", label: "Shield check — durable / warranty", emoji: "✅" },
  { key: "droplet", label: "Droplet — water-resistant", emoji: "💧" },
  { key: "sparkles", label: "Sparkles — premium / hypoallergenic", emoji: "✨" },
  { key: "feather", label: "Feather — lightweight", emoji: "🪶" },
  { key: "gem", label: "Gem — crafted", emoji: "💎" },
  { key: "leaf", label: "Leaf — skin-safe", emoji: "🍃" },
  { key: "heart", label: "Heart — loved", emoji: "❤️" },
  { key: "award", label: "Award — quality assured", emoji: "🏅" },
  { key: "star", label: "Star — bestseller", emoji: "⭐" },
  { key: "crown", label: "Crown — luxury", emoji: "👑" },
  { key: "truck", label: "Truck — fast shipping", emoji: "🚚" },
  { key: "package-check", label: "Package — secure packaging", emoji: "📦" },
  { key: "clock", label: "Clock — quick dispatch", emoji: "⏰" },
  { key: "sun", label: "Sun — everyday wear", emoji: "☀️" },
  { key: "recycle", label: "Recycle — easy returns", emoji: "♻️" },
];

/* Honest defaults — prefilled on new products so the PDP looks exactly like the
   current design, then fully editable. Mirrors the storefront fallback. */
const DEFAULT_FEATURE_BADGES: FeatureBadge[] = [
  { icon: "shield-half", title: "Anti-Tarnish", subtitle: "Protective sealed finish", highlight: false },
  { icon: "droplet", title: "Water-Resistant", subtitle: "Sweat & splash friendly", highlight: false },
  { icon: "sparkles", title: "Hypoallergenic", subtitle: "Lead & nickel free", highlight: true },
  { icon: "feather", title: "Lightweight", subtitle: "Comfortable all-day wear", highlight: false },
];

const DEFAULT_ASSURANCE_CARDS: AssuranceCard[] = [
  { icon: "sparkles", eyebrow: "Crafted Finish", title: "18K Gold-Tone Plating" },
  { icon: "shield-check", eyebrow: "Everyday Durable", title: "Anti-Tarnish Coating" },
];

const DEFAULT_DISPATCH_TIMER: DispatchTimer = {
  enabled: true,
  cutoffHour: 17,
  cutoffMinute: 0,
  label: "for same-day dispatch",
};

const cloneBadges = (b: FeatureBadge[]) => b.map((x) => ({ ...x }));
const cloneCards = (c: AssuranceCard[]) => c.map((x) => ({ ...x }));

const emptyForm: ProductForm = {
  name: "",
  slug: "",
  brand: "",
  price: 0,
  shippingRate: null,
  currency: "INR",
  shortDescription: "",
  description: "",
  metaTitle: "",
  metaDescription: "",
  noindex: false,
  attributes: [],
  categories: [],
  style: [],
  finish: [],
  occasion: [],
  collectionId: "",
  isFeatured: false,
  thumbnailUrl: "",
  images: [],
  marketplaces: {
    amazon: "",
    flipkart: "",
    meesho: "",
  },
  featureBadges: cloneBadges(DEFAULT_FEATURE_BADGES),
  assuranceCards: cloneCards(DEFAULT_ASSURANCE_CARDS),
  dispatchTimer: { ...DEFAULT_DISPATCH_TIMER },
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

/* Taxonomy facet tags — slugs MUST match the storefront's earringCategories.ts
   so category pages and filters resolve exactly. */
type FacetKey = "style" | "finish" | "occasion";
const FACET_GROUPS: { key: FacetKey; title: string; items: { slug: string; label: string }[] }[] = [
  {
    key: "style",
    title: "Style Facet Tags",
    items: [
      { slug: "stud", label: "Stud" },
      { slug: "hoop", label: "Hoop" },
      { slug: "drop", label: "Drop" },
      { slug: "dangle", label: "Dangle" },
      { slug: "statement", label: "Statement" },
      { slug: "jhumka", label: "Jhumka" },
      { slug: "chandbali", label: "Chandbali" },
      { slug: "ear-cuffs", label: "Ear Cuffs" },
      { slug: "mismatch", label: "Mismatch" },
      { slug: "clip-on", label: "Clip-on" },
      { slug: "long", label: "Long" },
      { slug: "huggies", label: "Huggies" },
      { slug: "bali", label: "Bali" },
    ],
  },
  {
    key: "finish",
    title: "Finish Facet Tags",
    items: [
      { slug: "gold-plated", label: "Gold Plated" },
      { slug: "gold-tone", label: "Gold Tone" },
      { slug: "anti-tarnish", label: "Anti Tarnish" },
      { slug: "waterproof", label: "Waterproof" },
      { slug: "oxidised", label: "Oxidised" },
      { slug: "silver-tone", label: "Silver Tone" },
      { slug: "enamel", label: "Enamel" },
      { slug: "pearl", label: "Pearl" },
      { slug: "crystal", label: "Crystal" },
      { slug: "cz", label: "CZ" },
      { slug: "american-diamond", label: "American Diamond" },
      { slug: "stone", label: "Stone" },
      { slug: "kundan", label: "Kundan" },
    ],
  },
  {
    key: "occasion",
    title: "Occasion Facet Tags",
    items: [
      { slug: "daily-wear", label: "Daily Wear" },
      { slug: "office-wear", label: "Office Wear" },
      { slug: "party-wear", label: "Party Wear" },
      { slug: "festive-wear", label: "Festive Wear" },
      { slug: "wedding-wear", label: "Wedding Wear" },
      { slug: "bridal", label: "Bridal" },
      { slug: "college-wear", label: "College Wear" },
      { slug: "gift", label: "Gift" },
      { slug: "set", label: "Earrings Set" },
    ],
  },
];

const ProductEditPageSkeleton = () => (
  <div className="space-y-5 max-w-3xl animate-pulse">
    {/* Name & slug */}
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>

    {/* Price / currency / featured */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/3 mb-1"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/2 mb-1"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/3 mb-1"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
      <div className="flex items-end">
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>

    {/* Textareas */}
    <div className="space-y-5">
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
        <div className="h-20 bg-neutral-800 rounded w-full"></div>
      </div>
      <div>
        <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
        <div className="h-32 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>

    {/* Attributes section */}
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-4">
      <div className="h-5 bg-neutral-700 rounded w-1/3"></div>
      <div className="h-4 bg-neutral-700 rounded w-full"></div>
      <div className="h-4 bg-neutral-700 rounded w-2/3"></div>
    </div>

    {/* Images */}
    <div>
      <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
      <div className="h-9 bg-neutral-800 rounded w-1/2"></div>
    </div>
    <div>
      <div className="h-4 bg-neutral-700 rounded w-1/4 mb-1"></div>
      <div className="h-9 bg-neutral-800 rounded w-1/2"></div>
    </div>

    {/* Button */}
    <div className="h-10 bg-neutral-700 rounded w-24"></div>
  </div>
);

export default function ProductEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingGalleryMap, setUploadingGalleryMap] = useState<Record<string, boolean>>({});
  const [imagesMeta, setImagesMeta] = useState<Record<string, string>>({});
  // url -> alt text for every product image (SEO + accessibility)
  const [imageAlt, setImageAlt] = useState<Record<string, string>>({});
  const setAlt = (url: string, value: string) => setImageAlt((m) => ({ ...m, [url]: value }));

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
      setLoading(true);
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
            metaTitle: data.metaTitle ?? "",
            metaDescription: data.metaDescription ?? "",
            noindex: data.noindex ?? false,
            attributes: attrs,
            categories: Array.isArray(data.categories) ? data.categories : [],
            style: Array.isArray(data.style) ? data.style : [],
            finish: Array.isArray(data.finish) ? data.finish : [],
            occasion: Array.isArray(data.occasion) ? data.occasion : [],
            collectionId: data.collectionId ?? "",
            isFeatured: data.isFeatured ?? false,
            thumbnailUrl: data.thumbnailUrl ?? "",
            images: Array.isArray(data.images) ? data.images : [],
            marketplaces: {
              amazon: data.marketplaces?.amazon ?? "",
              flipkart: data.marketplaces?.flipkart ?? "",
              meesho: data.marketplaces?.meesho ?? "",
            },
            featureBadges:
              Array.isArray(data.featureBadges) && data.featureBadges.length > 0
                ? data.featureBadges.map((b: any) => ({
                    icon: typeof b?.icon === "string" ? b.icon : "sparkles",
                    title: typeof b?.title === "string" ? b.title : "",
                    subtitle: typeof b?.subtitle === "string" ? b.subtitle : "",
                    highlight: Boolean(b?.highlight),
                  }))
                : cloneBadges(DEFAULT_FEATURE_BADGES),
            assuranceCards:
              Array.isArray(data.assuranceCards) && data.assuranceCards.length > 0
                ? data.assuranceCards.map((c: any) => ({
                    icon: typeof c?.icon === "string" ? c.icon : "sparkles",
                    eyebrow: typeof c?.eyebrow === "string" ? c.eyebrow : "",
                    title: typeof c?.title === "string" ? c.title : "",
                  }))
                : cloneCards(DEFAULT_ASSURANCE_CARDS),
            dispatchTimer:
              data.dispatchTimer && typeof data.dispatchTimer === "object"
                ? {
                    enabled: data.dispatchTimer.enabled !== false,
                    cutoffHour:
                      typeof data.dispatchTimer.cutoffHour === "number"
                        ? data.dispatchTimer.cutoffHour
                        : 17,
                    cutoffMinute:
                      typeof data.dispatchTimer.cutoffMinute === "number"
                        ? data.dispatchTimer.cutoffMinute
                        : 0,
                    label:
                      typeof data.dispatchTimer.label === "string"
                        ? data.dispatchTimer.label
                        : "for same-day dispatch",
                  }
                : { ...DEFAULT_DISPATCH_TIMER },
            inventory,
            variants,
          });

          if (data.imagesMeta && typeof data.imagesMeta === "object") {
            setImagesMeta(data.imagesMeta);
          }
          if (data.imageAlt && typeof data.imageAlt === "object") {
            setImageAlt(data.imageAlt);
          }
        } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to load product.");
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, [id, isNew]);

  const handleChange = (field: keyof ProductForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleFacet = (group: FacetKey, slug: string) => {
    setForm((prev) => {
      const arr = prev[group];
      return {
        ...prev,
        [group]: arr.includes(slug) ? arr.filter((s) => s !== slug) : [...arr, slug],
      };
    });
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

  const removeThumbnail = async () => {
    setError(null);
    const url = form.thumbnailUrl;
    if (!url) return;
    setForm((prev) => ({ ...prev, thumbnailUrl: "" }));

    const publicId = imagesMeta[url];
    if (!publicId) {
      // No tracked Cloudinary id (older/legacy thumbnail) — just unlink it.
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
      setForm((prev) => ({ ...prev, thumbnailUrl: url })); // restore on failure
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

  // ---- Feature badges (buy-box 2×2 grid) ----
  const addFeatureBadge = () =>
    setForm((prev) => ({
      ...prev,
      featureBadges: [
        ...prev.featureBadges,
        { icon: "sparkles", title: "", subtitle: "", highlight: false },
      ],
    }));

  const updateFeatureBadge = (
    index: number,
    field: keyof FeatureBadge,
    value: string | boolean
  ) =>
    setForm((prev) => {
      const badges = [...prev.featureBadges];
      badges[index] = { ...badges[index], [field]: value };
      return { ...prev, featureBadges: badges };
    });

  const removeFeatureBadge = (index: number) =>
    setForm((prev) => {
      const badges = [...prev.featureBadges];
      badges.splice(index, 1);
      return { ...prev, featureBadges: badges };
    });

  // ---- Assurance cards (under the gallery) ----
  const addAssuranceCard = () =>
    setForm((prev) => ({
      ...prev,
      assuranceCards: [
        ...prev.assuranceCards,
        { icon: "sparkles", eyebrow: "", title: "" },
      ],
    }));

  const updateAssuranceCard = (
    index: number,
    field: keyof AssuranceCard,
    value: string
  ) =>
    setForm((prev) => {
      const cards = [...prev.assuranceCards];
      cards[index] = { ...cards[index], [field]: value };
      return { ...prev, assuranceCards: cards };
    });

  const removeAssuranceCard = (index: number) =>
    setForm((prev) => {
      const cards = [...prev.assuranceCards];
      cards.splice(index, 1);
      return { ...prev, assuranceCards: cards };
    });

  // ---- Dispatch timer ----
  const updateDispatchTimer = (
    field: keyof DispatchTimer,
    value: string | number | boolean
  ) =>
    setForm((prev) => ({
      ...prev,
      dispatchTimer: { ...prev.dispatchTimer, [field]: value },
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const slugToSave = form.slug || slugify(form.name);

      // New products are KEYED BY THEIR SLUG so the storefront can read them
      // with a direct doc(slug) get instead of a costly where("slug","==")
      // query. Nothing else enforces slug uniqueness, so guard against
      // collisions here (a clashing slug would otherwise silently overwrite
      // a different product, since the doc id is now the slug).
      let idToUse: string;
      if (isNew) {
        const clash = await getDoc(doc(db, "products", slugToSave));
        if (clash.exists()) {
          setError(
            `A product with the slug "${slugToSave}" already exists. ` +
              `Choose a different slug.`
          );
          setSaving(false);
          return;
        }
        idToUse = slugToSave;
      } else {
        // Editing keeps the existing document id. After the one-time
        // migration that id already equals the slug; if an admin renames a
        // slug the doc id stays put (moving it would orphan cart/wishlist
        // references) and the storefront read simply falls back to a query
        // for that one product.
        idToUse = id!;
      }
      const productRef = doc(db, "products", idToUse);

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
          metaTitle: form.metaTitle,
          metaDescription: form.metaDescription,
          noindex: form.noindex,
          attributes: form.attributes,
          categories: form.categories,
          style: form.style,
          finish: form.finish,
          occasion: form.occasion,
          collectionId: form.collectionId,
          isFeatured: form.isFeatured,
          thumbnailUrl: form.thumbnailUrl,
          images: form.images ?? [],
          imagesMeta: imagesMeta,
          imageAlt: imageAlt,
          marketplaces: {
            amazon: form.marketplaces.amazon,
            flipkart: form.marketplaces.flipkart,
            meesho: form.marketplaces.meesho,
          },
          featureBadges: form.featureBadges
            .filter((b) => b.title.trim() || b.subtitle.trim())
            .map((b) => ({
              icon: b.icon || "sparkles",
              title: b.title.trim(),
              subtitle: b.subtitle.trim(),
              highlight: Boolean(b.highlight),
            })),
          assuranceCards: form.assuranceCards
            .filter((c) => c.title.trim() || c.eyebrow.trim())
            .map((c) => ({
              icon: c.icon || "sparkles",
              eyebrow: c.eyebrow.trim(),
              title: c.title.trim(),
            })),
          dispatchTimer: {
            enabled: Boolean(form.dispatchTimer.enabled),
            cutoffHour: Math.min(23, Math.max(0, Number(form.dispatchTimer.cutoffHour) || 0)),
            cutoffMinute: Math.min(59, Math.max(0, Number(form.dispatchTimer.cutoffMinute) || 0)),
            label: form.dispatchTimer.label.trim() || "for same-day dispatch",
          },
          inventory: inventoryToSave,
          variants: variantsToSave,
          updatedAt: serverTimestamp(),
          ...(isNew && { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      // Invalidate the admin list caches so the new/edited product shows up
      // immediately instead of after the 2-minute TTL.
      invalidateCache("products:list");
      invalidateCache("dashboard:counts");

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
      title={isNew ? "Add Product" : "Edit Product"}
      subtitle="Details, images and metadata for a single piece."
      actions={
        <Link
          to="/products"
          className="rounded-xl border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 hover:border-yellow-500/50 hover:text-yellow-200 hover:bg-yellow-500/5 transition"
        >
          ← Back to products
        </Link>
      }
    >
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-950/40 to-red-900/20 px-4 py-3 flex items-start gap-2">
                <span>⚠️</span>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
      
            {loading ? (
              <ProductEditPageSkeleton />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 max-w-5xl">
                {/* Sticky action bar */}
                <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/85 backdrop-blur px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{isNew ? "Add New Product" : "Edit Product"}</p>
                    <p className="text-[11px] text-neutral-400">Fill in the details, then save your changes.</p>
                  </div>
                  <button
                    disabled={saving}
                    className="rounded-xl bg-yellow-500 text-black px-6 py-2 text-sm font-semibold hover:bg-yellow-400 disabled:opacity-50 transition"
                  >
                    {saving ? "Saving…" : isNew ? "Publish Product" : "Save Changes"}
                  </button>
                </div>

                {/* Product Details card */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 space-y-4 sm:space-y-5">
                  <h3 className="text-sm font-semibold">Product Details</h3>
                {/* Name & slug */}
                <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
                  <div>
                    <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Name *</label>
                    <input
                      className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                      value={form.name}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          name: value,
                          slug: prev.slug.trim().length === 0 ? slugify(value) : prev.slug,
                        }));
                      }}
                      placeholder="Solitaire Diamond Ring"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Slug</label>
                    <input
                      className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition font-mono"
                      value={form.slug}
                      onChange={(e) => handleChange("slug", e.target.value)}
                      placeholder="solitaire-diamond-ring"
                    />
                  </div>
                </div>
      
                {/* Price / currency / featured */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                  <div>
                    <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Price *</label>
                    <input
                      type="number"
                      className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                      value={form.price}
                      onChange={(e) => handleChange("price", e.target.valueAsNumber)}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Shipping</label>
                    <input
                      type="number"
                      className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                      value={typeof form.shippingRate === "number" ? form.shippingRate : ""}
                      onChange={(e) =>
                        handleChange(
                          "shippingRate",
                          Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null
                        )
                      }
                      min={0}
                      placeholder="Global"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Currency</label>
                    <input
                      className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
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
                </div>
                {/* /Product Details card */}

                {/* Taxonomy facet tags (Style / Finish / Occasion) */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Taxonomy Facet Tags</p>
                    <p className="text-xs text-neutral-400">
                      Tag this earring across Style, Finish and Occasion. Choose as many as apply — the
                      storefront category pages and left-sidebar filters resolve these slugs exactly.
                    </p>
                  </div>

                  {FACET_GROUPS.map((group) => (
                    <div key={group.key}>
                      <p className="text-[11px] uppercase tracking-wider text-neutral-300 mb-2">
                        {group.title}{" "}
                        <span className="text-yellow-400">({form[group.key].length} active)</span>
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                        {group.items.map((item) => {
                          const active = form[group.key].includes(item.slug);
                          return (
                            <label
                              key={item.slug}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition ${
                                active
                                  ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-200"
                                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="accent-yellow-500"
                                checked={active}
                                onChange={() => toggleFacet(group.key, item.slug)}
                              />
                              {item.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Description card */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 space-y-4">
                  <h3 className="text-sm font-semibold">Description</h3>
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
                </div>
                {/* /Description card */}

                {/* SEO card */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 space-y-4">
                  <h3 className="text-sm font-semibold">SEO optimisation</h3>

                  <div>
                    <label className="text-sm flex items-center justify-between">
                      <span>Meta title</span>
                      <span className={`text-xs ${(form.metaTitle || `${form.name} — Pearl Bloom`).length > 60 ? "text-red-400" : "text-neutral-500"}`}>
                        {(form.metaTitle || `${form.name} — Pearl Bloom`).length}/60
                      </span>
                    </label>
                    <input
                      className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
                      value={form.metaTitle}
                      onChange={(e) => handleChange("metaTitle", e.target.value)}
                      placeholder={`${form.name || "Product name"} — Pearl Bloom`}
                    />
                    <p className="mt-1 text-xs text-neutral-500">Leave blank to use “{form.name || "Product name"} — Pearl Bloom”.</p>
                  </div>

                  <div>
                    <label className="text-sm flex items-center justify-between">
                      <span>Meta description</span>
                      <span className={`text-xs ${form.metaDescription.length > 160 ? "text-red-400" : "text-neutral-500"}`}>
                        {form.metaDescription.length}/160
                      </span>
                    </label>
                    <textarea
                      className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
                      rows={3}
                      value={form.metaDescription}
                      onChange={(e) => handleChange("metaDescription", e.target.value)}
                      placeholder="A compelling 150–160 character summary with the main keyword. Falls back to the short description."
                    />
                  </div>

                  {/* Google snippet preview */}
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[#1a0dab] text-base leading-tight truncate">{form.metaTitle || `${form.name || "Product name"} — Pearl Bloom`}</p>
                    <p className="text-[#006621] text-xs">pearlbloom.in › product › {form.slug || "your-product"}</p>
                    <p className="text-[#545454] text-xs mt-0.5 line-clamp-2">
                      {form.metaDescription || form.shortDescription || "Add a meta description to control how this product appears in Google search results."}
                    </p>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.noindex} onChange={(e) => handleChange("noindex", e.target.checked)} />
                    <span>Hide this product from search engines (noindex)</span>
                  </label>
                  <p className="text-xs text-neutral-500">
                    URL slug is set in the Basics section above. Product, Offer &amp; Breadcrumb rich-result schema and the canonical tag are added automatically.
                  </p>
                </div>
                {/* /SEO card */}

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
      
                {/* Product Images card */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 space-y-4">
                  <h3 className="text-sm font-semibold">Product Images</h3>
                  <div className="grid gap-5 md:grid-cols-2">
                {/* Thumbnail */}
                <div>
                  <label className="text-sm">Thumbnail image (card)</label>
                  <input className="mt-1 block text-sm" type="file" accept="image/*" onChange={handleThumbnailChange} />
                  {uploadingThumbnail && <p className="mt-2 text-xs text-neutral-400">Uploading thumbnail…</p>}
                  {form.thumbnailUrl && (
                    <>
                      <div className="relative mt-2 inline-block">
                        <img src={form.thumbnailUrl} alt={imageAlt[form.thumbnailUrl] || "Thumbnail"} className="h-32 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={removeThumbnail}
                          aria-label="Remove thumbnail image"
                          title="Remove image"
                          className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full bg-black/80 text-xs text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={removeThumbnail}
                        className="mt-2 block text-xs font-medium text-red-500 hover:text-red-400 transition-colors"
                      >
                        Remove image
                      </button>
                      <input
                        className="mt-2 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs"
                        placeholder="Alt text — describe this image"
                        value={imageAlt[form.thumbnailUrl] || ""}
                        onChange={(e) => setAlt(form.thumbnailUrl, e.target.value)}
                      />
                    </>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">Used in product cards / featured pieces.</p>
                </div>
      
                {/* Gallery */}
                <div>
                  <label className="text-sm">Gallery images (for product detail page)</label>
                  <input className="mt-1 block text-sm" type="file" accept="image/*" multiple onChange={handleGalleryChange} />
                  {form.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {form.images.map((url) => (
                        <div key={url} className="relative rounded-lg border border-neutral-700 p-2">
                          <button type="button" onClick={() => removeGalleryImage(url)} className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full bg-black/80 text-xs text-white flex items-center justify-center">
                            ×
                          </button>
                          <img src={url} alt={imageAlt[url] || "Product image"} className="h-24 w-full rounded-md object-cover" />
                          <input
                            className="mt-2 w-full rounded-md bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs"
                            placeholder="Alt text for this image"
                            value={imageAlt[url] || ""}
                            onChange={(e) => setAlt(url, e.target.value)}
                          />
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
                  </div>
                </div>
                {/* /Product Images card */}

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

                {/* ================= Product page highlights ================= */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-5">
                  <div>
                    <p className="text-sm font-medium">Product page highlights</p>
                    <p className="text-xs text-neutral-400">
                      The badge grid in the buy-box and the assurance cards under the photos. New products start with the standard set below — edit, add, or remove to suit this product.
                    </p>
                  </div>

                  {/* Feature badges */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Feature badges</p>
                      <button type="button" onClick={addFeatureBadge} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800">+ Add badge</button>
                    </div>
                    {form.featureBadges.length === 0 && (
                      <p className="text-xs text-neutral-500">No badges — the buy-box grid will be hidden for this product.</p>
                    )}
                    {form.featureBadges.map((badge, i) => (
                      <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            className="w-44 shrink-0 rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-2 text-xs"
                            value={badge.icon}
                            onChange={(e) => updateFeatureBadge(i, "icon", e.target.value)}
                          >
                            {ICON_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.emoji} {opt.label}</option>
                            ))}
                          </select>
                          <input
                            className="flex-1 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                            value={badge.title}
                            onChange={(e) => updateFeatureBadge(i, "title", e.target.value)}
                            placeholder="Title (e.g. Anti-Tarnish)"
                          />
                          <button type="button" onClick={() => removeFeatureBadge(i)} className="rounded-lg border border-neutral-700 px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-300" aria-label="Remove badge">✕</button>
                        </div>
                        <input
                          className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                          value={badge.subtitle}
                          onChange={(e) => updateFeatureBadge(i, "subtitle", e.target.value)}
                          placeholder="Subtitle (e.g. Protective sealed finish)"
                        />
                        <label className="flex items-center gap-2 text-xs text-neutral-300">
                          <input type="checkbox" checked={badge.highlight} onChange={(e) => updateFeatureBadge(i, "highlight", e.target.checked)} />
                          Highlight this badge (gold accent)
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Assurance cards */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Assurance cards</p>
                      <button type="button" onClick={addAssuranceCard} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800">+ Add card</button>
                    </div>
                    {form.assuranceCards.length === 0 && (
                      <p className="text-xs text-neutral-500">No cards — the pair under the gallery will be hidden for this product.</p>
                    )}
                    {form.assuranceCards.map((card, i) => (
                      <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            className="w-44 shrink-0 rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-2 text-xs"
                            value={card.icon}
                            onChange={(e) => updateAssuranceCard(i, "icon", e.target.value)}
                          >
                            {ICON_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.emoji} {opt.label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => removeAssuranceCard(i)} className="ml-auto rounded-lg border border-neutral-700 px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-300" aria-label="Remove card">✕</button>
                        </div>
                        <input
                          className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                          value={card.eyebrow}
                          onChange={(e) => updateAssuranceCard(i, "eyebrow", e.target.value)}
                          placeholder="Eyebrow (e.g. Crafted Finish)"
                        />
                        <input
                          className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                          value={card.title}
                          onChange={(e) => updateAssuranceCard(i, "title", e.target.value)}
                          placeholder="Title (e.g. 18K Gold-Tone Plating)"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* ================= Same-day dispatch timer ================= */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Same-day dispatch timer</p>
                    <p className="text-xs text-neutral-400">
                      The "order within …" countdown in the buy-box. Turn it off to hide the countdown and show a plain "Ready to Ship" badge instead.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.dispatchTimer.enabled} onChange={(e) => updateDispatchTimer("enabled", e.target.checked)} />
                    Show the countdown timer
                  </label>
                  {form.dispatchTimer.enabled && (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="text-xs text-neutral-300">Cut-off hour (0–23)</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                          value={form.dispatchTimer.cutoffHour}
                          onChange={(e) => updateDispatchTimer("cutoffHour", Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-300">Cut-off minute (0–59)</label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                          value={form.dispatchTimer.cutoffMinute}
                          onChange={(e) => updateDispatchTimer("cutoffMinute", Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-300">Label</label>
                        <input
                          className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-xs"
                          value={form.dispatchTimer.label}
                          onChange={(e) => updateDispatchTimer("label", e.target.value)}
                          placeholder="for same-day dispatch"
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-neutral-500">Tip: a 17:00 (5 PM) cut-off is common — orders placed before then dispatch the same day.</p>
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
        )}
      </AdminLayout>)
}
