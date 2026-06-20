import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, signInWithEmailAndPassword } from "../firebase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100 flex items-center justify-center px-4 py-8">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl grid gap-6 md:gap-8 md:grid-cols-[1.1fr_1fr] items-center">
        {/* Left side – brand / copy */}
        <div className="hidden md:flex flex-col gap-4 rounded-3xl border border-neutral-800/60 bg-gradient-to-br from-neutral-900/80 via-neutral-950/90 to-neutral-900/80 backdrop-blur-sm px-8 py-10 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border border-yellow-500/30 flex items-center justify-center text-lg font-semibold text-yellow-300 shadow-lg shadow-yellow-500/10">
              PB
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-yellow-400/80 font-medium">
                Pearl Bloom
              </p>
              <p className="text-sm text-neutral-200">Admin Console</p>
            </div>
          </div>

          <div className="mt-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
              Curate your jewellery, effortlessly.
            </h1>
            <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
              Manage products, homepage sections and brand content. Changes flow directly into the live storefront.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/50 border border-neutral-800/50">
              <span className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm text-emerald-400 flex-shrink-0">
                ⚡
              </span>
              <div>
                <p className="font-medium text-neutral-100 text-sm">Realtime Updates</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Firestore-backed, synced instantly.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/50 border border-neutral-800/50">
              <span className="h-8 w-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-sm text-blue-400 flex-shrink-0">
                ✨
              </span>
              <div>
                <p className="font-medium text-neutral-100 text-sm">Crafted for Daily Use</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Clean, focused screens.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side – login form */}
        <div className="rounded-3xl border border-neutral-800/60 bg-neutral-900/80 backdrop-blur-sm px-6 py-8 sm:px-8 sm:py-10 shadow-2xl">
          {/* Mobile header */}
          <div className="mb-6 sm:mb-8 text-center md:text-left">
            <div className="flex md:hidden justify-center mb-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border border-yellow-500/30 flex items-center justify-center text-xl font-bold text-yellow-300 shadow-lg shadow-yellow-500/10">
                PB
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Welcome back 👋
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-neutral-400">
              Sign in to access your dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/50 border border-red-500/30 px-4 py-3 rounded-xl">
                <span className="flex-shrink-0">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">Email</label>
              <input
                className="mt-2 w-full rounded-xl bg-neutral-950/60 border border-neutral-700 px-4 py-3 text-sm focus:outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/10 transition-all placeholder:text-neutral-600"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="admin@pearlbloom.in"
                required
              />
            </div>

            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">Password</label>
              <input
                className="mt-2 w-full rounded-xl bg-neutral-950/60 border border-neutral-700 px-4 py-3 text-sm focus:outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/10 transition-all placeholder:text-neutral-600"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black py-3.5 text-sm font-semibold disabled:opacity-50 transition-all shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Signing in…
                </span>
              ) : (
                "Sign in →"
              )}
            </button>
          </form>

          <p className="mt-6 text-[10px] sm:text-[11px] text-neutral-500 text-center">
            🔒 Protected area · Authorized admins only
          </p>
        </div>
      </div>
    </div>
  );
}
