// src/layouts/AdminLayout.tsx
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth, signOut } from "../firebase";

type AdminLayoutProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/products", label: "Products" },
  { to: "/collections", label: "Collections" },
  { to: "/homepage", label: "Homepage" },
  { to: "/settings", label: "Settings" },
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleNavClick = () => {
    setMobileOpen(false); // close menu after navigating
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Top bar */}
      <header className="border-b border-neutral-800/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-4 gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-xs">
              PB
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                Pearl Bloom
              </p>
              <p className="text-xs text-neutral-200">Admin console</p>
            </div>
          </Link>

          {/* Desktop nav + logout */}
          <div className="hidden sm:flex items-center gap-3">
            <nav className="flex gap-2 text-xs text-neutral-300">
              {navItems.map((item) => (
                <AdminNavLink
                  key={item.to}
                  to={item.to}
                  active={isActive(location.pathname, item.to)}
                >
                  {item.label}
                </AdminNavLink>
              ))}
            </nav>

            <button
              onClick={handleLogout}
              className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-red-500/70 hover:text-red-300 hover:bg-red-900/20 transition"
            >
              Logout
            </button>
          </div>

          {/* Mobile: hamburger + logout icon */}
          <div className="sm:hidden flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="text-[11px] rounded-full border border-neutral-700 px-2.5 py-1 text-neutral-200 hover:border-red-500/70 hover:text-red-300 hover:bg-red-900/20 transition"
            >
              Log out
            </button>
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

          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-neutral-800 bg-neutral-950/98">
            <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 text-xs">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={handleNavClick}
                  className={`px-3 py-2 rounded-lg ${
                    isActive(location.pathname, item.to)
                      ? "bg-neutral-800 text-yellow-200 border border-yellow-500/60"
                      : "text-neutral-300 border border-transparent hover:bg-neutral-900 hover:text-yellow-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="max-w-6xl mx-auto py-8 px-4">
        {(title || subtitle || actions) && (
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              {title && (
                <h1 className="text-2xl font-semibold tracking-tight">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2">{actions}</div>
            )}
          </div>
        )}

        {children}
      </main>
    </div>
  );
}

function AdminNavLink({
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
      className={`px-3 py-1.5 rounded-full text-xs transition ${
        active
          ? "bg-neutral-800 text-yellow-200 border border-yellow-500/60"
          : "text-neutral-300 hover:bg-neutral-900 hover:text-yellow-100 border border-transparent"
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
