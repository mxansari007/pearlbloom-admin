import { useEffect, useState } from "react";
import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import AdminLayout from "../layouts/AdminLayout";

/* ---------------- Types ---------------- */

type FooterLink = {
  label: string;
  href: string;
};

type SocialLink = {
  platform: "instagram" | "facebook" | "twitter" | "youtube" | "linkedin";
  url: string;
};

type HeroImage = {
  url: string;
  public_id: string;
};

type SettingsForm = {
  siteName: string;
  testMode: boolean;

  // Hero
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  heroCtaLink: string;
  heroImage?: HeroImage;

  // Footer
  footerBrandTitle: string;
  footerBrandDescription: string;
  contactEmail: string;
  contactPhone: string;
  footerLinks: FooterLink[];
  socialLinks: SocialLink[];

  invoiceSellerName: string;
  invoiceBrandName: string;
  invoiceCompanyName: string;
  invoiceSellerAddress: string;
  invoiceSellerPhone: string;
  invoiceSellerEmail: string;
  invoiceSellerWebsite: string;
  invoiceSellerGstin: string;
  invoicePrefix: string;
  invoiceDefaultTaxRate: number;
  invoiceQrUrlTemplate: string;
  invoiceNotes: string;
  invoiceBankDetails: string;

  deliverablePincodesText: string;
};

/* ---------------- Defaults ---------------- */

const emptySettings: SettingsForm = {
  siteName: "Pearl Bloom",
  testMode: false,

  heroTitle: "",
  heroSubtitle: "",
  heroCtaLabel: "Explore Collection",
  heroCtaLink: "/collections/featured",
  heroImage: undefined,

  footerBrandTitle: "Pearl Bloom",
  footerBrandDescription: "",
  contactEmail: "",
  contactPhone: "",
  footerLinks: [{ label: "Collections", href: "/collections" }],
  socialLinks: [],

  invoiceSellerName: "Pearl Bloom",
  invoiceBrandName: "Pearl Bloom",
  invoiceCompanyName: "",
  invoiceSellerAddress: "",
  invoiceSellerPhone: "",
  invoiceSellerEmail: "",
  invoiceSellerWebsite: "",
  invoiceSellerGstin: "",
  invoicePrefix: "INV",
  invoiceDefaultTaxRate: 0,
  invoiceQrUrlTemplate: "",
  invoiceNotes: "Thank you for shopping with us.\nThis is a computer-generated invoice.",
  invoiceBankDetails: "",

  deliverablePincodesText: "",
};

