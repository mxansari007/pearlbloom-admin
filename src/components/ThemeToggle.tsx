// src/components/ThemeToggle.tsx
// Light <-> Colourful mode switch. Uses neutral-* / yellow-* utility classes
// so the button itself re-themes correctly in both modes.
import { useEffect, useState } from "react";
import { getTheme, setTheme, type AdminTheme } from "../lib/theme";

export default function ThemeToggle({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [theme, setLocal] = useState<AdminTheme>("light");

  // Sync from the value the inline boot script already applied.
  useEffect(() => {
    setLocal(getTheme());
  }, []);

  const isColour = theme === "colour";
  const toggle = () => {
    const next: AdminTheme = isColour ? "light" : "colour";
    setTheme(next);
    setLocal(next);
  };

  const label = isColour ? "Light mode" : "Colourful mode";
  const icon = isColour ? "☀️" : "🎨";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isColour}
        title={label}
        aria-label={label}
        className={`p-2 border border-neutral-700 rounded-lg text-neutral-200 hover:border-yellow-400 hover:text-yellow-300 hover:bg-neutral-900 transition ${className}`}
      >
        <span aria-hidden>{icon}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isColour}
      title={label}
      className={`w-full text-[12px] rounded-xl border border-neutral-700/60 px-3 py-2.5 text-neutral-400 hover:border-yellow-500/50 hover:text-yellow-300 hover:bg-yellow-500/5 transition flex items-center justify-center gap-2 ${className}`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
