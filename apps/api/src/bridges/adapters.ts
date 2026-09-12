import { IMPRO_CAPABILITIES, NetworkCapabilities, type Network } from "@impro/shared";

export interface LoginStep {
  type: "qr" | "code" | "user_input" | "complete" | "error" | "setup_required" | "waiting" | "cookies";
  message: string;
  qrData?: string;
  qrImageUrl?: string;
  fields?: { id: string; label: string; type: string }[];
  cookieUrl?: string;
  experimental?: boolean;
  processId?: string;
  stepId?: string;
}

export interface ConnectionAdapter {
  network: Network;
  displayName: string;
  experimental: boolean;
  setupRequired(): boolean;
  capabilities(): NetworkCapabilities;
  startLogin(userId: string, connectionId: string, matrixToken?: string): Promise<LoginStep>;
  submitLoginStep(connectionId: string, payload: Record<string, string>, matrixToken?: string): Promise<LoginStep>;
  getLoginState(connectionId: string, matrixToken?: string, mxid?: string): Promise<LoginStep>;
  disconnect(connectionId: string, matrixToken?: string, mxid?: string): Promise<void>;
  reconnect(connectionId: string, matrixToken?: string): Promise<void>;
  getStatus(): Promise<"working" | "requires_credentials" | "experimental" | "unavailable">;
  accountState?(mxid: string): Promise<"connected" | "logged_out" | "connecting" | "unknown">;
}

const TEXT_CAP: NetworkCapabilities = { ...IMPRO_CAPABILITIES };

type Process = {
  loginId: string;
  stepId: string;
  txnId?: string;
  mxid: string;
  token: string;
  network: string;
  lastStep?: LoginStep;
  qrData?: string;
  discordDone?: boolean;
  discordName?: string;
  discordError?: string;
  close?: () => void;
};

const processes = new Map<string, Process>();

type WhoamiLogin = { id?: string; name?: string; state?: { state_event?: string; message?: string } };
type ProvisionStep = {
  login_id?: string;
  type?: string;
  step_id?: string;
  txn_id?: string;
  instructions?: string;
  display_and_wait?: { type?: string; data?: string; image_url?: string };
  user_input?: { fields?: { id: string; name: string; type: string }[] };
  cookies?: { url?: string; fields?: { id: string; name?: string; required?: boolean }[] };
  complete?: { user_login_id?: string };
  logins?: WhoamiLogin[];
  error?: string;
  errcode?: string;
  success?: boolean;
  username?: string;
};

function remember(connectionId: string, raw: ProvisionStep, mxid: string, token: string, network: string) {
  const prev = processes.get(connectionId);
  const lastStep = mapStep(raw, prev?.lastStep?.message || "Continue.");
  if (raw.login_id && raw.step_id) {
    processes.set(connectionId, {
      loginId: raw.login_id,
      stepId: raw.step_id,
      txnId: raw.txn_id,
      mxid,
      token,
      network,
      lastStep,
      close: prev?.close,
      qrData: lastStep.qrData || prev?.qrData,
    });
  } else if (prev) {
    prev.lastStep = lastStep;
    if (lastStep.qrData) prev.qrData = lastStep.qrData;
  }
}

function mapStep(raw: ProvisionStep, fallback: string): LoginStep {
  if (raw.errcode || raw.error) {
    return { type: "error", message: raw.error || "Couldn't connect that account." };
  }
  if (raw.type === "complete") {
    return { type: "complete", message: "Connected", processId: raw.login_id, stepId: raw.step_id };
  }
  if (raw.type === "display_and_wait") {
    const d = raw.display_and_wait || {};
    if (d.type === "qr" || d.data || d.image_url) {
      return {
        type: "qr",
        message: raw.instructions || "Scan the code with the official app.",
        qrData: d.data,
        qrImageUrl: d.image_url,
        processId: raw.login_id,
        stepId: raw.step_id,
      };
    }
    if (d.type === "code" || d.data) {
      return { type: "code", message: raw.instructions || d.data || "Enter the code on your phone.", processId: raw.login_id, stepId: raw.step_id };
    }
    return { type: "waiting", message: raw.instructions || "Waiting for the official app…", processId: raw.login_id, stepId: raw.step_id };
  }
  if (raw.type === "user_input") {
    return {
      type: "user_input",
      message: raw.instructions || "Enter the requested details.",
      fields: (raw.user_input?.fields || []).map((f) => ({ id: f.id, label: f.name, type: f.type })),
      processId: raw.login_id,
      stepId: raw.step_id,
    };
  }
  if (raw.type === "cookies") {
    return {
      type: "cookies",
      message: raw.instructions || "Paste cookies from the official site (JSON, curl, or sessionid=…).",
      cookieUrl: raw.cookies?.url,
      fields: (raw.cookies?.fields || []).map((f) => ({ id: f.id, label: f.name || f.id, type: "text" })),
      processId: raw.login_id,
      stepId: raw.step_id,
    };
  }
  return { type: "waiting", message: raw.instructions || fallback, processId: raw.login_id, stepId: raw.step_id };
}

