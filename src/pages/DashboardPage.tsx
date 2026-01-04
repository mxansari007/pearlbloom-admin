// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, collection, query, where } from "../firebase";
import { getCountFromServer } from "firebase/firestore";
import AdminLayout from "../layouts/AdminLayout";
import { getCached } from "../lib/cache";

// Cache TTL for dashboard counts (5 minutes)
const CACHE_TTL_DASHBOARD = 5 * 60 * 1000;

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
        // Use cached counts to reduce Firestore reads
        const counts = await getCached(
          "dashboard:counts",
          async () => {
            // Use getCountFromServer for efficient counting (1 read per query instead of N reads)
            const [prodCount, collCount, revCount, subsCount, featCount] =
              await Promise.all([
                getCountFromServer(collection(db, "products")),
                getCountFromServer(collection(db, "collections")),
                getCountFromServer(collection(db, "reviews")),
                getCountFromServer(collection(db, "newsletterSubscribers")),
                getCountFromServer(
                  query(collection(db, "products"), where("isFeatured", "==", true))
                ),
              ]);

            return {
              products: prodCount.data().count,
              collections: collCount.data().count,
              reviews: revCount.data().count,
              subscribers: subsCount.data().count,
              featured: featCount.data().count,
            };
          },
          CACHE_TTL_DASHBOARD
        );

        setProductCount(counts.products);
        setCollectionCount(counts.collections);
        setReviewCount(counts.reviews);
        setSubscriberCount(counts.subscribers);
        setFeaturedCount(counts.featured);
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

      {/* Stats - 2 cols on mobile, 4 on desktop */}
      <section className="mb-6 sm:mb-8">
        {loading ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
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
      <section className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* Insights */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <span>📊</span> Store Insights
            </h3>
            {!loading && (
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded-full">
                {now.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {loading ? (
            <InsightsSkeleton />
          ) : (
            <>
              <div className="mb-5 p-3 sm:p-4 rounded-xl bg-neutral-900/50 border border-neutral-800/50">
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                  <span className="font-medium">Featured Coverage</span>
                  <span className="text-yellow-300 font-semibold">{featuredPercent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 via-amber-400 to-emerald-400 transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(featuredPercent, 2)}%` }}
                  />
                </div>
                <p className="mt-2 text-[10px] sm:text-[11px] text-neutral-500">
                  Aim for 20–40% featured products for a focused homepage.
                </p>
              </div>

              <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3">
                <InsightPill
                  title="Catalogue"
                  value={
                    productCount === 0
                      ? "Empty"
                      : productCount < 10
                      ? "Boutique"
                      : "Growing"
                  }
                  hint={
                    productCount < 10
                      ? "Add more pieces"
                      : "Group by themes"
                  }
                />
                <InsightPill
                  title="Balance"
                  value={
                    avgProductsPerCollection === "—"
                      ? "—"
                      : `${avgProductsPerCollection} avg`
                  }
                  hint={
                    avgProductsPerCollection === "—"
                      ? "Create collections"
                      : "Keep similar range"
                  }
                />
                <InsightPill
                  title="Engagement"
                  value={
                    reviewCount === 0
                      ? "No reviews"
                      : `${reviewCount} review${reviewCount > 1 ? "s" : ""}`
                  }
                  hint={
                    reviewCount === 0
                      ? "Add starter reviews"
                      : "Surface best ones"
                  }
                />
              </div>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-sm p-4 sm:p-6">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <span>⚡</span> Quick Actions
          </h3>
          <div className="space-y-2 sm:space-y-3">
            <QuickAction
              to="/products/new"
              title="Add a new piece"
              description="Create product with images & pricing"
              badge="5 min"
              icon="✨"
            />
            <QuickAction
              to="/collections"
              title="Tune collections"
              description="Reorganize categories"
              icon="🏷️"
            />
            <QuickAction
              to="/homepage"
              title="Refresh homepage"
              description="Update featured items"
              icon="🏠"
            />
            <QuickAction
              to="/settings"
              title="Brand & footer"
              description="Contact & brand story"
              icon="⚙️"
            />
          </div>
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

const InsightsSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-neutral-700 rounded w-1/2 mb-4"></div>
    <div className="h-2 bg-neutral-700 rounded-full w-full mb-2"></div>
    <div className="h-3 bg-neutral-700 rounded w-3/4 mb-6"></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
        <div className="h-3 bg-neutral-700 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-neutral-700 rounded w-3/4 mb-1"></div>
        <div className="h-3 bg-neutral-700 rounded w-full"></div>
      </div>
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
        <div className="h-3 bg-neutral-700 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-neutral-700 rounded w-3/4 mb-1"></div>
        <div className="h-3 bg-neutral-700 rounded w-full"></div>
      </div>
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
        <div className="h-3 bg-neutral-700 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-neutral-700 rounded w-3/4 mb-1"></div>
        <div className="h-3 bg-neutral-700 rounded w-full"></div>
      </div>
    </div>
  </div>
);

const STAT_ICONS: Record<string, string> = {
  Products: "📦",
  Collections: "🏷️",
  Reviews: "⭐",
  Subscribers: "💌",
};

const STAT_ACCENTS: Record<string, string> = {
  Products: "from-purple-500/20",
  Collections: "from-blue-500/20",
  Reviews: "from-amber-500/20",
  Subscribers: "from-emerald-500/20",
};

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  const icon = STAT_ICONS[label] || "📊";
  const accent = STAT_ACCENTS[label] || "from-neutral-500/20";

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5 hover:border-yellow-500/50 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 transition-all duration-200`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} to-transparent pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
            {label}
          </p>
          <span className="text-base sm:text-lg opacity-60">{icon}</span>
        </div>
        <p className="mt-2 text-2xl sm:text-3xl font-bold text-white">{value.toLocaleString()}</p>
        {helper && (
          <p className="mt-1.5 text-[10px] sm:text-xs text-neutral-400 leading-snug">
            {helper}
          </p>
        )}
      </div>
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
    <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-3 py-2.5 hover:bg-neutral-900/60 transition">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-neutral-500 mb-1 font-medium">
        {title}
      </p>
      <p className="text-xs sm:text-sm font-semibold text-neutral-100">{value}</p>
      <p className="mt-0.5 text-[9px] sm:text-[10px] text-neutral-500">{hint}</p>
    </div>
  );
}

function QuickAction({
  to,
  title,
  description,
  badge,
  icon = "→",
}: {
  to: string;
  title: string;
  description: string;
  badge?: string;
  icon?: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/30 px-3 py-3 hover:border-yellow-500/50 hover:bg-neutral-900/60 transition-all duration-200"
    >
      <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-sm group-hover:bg-yellow-500/20 group-hover:scale-110 transition-all">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-medium group-hover:text-yellow-100 transition truncate">
            {title}
          </h4>
          {badge && (
            <span className="text-[9px] sm:text-[10px] rounded-full bg-yellow-500/10 text-yellow-300 px-2 py-0.5 flex-shrink-0">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[10px] sm:text-xs text-neutral-500 truncate">{description}</p>
      </div>
    </Link>
  );
}
