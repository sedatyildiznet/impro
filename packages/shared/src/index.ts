export const MATRIX_SERVER_NAME = "impro.chat" as const;
export const APP_HOST_DEFAULT = "app.impro.chat" as const;

export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "system",
  "matrix",
  "synapse",
  "api",
  "auth",
  "support",
  "security",
  "moderator",
  "impro",
  "staff",
  "billing",
  "abuse",
  "notices",
  "whatsappbot",
  "telegrambot",
  "signalbot",
  "instagrambot",
  "messengerbot",
  "discordbot",
  "guest",
  "bot",
  "null",
  "undefined",
] as const;

const LOCALPART_RE = /^[a-z][a-z0-9._=-]{1,62}$/;

export type UsernameIssue =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "reserved"
  | "leading_underscore";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): { ok: true; username: string } | { ok: false; issue: UsernameIssue } {
  const username = normalizeUsername(raw);
  if (!username) return { ok: false, issue: "empty" };
  if (username.startsWith("_")) return { ok: false, issue: "leading_underscore" };
  if (username.length < 2) return { ok: false, issue: "too_short" };
  if (username.length > 63) return { ok: false, issue: "too_long" };
  if (!LOCALPART_RE.test(username)) return { ok: false, issue: "invalid_chars" };
  if ((RESERVED_USERNAMES as readonly string[]).includes(username)) return { ok: false, issue: "reserved" };
  return { ok: true, username };
}

/** Canonical Matrix user ID. Always @localpart:impro.chat — never app/matrix subdomain. */
export function toMatrixUserId(username: string, serverName: string = MATRIX_SERVER_NAME): string {
  const n = normalizeUsername(username);
  return `@${n}:${serverName}`;
}

export function parseMatrixUserId(mxid: string): { localpart: string; server: string } | null {
  const m = mxid.match(/^@([^:]+):(.+)$/);
  if (!m) return null;
  return { localpart: m[1], server: m[2] };
}

export function assertImproMatrixId(mxid: string, serverName: string = MATRIX_SERVER_NAME): void {
  const parsed = parseMatrixUserId(mxid);
  if (!parsed) throw new Error("invalid_matrix_id");
  if (parsed.server !== serverName) {
    throw new Error(`matrix_id_server_mismatch: expected :${serverName}, got :${parsed.server}`);
  }
}

export const NETWORKS = [
  "impro",
  "matrix",
  "whatsapp",
  "telegram",
  "signal",
  "instagram",
  "messenger",
  "discord",
  "mock",
] as const;
export type Network = (typeof NETWORKS)[number];

export const CONNECTION_STATUSES = [
  "connected",
  "connecting",
  "syncing",
  "disconnected",
  "needs_attention",
  "unavailable",
  "experimental",
  "setup_required",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONVERSATION_STATUSES = ["open", "pending", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const WORKSPACE_ROLES = ["owner", "admin", "manager", "agent", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const SHARE_HISTORY_POLICIES = [
  "from_now",
  "last_24h",
  "last_7d",
  "entire",
] as const;
export type ShareHistoryPolicy = (typeof SHARE_HISTORY_POLICIES)[number];

export interface NetworkCapabilities {
  sendText: boolean;
  sendImage: boolean;
  sendVideo: boolean;
  sendAudio: boolean;
  sendFile: boolean;
  voiceMessage: boolean;
  reply: boolean;
  reaction: boolean;
  edit: boolean;
  delete: boolean;
  typing: boolean;
  readReceipt: boolean;
  threads: boolean;
  polls: boolean;
  stickers: boolean;
  gif: boolean;
  calls: boolean;
}

export const IMPRO_CAPABILITIES: NetworkCapabilities = {
  sendText: true,
  sendImage: true,
  sendVideo: true,
  sendAudio: true,
  sendFile: true,
  voiceMessage: true,
  reply: true,
  reaction: true,
  edit: true,
  delete: true,
  typing: true,
  readReceipt: true,
  threads: true,
  polls: false,
  stickers: true,
  gif: true,
  calls: false,
};

export function usernameIssueMessage(issue: UsernameIssue): string {
  switch (issue) {
    case "empty":
      return "Choose a username.";
    case "too_short":
      return "Username must be at least 2 characters.";
    case "too_long":
      return "Username is too long.";
    case "invalid_chars":
      return "Use lowercase letters, numbers, dots, underscores or dashes. Start with a letter.";
    case "reserved":
      return "That username is reserved.";
    case "leading_underscore":
      return "Usernames cannot start with an underscore.";
  }
}
