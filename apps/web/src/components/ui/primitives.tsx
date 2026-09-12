import { clsx } from "clsx";
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { initials } from "../../lib/network";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label="Impro">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg text-sm">i</span>
      <span>Impro</span>
    </div>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "muted" }) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:brightness-110",
    ghost: "bg-transparent text-mist-100 hover:bg-white/5",
    danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
    muted: "bg-ink-700 text-mist-100 hover:bg-ink-600",
  }[variant];
  return (
    <button
      className={clsx("rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50", styles, className)}
      {...props}
    />
  );
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wide text-mist-600">{label}</span>
      <input
        className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none placeholder:text-mist-600"
        {...props}
      />
    </label>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" />;
  }
  return (
    <div
      className="grid place-items-center rounded-full bg-ink-600 text-[11px] font-semibold text-mist-300"
      style={{ width: size, height: size }}
    >
      {initials(name || "?")}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose} role="dialog">
      <div className="w-full max-w-lg rounded-2xl bg-ink-800 p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-mist-500 hover:text-white" aria-label="Close">
            Esc
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
