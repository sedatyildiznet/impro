export const NETWORK_META: Record<string, { label: string; className: string; short: string }> = {
  impro: { label: "Impro", className: "network-impro", short: "Im" },
  matrix: { label: "Matrix", className: "network-matrix", short: "Mx" },
  whatsapp: { label: "WhatsApp", className: "network-wa", short: "Wa" },
  telegram: { label: "Telegram", className: "network-tg", short: "Tg" },
  signal: { label: "Signal", className: "network-sg", short: "Sg" },
  instagram: { label: "Instagram", className: "network-ig", short: "Ig" },
  messenger: { label: "Messenger", className: "network-ig", short: "Ms" },
  discord: { label: "Discord", className: "network-dc", short: "Dc" },
  mock: { label: "MockChat", className: "network-impro", short: "Mk" },
};

export function networkMeta(n: string) {
  return NETWORK_META[n] || { label: n, className: "text-mist-500", short: n.slice(0, 2) };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
}

export function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
