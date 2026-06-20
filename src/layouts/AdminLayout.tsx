// src/layouts/AdminLayout.tsx
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth, signOut, db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import ThemeToggle from "../components/ThemeToggle";

type AdminLayoutProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const navItems = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/analytics", label: "Analytics", icon: "📈" },
  { to: "/products", label: "Products", icon: "💎" },
  { to: "/collections", label: "Collections", icon: "🏷️" },
  { to: "/homepage", label: "Homepage", icon: "🏠" },
  { to: "/orders", label: "Orders", icon: "📦" },
  { to: "/coupons", label: "Coupons", icon: "🎟️" },
  { to: "/shipments", label: "Shipments", icon: "🚚" },
  { to: "/users", label: "Users", icon: "👥" },
  { to: "/reviews", label: "Reviews", icon: "⭐" },
  { to: "/journal", label: "Journal", icon: "✍️" },
  { to: "/page-seo", label: "Page SEO", icon: "🔍" },
  { to: "/chats", label: "Chats", icon: "💬", notify: true },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export default function AdminLayout({
  title,
  subtitle,
  actions,
  children,
}: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 🔔 unread chat count
  const [unreadChats, setUnreadChats] = useState(0);

  /* ---------------- Realtime chat notifications ---------------- */

  useEffect(() => {
    const q = query(
      collection(db, "chats"),
      where("lastSender", "==", "user")
    );

    return onSnapshot(q, (snap) => {
      setUnreadChats(snap.size);
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  /* ---------------- Logout ---------------- */

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex overflow-hidden">
      <aside className="hidden md:flex w-64 flex-col border-r border-neutral-800/60 bg-neutral-950/80">
        <div className="px-5 py-5 border-b border-neutral-800/60">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border border-yellow-500/30 flex items-center justify-center text-sm font-semibold text-yellow-300 group-hover:scale-105 transition-transform">
              PB
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-yellow-400/80 font-medium">
                Pearl Bloom
              </p>
              <p className="text-xs text-neutral-300">Admin Console</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <SideNavLink
              key={item.to}
              to={item.to}
              active={isActive(location.pathname, item.to)}
            >
              <span className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2.5">
                  <span className="text-sm opacity-70">{item.icon}</span>
                  <span className="text-[13px]">{item.label}</span>
                </span>
                {item.notify && unreadChats > 0 && (
                  <span className="bg-yellow-500 text-black text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse">
                    {unreadChats}
                  </span>
                )}
              </span>
            </SideNavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-800/60 space-y-2">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="w-full text-[12px] rounded-xl border border-neutral-700/60 px-3 py-2.5 text-neutral-400 hover:border-red-500/50 hover:text-red-300 hover:bg-red-950/30 transition flex items-center justify-center gap-2"
          >
            <span>🚪</span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b border-neutral-800/80 backdrop-blur">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="flex flex-col justify-center items-center gap-[4px] p-2 border border-neutral-700 rounded-lg hover:border-yellow-400 hover:bg-neutral-900 transition"
              aria-label="Toggle navigation"
            >
              <span
                className={`h-[2px] w-5 bg-neutral-200 transition-transform ${
                  mobileOpen ? "rotate-45 translate-y-[6px]" : ""
                }`}
              />
              <span
                className={`h-[2px] w-5 bg-neutral-200 transition-opacity ${
                  mobileOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`h-[2px] w-5 bg-neutral-200 transition-transform ${
                  mobileOpen ? "-rotate-45 -translate-y-[6px]" : ""
                }`}
              />
            </button>

            <Link to="/" className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-xs">
                PB
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 truncate">
                  Pearl Bloom
                </p>
                <p className="text-xs text-neutral-200 truncate">Admin console</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <ThemeToggle compact />
              <button
                onClick={handleLogout}
                className="text-[11px] rounded-full border border-neutral-700 px-2.5 py-1 text-neutral-200 hover:border-red-500/70 hover:text-red-300 hover:bg-red-900/20 transition"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[78vw] max-w-[320px] bg-neutral-950 border-r border-neutral-800/80 flex flex-col">
              <div className="px-5 py-5 border-b border-neutral-800/80">
                <Link
                  to="/"
                  onClick={handleNavClick}
                  className="flex items-center gap-2"
                >
                  <div className="h-9 w-9 rounded-full bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-xs">
                    PB
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                      Pearl Bloom
                    </p>
                    <p className="text-xs text-neutral-200">Admin console</p>
                  </div>
                </Link>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={handleNavClick}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition ${
                      isActive(location.pathname, item.to)
                        ? "bg-yellow-500/10 text-yellow-200 border border-yellow-500/50"
                        : "text-neutral-300 border border-transparent hover:bg-neutral-900 hover:text-yellow-100"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-base">{item.icon}</span>
                      <span className="text-sm">{item.label}</span>
                    </span>
                    {item.notify && unreadChats > 0 && (
                      <span className="bg-yellow-500 text-black text-[10px] px-2 py-0.5 rounded-full font-medium">
                        {unreadChats}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>

              <div className="p-4 border-t border-neutral-800/80 space-y-2">
                <ThemeToggle />
                <button
                  onClick={handleLogout}
                  className="w-full text-[12px] rounded-lg border border-neutral-700 px-3 py-2 text-neutral-200 hover:border-red-500/70 hover:text-red-300 hover:bg-red-900/20 transition"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-neutral-950 to-neutral-900/50">
          <main className="max-w-6xl mx-auto py-4 sm:py-6 md:py-8 px-4 sm:px-6">
            {(title || subtitle || actions) && (
              <div className="mb-4 sm:mb-6 flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  {title && (
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-xs sm:text-sm text-neutral-400 mt-1">{subtitle}</p>
                  )}
                </div>
                {actions && (
                  <div className="flex items-center gap-2 flex-wrap">{actions}</div>
                )}
              </div>
            )}

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function SideNavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`w-full px-3 py-2.5 rounded-xl flex items-center transition-all ${
        active
          ? "bg-yellow-500/10 text-yellow-200 border border-yellow-500/40 shadow-sm shadow-yellow-500/5"
          : "text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-200 border border-transparent"
      }`}
    >
      {children}
    </Link>
  );
}

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}