function connectedLogin(who: ProvisionStep): WhoamiLogin | undefined {
  const logins = who.logins || [];
  return logins.find((l) => {
    const st = l.state?.state_event || "";
    return st === "CONNECTED" || st === "TRANSIENT_DISCONNECT";
  });
}

export function loginHealth(who: ProvisionStep): "connected" | "logged_out" | "connecting" | "unknown" {
  const logins = who.logins || [];
  if (!logins.length) return "unknown";
  const st = logins[0]?.state?.state_event || "";
  if (st === "CONNECTED" || st === "TRANSIENT_DISCONNECT") return "connected";
  if (st === "CONNECTING") return "connecting";
  if (st === "BAD_CREDENTIALS" || st === "LOGGED_OUT" || st === "UNKNOWN_ERROR") return "logged_out";
  return "unknown";
}

class MockAdapter implements ConnectionAdapter {
  network: Network = "mock";
  displayName = "MockChat";
  experimental = false;
  setupRequired() { return false; }
  capabilities() { return TEXT_CAP; }
  async startLogin(): Promise<LoginStep> {
    return { type: "complete", message: "MockChat connected" };
  }
  async submitLoginStep(): Promise<LoginStep> {
    return { type: "complete", message: "MockChat connected" };
  }
  async getLoginState(): Promise<LoginStep> {
    return { type: "complete", message: "connected" };
  }
  async disconnect() {}
  async reconnect() {}
  async getStatus() { return "working" as const; }
}

class ProvisioningAdapter implements ConnectionAdapter {
  experimental: boolean;
  constructor(
    public network: Network,
    public displayName: string,
    private readonly envFlag: string,
    private readonly baseUrl: string | undefined,
    experimental = false,
  ) {
    this.experimental = experimental;
  }
  setupRequired() {
    if (this.network === "telegram") {
      const id = (process.env.TELEGRAM_API_ID || "").trim();
      const hash = (process.env.TELEGRAM_API_HASH || "").trim();
      return !id || !hash || id === "12345";
    }
    return false;
  }
  capabilities() { return TEXT_CAP; }
  private prefix() {
    return `${(this.baseUrl || "").replace(/\/$/, "")}/_matrix/provision`;
  }
  async getStatus() {
    if (this.setupRequired()) return "requires_credentials";
    if (!this.baseUrl) return this.experimental ? "experimental" : "unavailable";
    try {
      const r = await fetch(`${this.prefix()}/v3/login/flows`, { signal: AbortSignal.timeout(2500) });
      if (r.ok || r.status === 401) return this.experimental ? "experimental" : "working";
    } catch {
      /* down */
    }
    return this.experimental ? "experimental" : "unavailable";
  }

  private authHeaders() {
    const secret = process.env.BRIDGE_PROVISIONING_SECRET || "";
    return {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    };
  }