const SettingsPageSkeleton = () => (
  <div className="space-y-8 max-w-4xl animate-pulse">
    {/* Brand */}
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="h-6 bg-neutral-700 rounded w-1/4 mb-3"></div>
      <div className="h-9 bg-neutral-800 rounded w-full"></div>
    </div>
    {/* Hero */}
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
      <div className="h-6 bg-neutral-700 rounded w-1/4 mb-3"></div>
      <div className="h-9 bg-neutral-800 rounded w-full"></div>
      <div className="h-20 bg-neutral-800 rounded w-full"></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
        <div className="h-9 bg-neutral-800 rounded w-full"></div>
      </div>
    </div>
    {/* Footer */}
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
      <div className="h-6 bg-neutral-700 rounded w-1/4 mb-3"></div>
      <div className="h-9 bg-neutral-800 rounded w-full"></div>
      <div className="h-20 bg-neutral-800 rounded w-full"></div>
    </div>
  </div>
);

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  const functions = getFunctions(undefined, "us-central1");
  const uploadImage = httpsCallable(functions, "uploadImageCallable");
  const deleteImage = httpsCallable(functions, "deleteImageCallable");

  /* ---------------- Load settings ---------------- */

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "siteSettings", "main"));
      if (snap.exists()) {
        const data = snap.data() as any;
        const shipments = data.shipments ?? {};
        const pinsRaw =
          shipments?.deliverablePincodes ??
          data?.deliverablePincodes ??
          data?.shipping?.deliverablePincodes ??
          shipments?.deliverableWhitelist ??
          data?.deliverableWhitelist ??
          [];
        const pins = Array.isArray(pinsRaw)
          ? Array.from(
              new Set(
                pinsRaw
                  .map((v: any) => String(v ?? "").trim())
                  .flatMap((v: string) =>
                    v.split(/[\n,]+/g).map((x) => String(x ?? "").trim())
                  )
                  .filter(Boolean)
              )
            )
          : [];

        setForm({
          siteName: data.siteName ?? emptySettings.siteName,
          testMode: !!data.testMode,

          heroTitle: data.hero?.title ?? "",
          heroSubtitle: data.hero?.subtitle ?? "",
          heroCtaLabel: data.hero?.ctaLabel ?? "Explore Collection",
          heroCtaLink: data.hero?.ctaLink ?? "/collections/featured",
          heroImage: data.hero?.heroImage ?? undefined,

          footerBrandTitle: data.footer?.brandTitle ?? "Pearl Bloom",
          footerBrandDescription: data.footer?.brandDescription ?? "",
          contactEmail: data.footer?.contactEmail ?? "",
          contactPhone: data.footer?.contactPhone ?? "",
          footerLinks: data.footer?.links ?? [],
          socialLinks: data.footer?.socialLinks ?? [],

          invoiceSellerName: data.invoice?.sellerName ?? emptySettings.invoiceSellerName,
          invoiceBrandName:
            data.invoice?.brandName ??
            data.siteName ??
            emptySettings.invoiceBrandName,
          invoiceCompanyName:
            data.invoice?.companyName ??
            data.invoice?.sellerName ??
            "",
          invoiceSellerAddress: data.invoice?.sellerAddress ?? "",
          invoiceSellerPhone: data.invoice?.sellerPhone ?? "",
          invoiceSellerEmail: data.invoice?.sellerEmail ?? "",
          invoiceSellerWebsite: data.invoice?.sellerWebsite ?? "",
          invoiceSellerGstin: data.invoice?.sellerGstin ?? "",
          invoicePrefix: data.invoice?.prefix ?? emptySettings.invoicePrefix,
          invoiceDefaultTaxRate:
            typeof data.invoice?.defaultTaxRate === "number"
              ? data.invoice.defaultTaxRate
              : emptySettings.invoiceDefaultTaxRate,
          invoiceQrUrlTemplate: data.invoice?.qrUrlTemplate ?? "",
          invoiceNotes: data.invoice?.notes ?? emptySettings.invoiceNotes,
          invoiceBankDetails: data.invoice?.bankDetails ?? "",

          deliverablePincodesText: pins.join("\n"),
        });
      }
      setLoading(false);
    })();
  }, []);

  /* ---------------- Helpers ---------------- */

  const handleChange = (field: keyof SettingsForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ---------------- Base64 helper ---------------- */

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /* ---------------- Hero upload (Callable) ---------------- */

  const handleHeroImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingHero(true);

    try {
      const base64 = await fileToBase64(file);

      if (form.heroImage?.public_id) {
        await deleteImage({ public_id: form.heroImage.public_id });
      }

      const res: any = await uploadImage({
        base64,
        filename: file.name,
        folder: "hero",
      });

      setForm((prev) => ({
        ...prev,
        heroImage: {
          url: res.data.url,
          public_id: res.data.public_id,
        },
      }));
    } catch (err) {
      console.error(err);
      alert("Hero image upload failed");
    } finally {
      setUploadingHero(false);
    }
  };

  /* ---------------- Footer links helpers ---------------- */

  const addFooterLink = () => {
    setForm((prev) => ({
      ...prev,
      footerLinks: [...prev.footerLinks, { label: "", href: "" }],
    }));
  };

  const updateFooterLink = (
    index: number,
    field: "label" | "href",
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      footerLinks: prev.footerLinks.map((l, i) =>
        i === index ? { ...l, [field]: value } : l
      ),
    }));
  };

  const removeFooterLink = (index: number) => {
    setForm((prev) => ({
      ...prev,
      footerLinks: prev.footerLinks.filter((_, i) => i !== index),
    }));
  };

  /* ---------------- Social links helpers ---------------- */

  const addSocialLink = () => {
    setForm((prev) => ({
      ...prev,
      socialLinks: [
        ...prev.socialLinks,
        { platform: "instagram", url: "" },
      ],
    }));
  };

  const updateSocialLink = (
    index: number,
    field: "platform" | "url",
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((l, i) =>
        i === index ? { ...l, [field]: value } : l
      ),
    }));
  };

  const removeSocialLink = (index: number) => {
    setForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((_, i) => i !== index),
    }));
  };

  /* ---------------- Save ---------------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const deliverablePincodes = Array.from(
      new Set(
        String(form.deliverablePincodesText ?? "")
          .split(/[\n,]+/g)
          .map((v) => String(v ?? "").trim())
          .filter(Boolean)
      )
    );

    await setDoc(
      doc(db, "siteSettings", "main"),
      {
        siteName: form.siteName,
        testMode: !!form.testMode,

        hero: {
          title: form.heroTitle,
          subtitle: form.heroSubtitle,
          ctaLabel: form.heroCtaLabel,
          ctaLink: form.heroCtaLink,
          heroImage: form.heroImage,
        },

        footer: {
          brandTitle: form.footerBrandTitle,
          brandDescription: form.footerBrandDescription,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          links: form.footerLinks,
          socialLinks: form.socialLinks,
        },

        invoice: {
          sellerName: form.invoiceCompanyName || form.invoiceSellerName,
          brandName: form.invoiceBrandName,
          companyName: form.invoiceCompanyName,
          sellerAddress: form.invoiceSellerAddress,
          sellerPhone: form.invoiceSellerPhone,
          sellerEmail: form.invoiceSellerEmail,
          sellerWebsite: form.invoiceSellerWebsite,
          sellerGstin: form.invoiceSellerGstin,
          prefix: form.invoicePrefix,
          defaultTaxRate: Number.isFinite(form.invoiceDefaultTaxRate) ? form.invoiceDefaultTaxRate : 0,
          qrUrlTemplate: form.invoiceQrUrlTemplate,
          notes: form.invoiceNotes,
          bankDetails: form.invoiceBankDetails,
        },

        shipments: {
          deliverablePincodes,
        },
        deliverablePincodes,

        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setSaving(false);
  };

  if (loading) {
    return (
      <AdminLayout title="Settings" subtitle="Brand, hero and footer content.">
        <SettingsPageSkeleton />
      </AdminLayout>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <AdminLayout
      title="Settings"
      subtitle="Brand, hero and footer content for the public site."
    >
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 max-w-4xl">
        {/* Environment */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🧪</span>
            <h2 className="text-base sm:text-lg font-semibold">Environment</h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mb-4">
            Test mode disables Pixel and PostHog tracking on storefront.
          </p>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-700/60 bg-neutral-900/40 px-4 py-3 cursor-pointer hover:border-yellow-500/40 transition">
            <div className="flex items-center gap-2">
              <span className="text-neutral-300 text-sm">Test mode</span>
              {form.testMode && (
                <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full">Active</span>
              )}
            </div>
            <input
              type="checkbox"
              checked={!!form.testMode}
              onChange={(e) => handleChange("testMode", e.target.checked)}
              className="h-4 w-4 rounded accent-yellow-500"
            />
          </label>
        </section>

        {/* Brand */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">✨</span>
            <h2 className="text-base sm:text-lg font-semibold">Brand</h2>
          </div>
          <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Site Name</label>
          <input
            className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
            value={form.siteName}
            onChange={(e) => handleChange("siteName", e.target.value)}
          />
        </section>

        {/* Shipping */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📦</span>
            <h2 className="text-base sm:text-lg font-semibold">Shipping</h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mb-4">
            Deliverable pincodes for storefront and shipments.
          </p>
          <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Pincode Whitelist</label>
          <textarea
            rows={5}
            placeholder={"110001\n400001\n560001"}
            className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none font-mono"
            value={form.deliverablePincodesText}
            onChange={(e) => handleChange("deliverablePincodesText", e.target.value)}
          />
          <p className="text-[10px] text-neutral-500 mt-1.5">One pincode per line</p>
        </section>

        {/* Hero */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏠</span>
            <h2 className="text-base sm:text-lg font-semibold">Hero Section</h2>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Title</label>
            <input
              placeholder="Welcome to Pearl Bloom"
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
              value={form.heroTitle}
              onChange={(e) => handleChange("heroTitle", e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Subtitle</label>
            <textarea
              rows={2}
              placeholder="Exquisite jewelry for every occasion..."
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none"
              value={form.heroSubtitle}
              onChange={(e) => handleChange("heroSubtitle", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">CTA Label</label>
              <input
                placeholder="Explore Collection"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.heroCtaLabel}
                onChange={(e) => handleChange("heroCtaLabel", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">CTA Link</label>
              <input
                placeholder="/collections/featured"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.heroCtaLink}
                onChange={(e) => handleChange("heroCtaLink", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-2 block">Hero Image</label>
            <div className="flex items-start gap-4">
              {form.heroImage?.url ? (
                <img
                  src={form.heroImage.url}
                  alt="Hero"
                  className="h-24 sm:h-32 rounded-xl object-cover border border-neutral-700"
                />
              ) : (
                <div className="h-24 sm:h-32 w-32 sm:w-40 rounded-xl bg-neutral-800 flex items-center justify-center text-3xl border border-dashed border-neutral-600">
                  🖼️
                </div>
              )}
              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer bg-neutral-800 hover:bg-neutral-700 px-3 py-2 rounded-xl text-xs transition">
                  <span>{form.heroImage?.url ? "Replace image" : "Choose file"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleHeroImageUpload}
                  />
                </label>
                {uploadingHero && (
                  <p className="text-[10px] text-yellow-400 mt-2 animate-pulse">Uploading…</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🦶</span>
            <h2 className="text-base sm:text-lg font-semibold">Footer</h2>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Brand Title</label>
            <input
              placeholder="Pearl Bloom"
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
              value={form.footerBrandTitle}
              onChange={(e) => handleChange("footerBrandTitle", e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Brand Description</label>
            <textarea
              rows={2}
              placeholder="Exquisite jewelry crafted with love..."
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none"
              value={form.footerBrandDescription}
              onChange={(e) => handleChange("footerBrandDescription", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Contact Email</label>
              <input
                placeholder="hello@pearlbloom.in"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.contactEmail}
                onChange={(e) => handleChange("contactEmail", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Contact Phone</label>
              <input
                placeholder="+91 98765 43210"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.contactPhone}
                onChange={(e) => handleChange("contactPhone", e.target.value)}
              />
            </div>
          </div>

          {/* Footer links */}
          <div className="space-y-3 pt-2">
            <p className="text-xs sm:text-sm font-medium flex items-center gap-2">
              <span>🔗</span> Footer Links
            </p>

            {form.footerLinks.map((link, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-2">
                <input
                  placeholder="Label"
                  className="flex-1 rounded-xl bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                  value={link.label}
                  onChange={(e) => updateFooterLink(i, "label", e.target.value)}
                />
                <input
                  placeholder="/collections"
                  className="flex-1 rounded-xl bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                  value={link.href}
                  onChange={(e) => updateFooterLink(i, "href", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeFooterLink(i)}
                  className="px-3 py-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs transition"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addFooterLink}
              className="text-[11px] px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition"
            >
              + Add link
            </button>
          </div>

          {/* Social media */}
          <div className="space-y-3 pt-2">
            <p className="text-xs sm:text-sm font-medium flex items-center gap-2">
              <span>📱</span> Social Media
            </p>

            {form.socialLinks.map((social, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-2">
                <select
                  className="rounded-xl bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                  value={social.platform}
                  onChange={(e) => updateSocialLink(i, "platform", e.target.value)}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">Twitter / X</option>
                  <option value="youtube">YouTube</option>
                  <option value="linkedin">LinkedIn</option>
                </select>

                <input
                  placeholder="https://instagram.com/pearlbloom"
                  className="flex-1 rounded-xl bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                  value={social.url}
                  onChange={(e) => updateSocialLink(i, "url", e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => removeSocialLink(i)}
                  className="px-3 py-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs transition"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addSocialLink}
              className="text-[11px] px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition"
            >
              + Add social link
            </button>
          </div>
        </section>

        {/* Invoice */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧾</span>
            <h2 className="text-base sm:text-lg font-semibold">Invoice Settings</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Brand Name</label>
              <input
                placeholder="Pearl Bloom"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.invoiceBrandName}
                onChange={(e) => handleChange("invoiceBrandName", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Company Name</label>
              <input
                placeholder="Legal entity name"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.invoiceCompanyName}
                onChange={(e) => handleChange("invoiceCompanyName", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">GSTIN</label>
              <input
                placeholder="22AAAAA0000A1Z5"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition font-mono"
                value={form.invoiceSellerGstin}
                onChange={(e) => handleChange("invoiceSellerGstin", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Seller Address</label>
            <textarea
              rows={3}
              placeholder={"Line 1\nLine 2\nCity, State - Pincode"}
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none"
              value={form.invoiceSellerAddress}
              onChange={(e) => handleChange("invoiceSellerAddress", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Phone</label>
              <input
                placeholder="+91 98765 43210"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.invoiceSellerPhone}
                onChange={(e) => handleChange("invoiceSellerPhone", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Email</label>
              <input
                placeholder="billing@pearlbloom.in"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.invoiceSellerEmail}
                onChange={(e) => handleChange("invoiceSellerEmail", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Website</label>
              <input
                placeholder="https://pearlbloom.in"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.invoiceSellerWebsite}
                onChange={(e) => handleChange("invoiceSellerWebsite", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Prefix</label>
              <input
                placeholder="INV"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition font-mono"
                value={form.invoicePrefix}
                onChange={(e) => handleChange("invoicePrefix", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Tax Rate (%)</label>
              <input
                type="number"
                placeholder="18"
                className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition"
                value={form.invoiceDefaultTaxRate}
                onChange={(e) => handleChange("invoiceDefaultTaxRate", e.target.valueAsNumber)}
              />
            </div>
            <div className="text-[10px] text-neutral-500 flex items-center">
              Used if order doesn't have tax value
            </div>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">QR Link Template</label>
            <input
              placeholder="https://pearlbloom.in/order/{orderId}"
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition font-mono"
              value={form.invoiceQrUrlTemplate}
              onChange={(e) => handleChange("invoiceQrUrlTemplate", e.target.value)}
            />
            <p className="text-[10px] text-neutral-500 mt-1">Use {"{orderId}"} or {"{displayId}"}</p>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Invoice Notes</label>
            <textarea
              rows={3}
              placeholder={"Thank you for shopping with us.\nReturn policy terms..."}
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none"
              value={form.invoiceNotes}
              onChange={(e) => handleChange("invoiceNotes", e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-1.5 block">Bank Details</label>
            <textarea
              rows={3}
              placeholder={"Account Name: Pearl Bloom\nAccount No: XXXX\nIFSC: XXXX\nBank: XXXX"}
              className="w-full rounded-xl bg-neutral-900/60 border border-neutral-700 px-3.5 py-2.5 text-sm focus:outline-none focus:border-yellow-500/50 transition resize-none font-mono"
              value={form.invoiceBankDetails}
              onChange={(e) => handleChange("invoiceBankDetails", e.target.value)}
            />
          </div>
        </section>

        {/* Save Button - Sticky on mobile */}
        <div className="sticky bottom-4 sm:static">
          <button
            disabled={saving}
            className="w-full sm:w-auto rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-3 text-sm font-semibold disabled:opacity-50 transition shadow-lg shadow-yellow-500/20"
          >
            {saving ? "Saving…" : "💾 Save Settings"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
