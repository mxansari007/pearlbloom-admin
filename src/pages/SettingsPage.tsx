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
        <p className="text-sm text-neutral-400">Loading settings…</p>
      </AdminLayout>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <AdminLayout
      title="Settings"
      subtitle="Brand, hero and footer content for the public site."
    >
      <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold mb-1">Environment</h2>
          <p className="text-sm text-neutral-400 mb-4">
            Test mode can be used by the storefront to disable Pixel and PostHog tracking.
          </p>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-3">
            <span className="text-sm text-neutral-200">Test mode</span>
            <input
              type="checkbox"
              checked={!!form.testMode}
              onChange={(e) => handleChange("testMode", e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </section>

        {/* Brand */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold mb-3">Brand</h2>
          <input
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.siteName}
            onChange={(e) => handleChange("siteName", e.target.value)}
          />
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold mb-1">Shipping</h2>
          <p className="text-sm text-neutral-400 mb-4">
            Deliverable whitelist (pincodes) for the storefront and admin shipments flow.
          </p>
          <textarea
            rows={6}
            placeholder={"Enter one pincode per line\n110001\n400001\n560001"}
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.deliverablePincodesText}
            onChange={(e) => handleChange("deliverablePincodesText", e.target.value)}
          />
        </section>

        {/* Hero */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Hero section</h2>

          <input
            placeholder="Hero title"
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.heroTitle}
            onChange={(e) => handleChange("heroTitle", e.target.value)}
          />

          <textarea
            rows={3}
            placeholder="Hero subtitle"
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.heroSubtitle}
            onChange={(e) => handleChange("heroSubtitle", e.target.value)}
          />

          <div className="grid md:grid-cols-2 gap-4">
            <input
              placeholder="CTA label"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.heroCtaLabel}
              onChange={(e) =>
                handleChange("heroCtaLabel", e.target.value)
              }
            />
            <input
              placeholder="CTA link"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.heroCtaLink}
              onChange={(e) =>
                handleChange("heroCtaLink", e.target.value)
              }
            />
          </div>

          <div>
            <label className="text-sm">Hero image (Cloudinary)</label>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block text-sm"
              onChange={handleHeroImageUpload}
            />

            {uploadingHero && (
              <p className="text-xs text-neutral-400 mt-1">
                Uploading image…
              </p>
            )}

            {form.heroImage?.url && (
              <img
                src={form.heroImage.url}
                alt="Hero"
                className="mt-3 h-40 rounded-xl object-cover border border-neutral-700"
              />
            )}
          </div>
        </section>

        {/* Footer */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Footer</h2>

          <input
            placeholder="Brand title"
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.footerBrandTitle}
            onChange={(e) =>
              handleChange("footerBrandTitle", e.target.value)
            }
          />

          <textarea
            rows={3}
            placeholder="Brand description"
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.footerBrandDescription}
            onChange={(e) =>
              handleChange("footerBrandDescription", e.target.value)
            }
          />

          <div className="grid md:grid-cols-2 gap-4">
            <input
              placeholder="Contact email"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.contactEmail}
              onChange={(e) =>
                handleChange("contactEmail", e.target.value)
              }
            />
            <input
              placeholder="Contact phone"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.contactPhone}
              onChange={(e) =>
                handleChange("contactPhone", e.target.value)
              }
            />
          </div>

          {/* Footer links */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Footer links</p>

            {form.footerLinks.map((link, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Label"
                  className="flex-1 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
                  value={link.label}
                  onChange={(e) =>
                    updateFooterLink(i, "label", e.target.value)
                  }
                />
                <input
                  placeholder="/collections"
                  className="flex-1 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
                  value={link.href}
                  onChange={(e) =>
                    updateFooterLink(i, "href", e.target.value)
                  }
                />
                <button
                  type="button"
                  onClick={() => removeFooterLink(i)}
                  className="px-3 rounded-lg bg-red-600/70 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addFooterLink}
              className="text-xs px-3 py-1 rounded-lg bg-neutral-800"
            >
              + Add link
            </button>
          </div>

          {/* Social media */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Social media</p>

            {form.socialLinks.map((social, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-2 text-sm"
                  value={social.platform}
                  onChange={(e) =>
                    updateSocialLink(i, "platform", e.target.value)
                  }
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">Twitter / X</option>
                  <option value="youtube">YouTube</option>
                  <option value="linkedin">LinkedIn</option>
                </select>

                <input
                  placeholder="https://instagram.com/pearlbloom"
                  className="flex-1 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
                  value={social.url}
                  onChange={(e) =>
                    updateSocialLink(i, "url", e.target.value)
                  }
                />

                <button
                  type="button"
                  onClick={() => removeSocialLink(i)}
                  className="px-3 rounded-lg bg-red-600/70 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addSocialLink}
              className="text-xs px-3 py-1 rounded-lg bg-neutral-800"
            >
              + Add social link
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Invoice</h2>

          <div className="grid md:grid-cols-3 gap-4">
            <input
              placeholder="Brand name (shown on top)"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceBrandName}
              onChange={(e) => handleChange("invoiceBrandName", e.target.value)}
            />
            <input
              placeholder="Company legal name"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceCompanyName}
              onChange={(e) => handleChange("invoiceCompanyName", e.target.value)}
            />
            <input
              placeholder="GSTIN"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceSellerGstin}
              onChange={(e) => handleChange("invoiceSellerGstin", e.target.value)}
            />
          </div>

          <textarea
            rows={4}
            placeholder={"Seller address (multi-line)\nLine 1\nLine 2\nCity, State - Pincode"}
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.invoiceSellerAddress}
            onChange={(e) => handleChange("invoiceSellerAddress", e.target.value)}
          />

          <div className="grid md:grid-cols-3 gap-4">
            <input
              placeholder="Seller phone"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceSellerPhone}
              onChange={(e) => handleChange("invoiceSellerPhone", e.target.value)}
            />
            <input
              placeholder="Seller email"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceSellerEmail}
              onChange={(e) => handleChange("invoiceSellerEmail", e.target.value)}
            />
            <input
              placeholder="Website"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceSellerWebsite}
              onChange={(e) => handleChange("invoiceSellerWebsite", e.target.value)}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <input
              placeholder="Invoice prefix (e.g. INV)"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoicePrefix}
              onChange={(e) => handleChange("invoicePrefix", e.target.value)}
            />
            <input
              placeholder="Default tax rate (%)"
              type="number"
              className="rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
              value={form.invoiceDefaultTaxRate}
              onChange={(e) => handleChange("invoiceDefaultTaxRate", e.target.valueAsNumber)}
            />
            <div className="text-xs text-neutral-400 flex items-center">
              Used only if order doesn’t already have a tax value.
            </div>
          </div>

          <input
            placeholder="QR link template (optional). Use {orderId} or {displayId}"
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.invoiceQrUrlTemplate}
            onChange={(e) => handleChange("invoiceQrUrlTemplate", e.target.value)}
          />

          <textarea
            rows={4}
            placeholder={"Invoice notes / terms (one per line)\nThank you...\nReturn policy..."}
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.invoiceNotes}
            onChange={(e) => handleChange("invoiceNotes", e.target.value)}
          />

          <textarea
            rows={4}
            placeholder={"Bank details (optional, multi-line)\nAccount Name:\nAccount No:\nIFSC:\nBank:"}
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.invoiceBankDetails}
            onChange={(e) => handleChange("invoiceBankDetails", e.target.value)}
          />
        </section>

        <button
          disabled={saving}
          className="rounded-lg bg-yellow-500 text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </AdminLayout>
  );
}
