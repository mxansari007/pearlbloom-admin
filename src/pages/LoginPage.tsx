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
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid gap-8 md:grid-cols-[1.1fr_1fr] items-center">
        {/* Left side – brand / copy */}
        <div className="hidden md:flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 px-8 py-10 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-sm">
              PB
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Pearl Bloom
              </p>
              <p className="text-sm text-neutral-100">Catalogue admin console</p>
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Curate your jewellery, effortlessly.
            </h1>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              Sign in to manage products, homepage sections and brand content
              for your e-commerce catalogue. Changes you make here flow directly
              into the live storefront.
            </p>
          </div>

          <div className="mt-6 grid gap-3 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full border border-yellow-500/50 bg-yellow-500/10 flex items-center justify-center text-[10px] text-yellow-300">
                ✓
              </span>
              <div>
                <p className="font-medium text-neutral-100">
                  Realtime updates
                </p>
                <p className="text-[11px] text-neutral-400">
                  Firestore-backed content, synced with your storefront.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full border border-neutral-700 bg-neutral-900 flex items-center justify-center text-[10px] text-neutral-300">
                ✓
              </span>
              <div>
                <p className="font-medium text-neutral-100">
                  Crafted for daily use
                </p>
                <p className="text-[11px] text-neutral-400">
                  Clean, focused screens for quick updates.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side – login form */}
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/90 px-6 py-8 md:px-8 md:py-10 shadow-xl shadow-black/50">
          <div className="mb-6 md:mb-8 text-center md:text-left">
            <div className="flex md:hidden justify-center mb-3">
              <div className="h-10 w-10 rounded-full bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-sm">
                PB
              </div>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              Sign in to admin
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              Enter your credentials to access the dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-xs text-red-400 bg-red-900/30 border border-red-800/60 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <div>
              <label className="text-xs text-neutral-300">Email</label>
              <input
                className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/70"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="admin@example.com"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-neutral-300">Password</label>
                {/* You can later hook this up */}
                <span className="text-[11px] text-neutral-500">
                  {/* Forgot password? */}
                </span>
              </div>
              <input
                className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/70"
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
              className="w-full rounded-lg bg-yellow-500 text-black py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-yellow-400 transition"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-[11px] text-neutral-500 text-center md:text-left">
            Protected area. Only authorized admins should sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
