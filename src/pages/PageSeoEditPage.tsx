import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import defaults from "../data/collectionSeoDefaults.json";

type Faq = { q: string; a: string };
type DefaultRow = {
  key: string; type: string; slug: string; name: string; group: string;
  metaTitle: string; metaDescription: string; h1: string; lede: string;
  keywords: string[]; faqs: Faq[];
};

const ROWS = defaults as DefaultRow[];

function pathFor(d: DefaultRow): string {
  return d.type === "all" ? "/earrings" : `/earrings/${d.type}/${d.slug}`;
}

export default function PageSeoEditPage() {
  const navigate = useNavigate();
  const { key } = useParams();
  const def = useMemo(() => ROWS.find((r) => r.key === key), [key]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [h1, setH1] = useState("");
  const [lede, setLede] = useState("");
  const [keywords, setKeywords] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [faqs, setFaqs] = useState<Faq[]>([]);

  useEffect(() => {
    if (!def) {
      setError("Unknown page.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "collectionSeo", def.key));
        const o = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
        setHasOverride(snap.exists());
        setMetaTitle((o.metaTitle as string) ?? def.metaTitle);
        setMetaDescription((o.metaDescription as string) ?? def.metaDescription);
        setH1((o.h1 as string) ?? def.h1);
        setLede((o.lede as string) ?? def.lede);
        setKeywords(((o.secondaryKeywords as string[]) ?? def.keywords ?? []).join(", "));
        setNoindex((o.noindex as boolean) ?? false);
        setFaqs(Array.isArray(o.faqs) ? (o.faqs as Faq[]) : def.faqs ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    })();
  }, [def]);

  async function save() {
    if (!def) return;
    setError(null);
    setSaving(true);
    try {
      await setDoc(
        doc(db, "collectionSeo", def.key),
        {
          type: def.type,
          slug: def.slug,
          name: def.name,
          metaTitle: metaTitle.trim(),
          metaDescription: metaDescription.trim(),
          h1: h1.trim(),
          lede: lede.trim(),
          secondaryKeywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
          noindex,
          faqs: faqs.filter((f) => f.q.trim() && f.a.trim()),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      navigate("/page-seo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!def) return;
    if (!window.confirm("Remove your custom SEO for this page and revert to the site default?")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "collectionSeo", def.key));
      navigate("/page-seo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset.");
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm";
  const card = "rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 space-y-4";
  const labelRow = "text-sm flex items-center justify-between";

  if (loading) return <AdminLayout title="Page SEO"><div className="p-6 text-neutral-500">Loading…</div></AdminLayout>;
  if (!def) return <AdminLayout title="Page SEO"><div className="p-6 text-red-400">{error || "Not found."}</div></AdminLayout>;

  return (
    <AdminLayout
      title={`SEO · ${def.name}`}
      subtitle={`${def.group} collection · pearlbloom.in${pathFor(def)}`}
      actions={<Link to="/page-seo" className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs">← All pages</Link>}
    >
      <div className="max-w-3xl mx-auto space-y-5 pb-24">
        {error && <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">{error}</div>}

        <div className={card}>
          <div>
            <label className={labelRow}>
              <span>Meta title</span>
              <span className={`text-xs ${metaTitle.length > 60 ? "text-red-400" : "text-neutral-500"}`}>{metaTitle.length}/60</span>
            </label>
            <input className={input} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelRow}>
              <span>Meta description</span>
              <span className={`text-xs ${metaDescription.length > 160 ? "text-red-400" : "text-neutral-500"}`}>{metaDescription.length}/160</span>
            </label>
            <textarea className={input} rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
          </div>

          {/* Google preview */}
          <div className="rounded-lg bg-white p-3">
            <p className="text-[#1a0dab] text-base leading-tight truncate">{metaTitle || `${def.name} | Pearl Bloom`}</p>
            <p className="text-[#006621] text-xs">pearlbloom.in › {def.type === "all" ? "earrings" : `earrings › ${def.type} › ${def.slug}`}</p>
            <p className="text-[#545454] text-xs mt-0.5 line-clamp-2">{metaDescription || "Add a meta description."}</p>
          </div>
        </div>

        <div className={card}>
          <div>
            <label className="text-sm">H1 heading (on-page)</label>
            <input className={input} value={h1} onChange={(e) => setH1(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Sub-heading line</label>
            <input className={input} value={lede} onChange={(e) => setLede(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Focus keywords (comma-separated)</label>
            <input className={input} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="stud earrings, gold studs, daily wear" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
            <span>Hide this page from search engines (noindex)</span>
          </label>
          <p className="text-xs text-neutral-500">The intro body copy is managed in code (already optimised). Leave a field blank to fall back to the site default.</p>
        </div>

        {/* FAQs */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">FAQs (accordion + Google FAQ rich result)</h3>
            <button type="button" className="text-sm font-semibold text-yellow-400" onClick={() => setFaqs((f) => [...f, { q: "", a: "" }])}>+ Add FAQ</button>
          </div>
          {faqs.length === 0 && <p className="text-sm text-neutral-500">No FAQs.</p>}
          {faqs.map((f, i) => (
            <div key={i} className="rounded-lg border border-neutral-800 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input className={`${input} mt-0`} placeholder="Question" value={f.q} onChange={(e) => setFaqs((arr) => arr.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                <button type="button" className="shrink-0 text-neutral-500 hover:text-red-400 px-2" onClick={() => setFaqs((arr) => arr.filter((_, j) => j !== i))}>✕</button>
              </div>
              <textarea className={`${input} mt-0`} rows={2} placeholder="Answer" value={f.a} onChange={(e) => setFaqs((arr) => arr.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 lg:left-64 bg-neutral-950 border-t border-neutral-800 px-4 py-3 flex items-center justify-end gap-3 z-30">
        {hasOverride && (
          <button type="button" disabled={saving} onClick={resetToDefault} className="mr-auto rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 disabled:opacity-50">
            Reset to default
          </button>
        )}
        <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-yellow-500 text-black px-6 py-2.5 text-sm font-bold disabled:opacity-50">
          {saving ? "Saving…" : "Save SEO"}
        </button>
      </div>
    </AdminLayout>
  );
}
