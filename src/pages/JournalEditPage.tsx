import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import RichTextEditor from "../components/RichTextEditor";
import { getUploadCallable } from "../lib/functions";

type Faq = { q: string; a: string };
type RelLink = { label: string; href: string };
type HeroImage = { url: string; public_id?: string; alt: string };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = (e) => reject(e);
    fr.readAsDataURL(file);
  });

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function JournalEditPage() {
  const navigate = useNavigate();
  const { slug: routeSlug } = useParams();
  const isNew = !routeSlug || routeSlug === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [kind, setKind] = useState<"pillar" | "focused" | "post">("post");
  const [hero, setHero] = useState<HeroImage | null>(null);
  const [bodyHtml, setBodyHtml] = useState("");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [related, setRelated] = useState<RelLink[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [datePublished, setDatePublished] = useState(todayISO());
  const [showPreview, setShowPreview] = useState(false);

  // Auto-slug from title until the user edits the slug field.
  useEffect(() => {
    if (isNew && !slugTouched) setSlug(slugify(title));
  }, [title, isNew, slugTouched]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "blogPosts", routeSlug as string));
        if (!snap.exists()) {
          setError("Post not found.");
          return;
        }
        const d = snap.data() as Record<string, unknown>;
        setTitle((d.title as string) || "");
        setSlug((d.slug as string) || (routeSlug as string));
        setMetaTitle((d.metaTitle as string) || "");
        setMetaDescription((d.metaDescription as string) || "");
        setExcerpt((d.excerpt as string) || "");
        setKind(((d.kind as string) || "post") as typeof kind);
        setHero((d.heroImage as HeroImage) ?? null);
        setBodyHtml((d.bodyHtml as string) || "");
        setFaqs(Array.isArray(d.faqs) ? (d.faqs as Faq[]) : []);
        setRelated(Array.isArray(d.related) ? (d.related as RelLink[]) : []);
        setStatus(((d.status as string) || "draft") as typeof status);
        setDatePublished(((d.datePublished as string) || todayISO()).slice(0, 10));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load post.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, routeSlug]);

  const readMins = useMemo(() => {
    const words = bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }, [bodyHtml]);

  async function onHeroPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploadingHero(true);
      const dataUrl = await fileToDataUrl(file);
      const res = await getUploadCallable()({ filename: file.name, mimeType: file.type, base64: dataUrl });
      const url = res.data?.url;
      if (!url) throw new Error(res.data?.error || "Upload failed");
      setHero({ url, public_id: res.data?.public_id, alt: hero?.alt || "" });
    } catch (err) {
      alert(`Hero upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploadingHero(false);
    }
  }

  async function save(nextStatus: "draft" | "published") {
    setError(null);
    if (!title.trim()) return setError("Title is required.");
    const finalSlug = (slug || slugify(title)).trim();
    if (!finalSlug) return setError("Slug is required.");
    if (nextStatus === "published") {
      if (!metaDescription.trim()) return setError("Meta description is required to publish.");
      if (hero && !hero.alt.trim()) return setError("Hero image needs alt text to publish.");
    }

    try {
      setSaving(true);
      await setDoc(
        doc(db, "blogPosts", finalSlug),
        {
          slug: finalSlug,
          title: title.trim(),
          metaTitle: metaTitle.trim() || `${title.trim()} | Pearl Bloom`,
          metaDescription: metaDescription.trim(),
          excerpt: excerpt.trim(),
          kind,
          heroImage: hero,
          bodyHtml,
          faqs: faqs.filter((f) => f.q.trim() && f.a.trim()),
          related: related.filter((r) => r.label.trim() && r.href.trim()),
          status: nextStatus,
          datePublished,
          readMins,
          updatedAt: serverTimestamp(),
          ...(isNew && { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
      setStatus(nextStatus);
      navigate("/journal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Journal">
        <div className="p-6 text-gray-500">Loading…</div>
      </AdminLayout>
    );
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500";
  const card = "rounded-xl border border-gray-200 bg-white p-4";
  const label = "block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1";

  return (
    <AdminLayout title={isNew ? "New Journal Post" : "Edit Journal Post"}>
      <div className="max-w-5xl mx-auto space-y-5 pb-24">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

        <div className={card}>
          <label className={label}>Title (this becomes the page H1)</label>
          <input className={`${input} text-lg`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How to Style Jhumkas with Western Outfits" />
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Slug (URL)</label>
              <input
                className={input}
                value={slug}
                disabled={!isNew}
                onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
              />
              <p className="text-[11px] text-gray-400 mt-1">/blog/{slug || "your-post"}{!isNew && " · slug can't change after creation"}</p>
            </div>
            <div>
              <label className={label}>Type</label>
              <select className={input} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="post">Post</option>
                <option value="focused">Focused guide</option>
                <option value="pillar">Pillar guide</option>
              </select>
            </div>
          </div>
        </div>

        {/* Hero image */}
        <div className={card}>
          <label className={label}>Hero image</label>
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-40 h-28 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center text-gray-400 text-xs">
              {hero?.url ? <img src={hero.url} alt={hero.alt || "hero preview"} className="w-full h-full object-cover" /> : "No image"}
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <label className="inline-block rounded-lg bg-gray-900 text-white text-sm px-4 py-2 cursor-pointer">
                {uploadingHero ? "Uploading…" : hero?.url ? "Replace image" : "Upload image"}
                <input type="file" accept="image/*" className="hidden" onChange={onHeroPick} />
              </label>
              <input className={input} placeholder="Hero alt text (describe the image)" value={hero?.alt || ""} onChange={(e) => setHero((h) => (h ? { ...h, alt: e.target.value } : { url: "", alt: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={card}>
          <div className="flex items-center justify-between mb-2">
            <label className={label}>Body · {readMins} min read</label>
            <button type="button" className="text-xs text-amber-700 font-semibold" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>
          <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
          {showPreview && (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Preview</p>
              <div className="prose-blog max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </div>
          )}
        </div>

        {/* FAQs */}
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <label className={`${label} mb-0`}>FAQs (shown as accordion + Google FAQ rich result)</label>
            <button type="button" className="text-sm font-semibold text-amber-700" onClick={() => setFaqs((f) => [...f, { q: "", a: "" }])}>+ Add FAQ</button>
          </div>
          <div className="space-y-3">
            {faqs.length === 0 && <p className="text-sm text-gray-400">No FAQs yet.</p>}
            {faqs.map((f, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input className={input} placeholder="Question" value={f.q} onChange={(e) => setFaqs((arr) => arr.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                  <button type="button" className="shrink-0 text-gray-400 hover:text-red-500 px-2" onClick={() => setFaqs((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove FAQ">✕</button>
                </div>
                <textarea className={input} rows={2} placeholder="Answer" value={f.a} onChange={(e) => setFaqs((arr) => arr.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
              </div>
            ))}
          </div>
        </div>

        {/* Related links */}
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <label className={`${label} mb-0`}>Related collection links (shown as chips)</label>
            <button type="button" className="text-sm font-semibold text-amber-700" onClick={() => setRelated((r) => [...r, { label: "", href: "" }])}>+ Add link</button>
          </div>
          <div className="space-y-2">
            {related.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={input} placeholder="Label (e.g. Jhumka Earrings)" value={r.label} onChange={(e) => setRelated((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className={input} placeholder="/earrings/style/jhumka" value={r.href} onChange={(e) => setRelated((arr) => arr.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
                <button type="button" className="shrink-0 text-gray-400 hover:text-red-500 px-2" onClick={() => setRelated((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove link">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* SEO + publish */}
        <div className={card}>
          <label className={label}>Meta title (SEO)</label>
          <input className={input} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Defaults to “Title | Pearl Bloom”" />
          <label className={`${label} mt-3`}>Meta description (SEO · ~150 chars)</label>
          <textarea className={input} rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
          <p className="text-[11px] text-gray-400 mt-1">{metaDescription.length} chars</p>
          <label className={`${label} mt-3`}>Excerpt (card summary)</label>
          <textarea className={input} rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          <label className={`${label} mt-3`}>Publish date</label>
          <input type="date" className={input} value={datePublished} onChange={(e) => setDatePublished(e.target.value)} />
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 lg:left-64 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-end gap-3 z-30">
        <span className="mr-auto text-xs text-gray-400">{status === "published" ? "● Published" : "○ Draft"}</span>
        <button type="button" disabled={saving} onClick={() => save("draft")} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          Save draft
        </button>
        <button type="button" disabled={saving} onClick={() => save("published")} className="rounded-lg bg-amber-500 text-white px-6 py-2.5 text-sm font-bold disabled:opacity-50">
          {saving ? "Saving…" : "Publish"}
        </button>
      </div>
    </AdminLayout>
  );
}
