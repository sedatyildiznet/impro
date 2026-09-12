function apiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "app.impro.chat" || host.startsWith("app.")) {
      return "/api";
    }
    const env = import.meta.env.VITE_API_URL as string | undefined;
    if (env) {
      try {
        const u = new URL(env);
        u.protocol = window.location.protocol;
        return u.origin;
      } catch {
        return env;
      }
    }
  }
  return (import.meta.env.VITE_API_URL as string) || "";
}

const API = apiBase();

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const raw = (data as { message?: unknown; code?: string }).message;
    const message = Array.isArray(raw) ? String(raw[0] || "Something went wrong.") : String(raw || "Something went wrong.");
    throw new ApiError(res.status, (data as { code?: string }).code || "error", message);
  }
  return data as T;
}

export const api = {
  register: (body: { username: string; displayName: string; email?: string; password: string }) =>
    req("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    req("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => req("/auth/logout", { method: "POST", body: "{}" }),
  me: () => req<{ user: User }>("/me"),
  conversations: (filter?: string, workspaceId?: string) => {
    const q = new URLSearchParams();
    if (filter) q.set("filter", filter);
    if (workspaceId) q.set("workspaceId", workspaceId);
    return req<{ conversations: Conversation[] }>(`/conversations?${q}`);
  },
  conversation: (id: string) => req(`/conversations/${id}`),
  messages: (id: string, from?: string) =>
    req(`/conversations/${id}/messages${from ? `?from=${encodeURIComponent(from)}` : ""}`),
  send: (id: string, body: string) =>
    req(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  startDm: (username: string) =>
    req("/conversations", { method: "POST", body: JSON.stringify({ username }) }),
  share: (id: string, workspaceId: string, historyPolicy: string) =>
    req(`/conversations/${id}/share`, { method: "POST", body: JSON.stringify({ workspaceId, historyPolicy }) }),
  assign: (id: string, assigneeId: string | null) =>
    req(`/conversations/${id}/assign`, { method: "POST", body: JSON.stringify({ assigneeId }) }),
  note: (id: string, body: string) =>
    req(`/conversations/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  snooze: (id: string, until: string) =>
    req(`/conversations/${id}/snooze`, { method: "POST", body: JSON.stringify({ until }) }),
  pin: (id: string, patch: object) =>
    req(`/conversations/${id}/pin`, { method: "POST", body: JSON.stringify(patch) }),
  contacts: () => req<{ contacts: Contact[] }>("/contacts"),
  merge: (primaryId: string, secondaryId: string) =>
    req("/contacts/merge", { method: "POST", body: JSON.stringify({ primaryId, secondaryId }) }),
  split: (id: string, identityId: string) =>
    req(`/contacts/${id}/split`, { method: "POST", body: JSON.stringify({ identityId }) }),
  connections: () => req("/connections"),
  startConnection: (network: string, displayName?: string) =>
    req<{ connection: { id: string; status: string }; step: LoginStep }>(
      `/connections/${network}/start`,
      { method: "POST", body: JSON.stringify({ displayName }) },
    ),
  connectionLoginState: (id: string) => req<{ step: LoginStep }>(`/connections/${id}/login-state`),
  connectionLoginStep: (id: string, payload: Record<string, string>) =>
    req<{ step: LoginStep }>(`/connections/${id}/login-step`, { method: "POST", body: JSON.stringify(payload) }),
  workspaces: () => req("/workspaces"),
  createWorkspace: (name: string) =>
    req("/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
  invite: (id: string, username: string) =>
    req(`/workspaces/${id}/invites`, { method: "POST", body: JSON.stringify({ username, role: "agent" }) }),
  search: (q: string) => req(`/search?q=${encodeURIComponent(q)}`),
  people: (q: string) => req(`/search/people?q=${encodeURIComponent(q)}`),
  profile: (patch: object) => req("/users/profile", { method: "PATCH", body: JSON.stringify(patch) }),
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  matrixUserId: string;
  isGlobalAdmin: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  network: string;
  avatar?: string | null;
  preview?: string | null;
  lastMessageAt?: string | null;
  unread: number;
  pinned: boolean;
  starred: boolean;
  type?: string;
  assignee?: { displayName: string; username: string } | null;
};

export type LoginStep = {
  type: "qr" | "code" | "user_input" | "complete" | "error" | "setup_required" | "waiting" | "cookies";
  message: string;
  qrData?: string;
  qrImageUrl?: string;
  fields?: { id: string; label: string; type: string }[];
  cookieUrl?: string;
};

export type Contact = {
  id: string;
  displayName: string;
  identities: { id: string; network: string; remoteDisplayName?: string }[];
};
