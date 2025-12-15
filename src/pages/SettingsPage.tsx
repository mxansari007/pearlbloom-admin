// src/pages/SettingsPage.tsx
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

type HeroImage = {
  url: string;
  public_id: string;
};

type SettingsForm = {
  siteName: string;

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
};

/* ---------------- Defaults ---------------- */

const emptySettings: SettingsForm = {
  siteName: "Pearl Bloom",

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

        setForm({
          siteName: data.siteName ?? emptySettings.siteName,

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

    // delete old image if exists
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

  /* ---------------- Save ---------------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    await setDoc(
      doc(db, "siteSettings", "main"),
      {
        siteName: form.siteName,

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
        },

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

        {/* Brand */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold mb-3">Brand</h2>
          <input
            className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
            value={form.siteName}
            onChange={(e) => handleChange("siteName", e.target.value)}
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
