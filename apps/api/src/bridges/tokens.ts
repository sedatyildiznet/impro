import { readFileSync } from "fs";

export type BridgeBot = { network: string; bot: string; asToken: string };

const DEFAULT_BOTS: { network: string; bot: string; env: string; file: string }[] = [
  { network: "whatsapp", bot: "@whatsappbot:impro.chat", env: "BRIDGE_WHATSAPP_AS_TOKEN", file: "whatsapp" },
  { network: "telegram", bot: "@telegrambot:impro.chat", env: "BRIDGE_TELEGRAM_AS_TOKEN", file: "telegram" },
  { network: "signal", bot: "@signalbot:impro.chat", env: "BRIDGE_SIGNAL_AS_TOKEN", file: "signal" },
  { network: "instagram", bot: "@instagrambot:impro.chat", env: "BRIDGE_INSTAGRAM_AS_TOKEN", file: "instagram" },
  { network: "messenger", bot: "@facebookbot:impro.chat", env: "BRIDGE_MESSENGER_AS_TOKEN", file: "messenger" },
  { network: "discord", bot: "@discordbot:impro.chat", env: "BRIDGE_DISCORD_AS_TOKEN", file: "discord" },
];

function tokenFromRegistration(name: string): string {
  const paths = [
    `/app/bridges/${name}/registration.yaml`,
    `/bridges/${name}/registration.yaml`,
    `/root/impro/infra/bridges/${name}/registration.yaml`,
  ];
  for (const p of paths) {
    try {
      const t = readFileSync(p, "utf8");
      const m = t.match(/^\s*as_token:\s*["']?([A-Za-z0-9._-]+)/m);
      if (m?.[1]) return m[1];
    } catch {
      /* missing */
    }
  }
  try {
    const json = JSON.parse(readFileSync("/app/bridge-tokens.json", "utf8")) as Record<string, string>;
    if (json[name]) return json[name];
  } catch {
    /* missing */
  }
  return "";
}

export function bridgeBots(): BridgeBot[] {
  return DEFAULT_BOTS.map((b) => ({
    network: b.network,
    bot: process.env[`BRIDGE_${b.network.toUpperCase()}_BOT`] || b.bot,
    asToken: process.env[b.env] || tokenFromRegistration(b.file),
  })).filter((b) => b.asToken);
}
