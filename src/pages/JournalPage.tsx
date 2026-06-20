import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";
import legacyPosts from "../data/legacyPosts.json";

type PostRow = {
  slug: string;
  title: string;
  status: "draft" | "published";
  datePublished?: string;
  readMins?: number;
  kind?: string;
};

export default function JournalPage() {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "published" | "draft">("all");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function load() {
    try {
      const snap = await getDocs(collection(db, "blogPosts"));
      const list = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          slug: (x.slug as string) || d.id,
          title: (x.title as string) || "(untitled)",
          status: ((x.status as string) || "draft") as PostRow["status"],
          datePublished: x.datePublished as string | undefined,
          readMins: x.readMins as number | undefined,
          kind: x.kind as string | undefined,
        };
      });
      list.sort((a, b) => (b.datePublished || "").localeCompare(a.datePublished || ""));
      setRows(list);
    } catch (e) {
      console.error("Failed to load posts", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function importLegacy() {
    const posts = legacyPosts as Array<Record<string, unknown>>;
    if (!window.confirm(`Import ${posts.length} existing Journal posts? Posts that already exist are skipped (your edits are safe).`)) return;
    setImporting(true);
    setImportMsg(null);
    let created = 0;
    let skipped = 0;
    try {
      for (const p of posts) {
        const ref = doc(db, "blogPosts", p.slug as string);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          skipped++;
          continue;
        }
        await setDoc(ref, { ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        created++;
      }
      setImportMsg(`Imported ${created} post(s); skipped ${skipped} already in the Journal.`);
      await load();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const visible = rows.filter((r) => (tab === "all" ? true : r.status === tab));

  return (
    <AdminLayout
      title="Journal"
      subtitle="Write and manage blog posts for the storefront Journal."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={importLegacy}
            disabled={importing}
            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import existing posts"}
          </button>
          <Link to="/journal/new" className="rounded-full bg-amber-500 text-white px-4 py-1.5 text-xs font-bold">
            + New post
          </Link>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto">
        {importMsg && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-sm">{importMsg}</div>
        )}
        <div className="flex gap-2 mb-4">
          {(["all", "published", "draft"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                tab === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t} {t !== "all" && `(${rows.filter((r) => r.status === t).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-6 text-gray-500">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <p className="text-gray-500 mb-4">No posts yet.</p>
            <Link to="/journal/new" className="rounded-lg bg-amber-500 text-white px-5 py-2.5 text-sm font-bold">
              Write your first post
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {visible.map((r) => (
              <Link key={r.slug} to={`/journal/${r.slug}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                <span className={`shrink-0 w-2 h-2 rounded-full ${r.status === "published" ? "bg-green-500" : "bg-gray-300"}`} title={r.status} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{r.title}</p>
                  <p className="text-xs text-gray-400 truncate">/blog/{r.slug}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-400 hidden sm:block">{r.datePublished || "—"}</span>
                <span className="shrink-0 text-xs text-gray-400 hidden sm:block">{r.readMins ? `${r.readMins} min` : ""}</span>
                <span className={`shrink-0 text-[11px] font-bold uppercase px-2 py-0.5 rounded ${r.status === "published" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {r.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