  private async req(path: string, mxid: string, method = "GET", body?: unknown, timeoutMs?: number): Promise<ProvisionStep> {
    const url = new URL(`${this.prefix()}${path}`);
    if (mxid) url.searchParams.set("user_id", mxid);
    const res = await fetch(url, {
      method,
      headers: this.authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as ProvisionStep;
    if (!res.ok && !json.type && !json.logins) {
      json.error = json.error || json.errcode || `HTTP ${res.status}`;
    }
    return json;
  }

  private async whoami(mxid: string): Promise<ProvisionStep> {
    try {
      return await this.req("/v3/whoami", mxid, "GET", undefined, 8000);
    } catch {
      return {};
    }
  }

  async startLogin(userId: string, connectionId: string, matrixToken = ""): Promise<LoginStep> {
    if (this.setupRequired()) {
      return {
        type: "setup_required",
        message:
          this.network === "telegram"
            ? "Telegram needs TELEGRAM_API_ID and TELEGRAM_API_HASH from my.telegram.org, then restart the Telegram bridge."
            : `${this.displayName} needs extra credentials from the operator.`,
      };
    }
    if (!this.baseUrl) {
      return { type: "error", message: `${this.displayName} isn't running yet.` };
    }
    const already = connectedLogin(await this.whoami(userId));
    if (already) {
      return { type: "complete", message: `Already connected as ${already.name || this.displayName}` };
    }
    try {
      const flows = await this.req("/v3/login/flows", userId);
      const list = (flows as unknown as { flows?: { id: string }[] }).flows;
      if (!list?.length) {
        return { type: "error", message: `${this.displayName} has no login method available.` };
      }
      const preferred =
        this.network === "messenger"
          ? list.find((f) => f.id === "messenger-lite") || list.find((f) => f.id === "facebook") || list[0]
          : list.find((f) => f.id === "qr") || list.find((f) => f.id === "phone") || list[0];
      const started = await this.req(`/v3/login/start/${encodeURIComponent(preferred.id)}`, userId, "POST", {});
      remember(connectionId, started, userId, matrixToken, this.network);
      return mapStep(started, `Continue ${this.displayName} login.`);
    } catch {
      return { type: "error", message: `${this.displayName} is temporarily unavailable.` };
    }
  }

  async submitLoginStep(connectionId: string, payload: Record<string, string>, matrixToken = ""): Promise<LoginStep> {
    const proc = processes.get(connectionId);
    if (!proc) return { type: "error", message: "Start the connection again." };
    const q = proc.txnId ? `?txn_id=${encodeURIComponent(proc.txnId)}` : "";
    const kind = payload.__kind === "cookies" || proc.lastStep?.type === "cookies" ? "cookies" : "user_input";
    const raw = (payload.raw || "").trim();
    const rest = { ...payload };
    delete rest.__kind;
    delete rest.raw;
    let body: unknown = rest;
    if (kind === "cookies") {
      if (raw.startsWith("curl")) body = { curl: raw };
      else if (raw.startsWith("{")) {
        try {
          body = { cookies: JSON.parse(raw) as Record<string, string> };
        } catch {
          return { type: "error", message: "Cookie JSON is not valid." };
        }
      } else {
        const cookies: Record<string, string> = {};
        for (const [k, v] of Object.entries(rest)) if (v) cookies[k] = v;
        if (raw.includes("=")) {
          for (const part of raw.split(";")) {
            const i = part.indexOf("=");
            if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
          }
        }
        body = { cookies };
      }
    }
    const next = await this.req(
      `/v3/login/step/${encodeURIComponent(proc.loginId)}/${encodeURIComponent(proc.stepId)}/${kind}${q}`,
      proc.mxid,
      "POST",
      body,
    );
    remember(connectionId, next, proc.mxid, matrixToken || proc.token, this.network);
    if (next.type === "complete") processes.delete(connectionId);
    return mapStep(next, "Continue.");
  }

  async getLoginState(connectionId: string, matrixToken = "", mxid = ""): Promise<LoginStep> {
    const proc = processes.get(connectionId);
    const user = mxid || proc?.mxid || "";
    if (user) {
      const who = await this.whoami(user);
      const health = loginHealth(who);
      if (health === "connected") {
        const ok = connectedLogin(who);
        proc?.close?.();
        processes.delete(connectionId);
        return { type: "complete", message: `Connected${ok?.name ? ` as ${ok.name}` : ""}` };
      }
      if (health === "logged_out" && !proc) {
        const msg = who.logins?.[0]?.state?.message || "Logged out from the official app. Connect again.";
        return { type: "error", message: msg };
      }
    }
    if (!proc) {
      return { type: "waiting", message: "Waiting for the official app. Keep this window open." };
    }
    const waitingOnInput = proc.lastStep?.type === "cookies" || proc.lastStep?.type === "user_input";
    if (waitingOnInput && proc.lastStep) return proc.lastStep;
    const q = proc.txnId ? `?txn_id=${encodeURIComponent(proc.txnId)}` : "";
    try {
      const next = await this.req(
        `/v3/login/step/${encodeURIComponent(proc.loginId)}/${encodeURIComponent(proc.stepId)}/display_and_wait${q}`,
        proc.mxid,
        "POST",
        undefined,
        20000,
      );
      remember(connectionId, next, proc.mxid, matrixToken || proc.token, this.network);
      if (next.type === "complete") {
        proc.close?.();
        processes.delete(connectionId);
      }
      return mapStep(next, "Waiting for the official app…");
    } catch {
      if (user) {
        const who = await this.whoami(user);
        if (loginHealth(who) === "connected") {
          proc.close?.();
          processes.delete(connectionId);
          return { type: "complete", message: "Connected" };
        }
      }
      return proc.lastStep || { type: "waiting", message: "Waiting for the official app…" };
    }
  }

  async disconnect(_connectionId: string, _matrixToken = "", mxid = "") {
    const proc = processes.get(_connectionId);
    const user = mxid || proc?.mxid || "";
    await this.req("/v3/logout/all", user, "POST", {}).catch(() => undefined);
    processes.delete(_connectionId);
  }
  async reconnect(connectionId: string, matrixToken = "") {
    processes.delete(connectionId);
    await this.startLogin("", connectionId, matrixToken);
  }

  async accountState(mxid: string) {
    return loginHealth(await this.whoami(mxid));
  }
}

class DiscordAdapter implements ConnectionAdapter {
  network: Network = "discord";
  displayName = "Discord";
  experimental = false;
  constructor(private readonly baseUrl: string | undefined) {}
  setupRequired() {
    return false;
  }
  capabilities() {
    return TEXT_CAP;
  }
  private prefix() {
    return `${(this.baseUrl || "").replace(/\/$/, "")}/_matrix/provision`;
  }
  private headers() {
    return { authorization: `Bearer ${process.env.BRIDGE_PROVISIONING_SECRET || ""}`, "content-type": "application/json" };
  }
  private async ping(mxid: string): Promise<{ Discord?: { logged_in?: boolean; connected?: boolean }; username?: string }> {
    if (!this.baseUrl) return {};
    try {
      const res = await fetch(`${this.prefix()}/v1/ping?user_id=${encodeURIComponent(mxid)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      return (await res.json().catch(() => ({}))) as { Discord?: { logged_in?: boolean; connected?: boolean } };
    } catch {
      return {};
    }
  }
  async getStatus() {
    if (!this.baseUrl) return "unavailable" as const;
    try {
      const r = await fetch(`${this.prefix()}/v1/ping?user_id=@discordbot:impro.chat`, { headers: this.headers(), signal: AbortSignal.timeout(2500) });
      if (r.ok || r.status === 401) return "working" as const;
    } catch {
      /* down */
    }
    return "unavailable" as const;
  }
  async accountState(mxid: string) {
    const p = await this.ping(mxid);
    if (p.Discord?.logged_in && p.Discord?.connected) return "connected";
    if (p.Discord?.logged_in) return "connecting";
    return "unknown";
  }
  async startLogin(userId: string, connectionId: string, matrixToken = ""): Promise<LoginStep> {
    if (!this.baseUrl) return { type: "error", message: "Discord isn't running yet." };
    const p = await this.ping(userId);
    if (p.Discord?.logged_in) {
      await this.bridgeGuilds(userId);
      return { type: "complete", message: "Already connected to Discord" };
    }
    const qr = await this.openQr(userId, connectionId, matrixToken);
    if (qr.type === "error") {
      return {
        type: "user_input",
        message: "QR login didn't start. Paste a Discord user token instead (browser → F12 → Network → Authorization).",
        fields: [{ id: "token", label: "Discord token", type: "password" }],
      };
    }
    return qr;
  }
  private openQr(mxid: string, connectionId: string, token: string): Promise<LoginStep> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (step: LoginStep) => {
        if (settled) return;
        settled = true;
        resolve(step);
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const WS = require("ws") as typeof import("ws");
        const url = `${this.prefix().replace(/^http/, "ws")}/v1/login/qr?user_id=${encodeURIComponent(mxid)}`;
        const ws = new WS(url, { headers: this.headers() });
        const proc: Process = {
          loginId: "discord-qr",
          stepId: "qr",
          mxid,
          token,
          network: "discord",
          close: () => {
            try {
              ws.close();
            } catch {
              /* */
            }
          },
        };
        processes.set(connectionId, proc);
        const timer = setTimeout(() => {
          if (!proc.qrData) {
            proc.close?.();
            processes.delete(connectionId);
            done({ type: "error", message: "Discord QR timed out." });
          }
        }, 12000);
        ws.on("message", (buf: Buffer) => {
          let msg: ProvisionStep & { code?: string } = {};
          try {
            msg = JSON.parse(String(buf)) as ProvisionStep & { code?: string };
          } catch {
            return;
          }
          if (msg.code) {
            proc.qrData = msg.code;
            proc.lastStep = {
              type: "qr",
              message: "Scan with the Discord mobile app, then approve the login.",
              qrData: msg.code,
            };
            clearTimeout(timer);
            done(proc.lastStep);
          }
          if (msg.success) {
            proc.discordDone = true;
            proc.discordName = msg.username;
            proc.lastStep = { type: "complete", message: `Connected as ${msg.username || "Discord"}` };
            try {
              ws.close();
            } catch {
              /* */
            }
          }
          if (msg.error || msg.errcode) {
            proc.discordError = msg.error || msg.errcode;
            proc.lastStep = { type: "error", message: msg.error || "Discord login failed." };
          }
        });
        ws.on("error", () => {
          clearTimeout(timer);
          if (!proc.qrData) done({ type: "error", message: "Couldn't open Discord QR login." });
        });
      } catch {
        done({ type: "error", message: "Couldn't open Discord QR login." });
      }
    });
  }
  async getLoginState(connectionId: string, _matrixToken = "", mxid = ""): Promise<LoginStep> {
    const proc = processes.get(connectionId);
    const user = mxid || proc?.mxid || "";
    if (proc?.discordDone) {
      processes.delete(connectionId);
      await this.bridgeGuilds(user);
      return { type: "complete", message: `Connected${proc.discordName ? ` as ${proc.discordName}` : ""}` };
    }
    if (proc?.discordError) return { type: "error", message: proc.discordError };
    if (user) {
      const p = await this.ping(user);
      if (p.Discord?.logged_in) {
        proc?.close?.();
        processes.delete(connectionId);
        await this.bridgeGuilds(user);
        return { type: "complete", message: "Connected to Discord" };
      }
    }
    if (proc?.lastStep) return proc.lastStep;
    return { type: "waiting", message: "Scan the Discord QR with your phone." };
  }
  async submitLoginStep(connectionId: string, payload: Record<string, string>, matrixToken = ""): Promise<LoginStep> {
    const proc = processes.get(connectionId);
    const mxid = proc?.mxid || "";
    const token = payload.token?.trim();
    if (!token) {
      return {
        type: "user_input",
        message: "Paste a Discord user token.",
        fields: [{ id: "token", label: "Discord token", type: "password" }],
      };
    }
    try {
      const res = await fetch(`${this.prefix()}/v1/login/token?user_id=${encodeURIComponent(mxid)}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json().catch(() => ({}))) as ProvisionStep;
      if (json.success || res.ok) {
        processes.delete(connectionId);
        await this.bridgeGuilds(mxid);
        return { type: "complete", message: `Connected${json.username ? ` as ${json.username}` : ""}` };
      }
      return { type: "error", message: json.error || "Discord token was rejected." };
    } catch {
      return { type: "error", message: "Couldn't reach Discord login." };
    }
  }
  async disconnect(_id: string, _t = "", mxid = "") {
    if (!mxid) return;
    await fetch(`${this.prefix()}/v1/logout?user_id=${encodeURIComponent(mxid)}`, { method: "POST", headers: this.headers() }).catch(() => undefined);
  }
  async reconnect(connectionId: string, matrixToken = "") {
    processes.delete(connectionId);
    await this.startLogin("", connectionId, matrixToken);
  }
  private async bridgeGuilds(mxid: string) {
    try {
      const res = await fetch(`${this.prefix()}/v1/guilds?user_id=${encodeURIComponent(mxid)}`, { headers: this.headers(), signal: AbortSignal.timeout(8000) });
      const json = (await res.json().catch(() => ({}))) as { guilds?: { id: string }[] };
      for (const g of (json.guilds || []).slice(0, 20)) {
        await fetch(`${this.prefix()}/v1/guilds/${encodeURIComponent(g.id)}?user_id=${encodeURIComponent(mxid)}`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ auto_create_channels: true }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => undefined);
      }
    } catch {
      /* optional */
    }
  }
}

export function buildAdapters() {
  return {
    mock: new MockAdapter(),
    telegram: new ProvisioningAdapter("telegram", "Telegram", "TELEGRAM_API_ID", process.env.BRIDGE_TELEGRAM_URL),
    whatsapp: new ProvisioningAdapter("whatsapp", "WhatsApp", "", process.env.BRIDGE_WHATSAPP_URL),
    signal: new ProvisioningAdapter("signal", "Signal", "", process.env.BRIDGE_SIGNAL_URL),
    instagram: new ProvisioningAdapter("instagram", "Instagram", "", process.env.BRIDGE_INSTAGRAM_URL, false),
    messenger: new ProvisioningAdapter("messenger", "Messenger", "", process.env.BRIDGE_MESSENGER_URL, false),
    discord: new DiscordAdapter(process.env.BRIDGE_DISCORD_URL),
    matrix: new ProvisioningAdapter("matrix", "Matrix", "", undefined),
  };
}
