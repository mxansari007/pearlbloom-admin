// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, collection, getDocs, query, where } from "../firebase";
import AdminLayout from "../layouts/AdminLayout";

export default function DashboardPage() {
  const [productCount, setProductCount] = useState(0);
  const [collectionCount, setCollectionCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [featuredCount, setFeaturedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, [now]);

  const formattedDate = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  useEffect(() => {
    (async () => {
      try {
        const [prodSnap, collSnap, revSnap, subsSnap, featuredSnap] =
          await Promise.all([
            getDocs(collection(db, "products")),
            getDocs(collection(db, "collections")),
            getDocs(collection(db, "reviews")),
            getDocs(collection(db, "newsletterSubscribers")),
            getDocs(
              query(collection(db, "products"), where("isFeatured", "==", true))
            ),
          ]);

        setProductCount(prodSnap.size);
        setCollectionCount(collSnap.size);
        setReviewCount(revSnap.size);
        setSubscriberCount(subsSnap.size);
        setFeaturedCount(featuredSnap.size);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const featuredPercent =
    productCount > 0 ? Math.round((featuredCount / productCount) * 100) : 0;

  const avgProductsPerCollection =
    collectionCount > 0
      ? (productCount / collectionCount).toFixed(1)
      : "—";

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="High-level view of your catalogue and engagement."
      actions={
        <>
          <Link
            to="/homepage"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-200 hover:border-yellow-500/70 hover:text-yellow-200 transition"
          >
            Customize homepage ↗
          </Link>
          <Link
            to="/products/new"
            className="inline-flex items-center gap-2 rounded-full bg-yellow-500 text-black px-4 py-1.5 text-xs font-medium shadow-[0_0_0_1px_rgba(0,0,0,0.9)] hover:bg-yellow-400 transition"
          >
            + Add product
          </Link>
        </>
      }
    >
      {/* Greeting */}
      <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-neutral-400">{formattedDate}</p>
          <h2 className="text-xl font-semibold tracking-tight mt-1">
            {greeting}, curator.
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Here’s how your jewelry store looks right now.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-8">
        {loading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Products"
              value={productCount}
              helper={
                featuredCount > 0
                  ? `${featuredCount} featured`
                  : "No featured items yet"
              }
            />
            <StatCard
              label="Collections"
              value={collectionCount}
              helper={
                avgProductsPerCollection !== "—"
                  ? `${avgProductsPerCollection} products / collection`
                  : "Create your first collection"
              }
            />
            <StatCard
              label="Reviews"
              value={reviewCount}
              helper="Social proof on product pages"
            />
            <StatCard
              label="Subscribers"
              value={subscriberCount}
              helper="Newsletter list size"
            />
          </div>
        )}
      </section>

      {/* Insights + quick actions */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* Insights */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Store insights</h3>
            {!loading && (
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                Auto ·{" "}
                {now.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-xs text-neutral-500">Calculating insights…</p>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                  <span>Featured coverage</span>
                  <span>{featuredPercent}% of catalogue</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 via-amber-400 to-emerald-300 transition-[width] duration-500"
                    style={{ width: `${featuredPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  Aim for 20–40% of products as “featured” to keep the homepage
                  focused but varied.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-[11px]">
                <InsightPill
                  title="Catalogue size"
                  value={
                    productCount === 0
                      ? "Empty"
                      : productCount < 10
                      ? "Boutique"
                      : "Growing"
                  }
                  hint={
                    productCount < 10
                      ? "Add a few more signature pieces."
                      : "Consider grouping by themes."
                  }
                />
                <InsightPill
                  title="Collection balance"
                  value={
                    avgProductsPerCollection === "—"
                      ? "No collections"
                      : `${avgProductsPerCollection} avg`
                  }
                  hint={
                    avgProductsPerCollection === "—"
                      ? "Create at least 3 collections."
                      : "Keep them in a similar range."
                  }
                />
                <InsightPill
                  title="Engagement"
                  value={
                    reviewCount === 0
                      ? "No reviews yet"
                      : `${reviewCount} review${reviewCount > 1 ? "s" : ""}`
                  }
                  hint={
                    reviewCount === 0
                      ? "Add a few starter reviews."
                      : "Surface best reviews on product pages."
                  }
                />
              </div>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Quick actions</h3>
          </div>
          <QuickAction
            to="/products/new"
            title="Add a new piece"
            description="Create a product with images, pricing and metadata."
            badge="5 min"
          />
          <QuickAction
            to="/collections"
            title="Tune collections"
            description="Reorganize engagement, necklaces, earrings & more."
          />
          <QuickAction
            to="/homepage"
            title="Refresh homepage"
            description="Swap featured items and update hero copy."
          />
          <QuickAction
            to="/settings"
            title="Brand & footer"
            description="Update contact details and brand story."
          />
        </div>
      </section>
    </AdminLayout>
  );
}

/* dashboard-only components */

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-5 animate-pulse">
      <div className="h-3 w-20 bg-neutral-800 rounded-full mb-3" />
      <div className="h-7 w-16 bg-neutral-800 rounded-full" />
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-4 hover:border-yellow-500/60 hover:-translate-y-[1px] transition">
      <p className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {helper && (
        <p className="mt-1 text-xs text-neutral-400 leading-snug">
          {helper}
        </p>
      )}
    </div>
  );
}

function InsightPill({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 mb-1">
        {title}
      </p>
      <p className="text-xs font-medium text-neutral-50">{value}</p>
      <p className="mt-0.5 text-[10px] text-neutral-500">{hint}</p>
    </div>
  );
}

function QuickAction({
  to,
  title,
  description,
  badge,
}: {
  to: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 hover:border-yellow-500/70 hover:bg-neutral-900/80 transition"
    >
      <div className="mt-1 h-6 w-6 rounded-full bg-yellow-500/10 border border-yellow-500/50 flex items-center justify-center text-[10px] text-yellow-300">
        →
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium group-hover:text-yellow-100">
            {title}
          </h4>
          {badge && (
            <span className="text-[10px] rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      </div>
    </Link>
  );
}
