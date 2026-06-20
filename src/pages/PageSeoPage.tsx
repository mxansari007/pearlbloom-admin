import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import defaults from "../data/collectionSeoDefaults.json";

type DefaultRow = {
  key: string; type: string; slug: string; name: string; group: string;
  metaTitle: string; metaDescription: string;
};

const ROWS = defaults as DefaultRow[];
const GROUP_ORDER = ["Hub", "Style", "Finish", "Occasion"];

export default function PageSeoPage() {
  const [overrideKeys, setOverrideKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "collectionSeo"));
        setOverrideKeys(new Set(snap.docs.map((d) => d.id)));
      } catch (e) {
        console.error("Failed to load SEO overrides", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = GROUP_ORDER.map((g) => ({ group: g, rows: ROWS.filter((r) => r.group === g) })).filter((x) => x.rows.length);

  return (
    <AdminLayout
      title="Page SEO"
      subtitle="Meta title, description, headings & FAQs for every collection page. Blank fields use the site default."
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {loading && <p className="text-neutral-500 text-sm">Loading…</p>}
        {groups.map(({ group, rows }) => (
          <section key={group}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">
              {group === "Hub" ? "All Earrings" : `${group} pages`} <span className="text-neutral-600">({rows.length})</span>
            </h3>
            <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-neutral-950/40">
              {rows.map((r) => {
                const customised = overrideKeys.has(r.key);
                return (
                  <Link key={r.key} to={`/page-seo/${r.key}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-neutral-900/60 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.name}</p>
                      <p className="text-xs text-neutral-500 truncate">{r.metaTitle}</p>
                    </div>
                    {customised ? (
                      <span className="shrink-0 text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Customised</span>
                    ) : (
                      <span className="shrink-0 text-[11px] uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-500">Default</span>
                    )}
                    <span className="shrink-0 text-neutral-600">›</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
