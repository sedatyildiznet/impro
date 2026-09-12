import { NavLink, Outlet } from "react-router-dom";
import { clsx } from "clsx";
import { useSession } from "../../stores/session";
import { api } from "../../lib/api";
import { Button, Field } from "../ui/primitives";
import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const NAV = [
  { to: "/settings", label: "Profile", end: true },
  { to: "/settings/appearance", label: "Appearance" },
  { to: "/settings/notifications", label: "Notifications" },
  { to: "/settings/connections", label: "Connections" },
  { to: "/settings/privacy", label: "Privacy" },
  { to: "/settings/security", label: "Security" },
  { to: "/settings/workspaces", label: "Workspaces" },
  { to: "/settings/advanced", label: "Advanced" },
];

export function SettingsLayout() {
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-white/5 p-4">
        <h1 className="mb-4 px-2 text-lg font-semibold">Settings</h1>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              clsx("block rounded-lg px-2 py-2 text-sm hover:bg-white/5", isActive && "bg-white/10")
            }
          >
            {n.label}
          </NavLink>
        ))}
      </aside>
      <div className="impro-scroll flex-1 overflow-auto p-8">
        <div className="max-w-xl">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function ProfileSettings() {
  const user = useSession((s) => s.user);
  const clear = useSession((s) => s.clear);
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Profile</h2>
      <p className="text-sm text-mist-500">
        Signed in as <span className="text-white">{user?.username}</span>
      </p>
      <Field label="Display name" defaultValue={user?.displayName} readOnly />
      <Field label="Email" defaultValue={user?.email || ""} readOnly />
      <Button variant="danger" onClick={() => clear().then(() => (window.location.href = "/login"))}>
        Sign out
      </Button>
    </div>
  );
}

export function AppearanceSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Appearance</h2>
      <p className="text-sm text-mist-500">System, dark, or light. Default follows your system, with a dark-first design.</p>
      <div className="flex gap-2">
        {["System", "Dark", "Light"].map((t) => (
          <Button key={t} variant="muted">
            {t}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function PrivacySettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Privacy</h2>
      <p className="text-sm text-mist-500">
        Conversations are private until you share them with a workspace. AI never sees private chats unless you opt in.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          onChange={(e) => api.profile({ aiOptIn: e.target.checked })}
        />
        Allow AI on conversations I choose
      </label>
    </div>
  );
}

export function AdvancedSettings() {
  const user = useSession((s) => s.user);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Advanced</h2>
      <p className="text-sm text-mist-500">
        Impro can talk to other Matrix servers. You don't need this for everyday use.
      </p>
      <Field label="Impro address" readOnly value={user?.username ? `${user.username}` : ""} />
      <p className="text-xs text-mist-600">Other Impro users find you by username. Federation is optional and can be disabled by the operator.</p>
    </div>
  );
}

export function WorkspaceSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["workspaces"], queryFn: () => api.workspaces() });
  const [name, setName] = useState("");
  const workspaces = (q.data as { workspaces?: { id: string; name: string; myRole: string }[] })?.workspaces || [];
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createWorkspace(name.trim());
    setName("");
    qc.invalidateQueries({ queryKey: ["workspaces"] });
  }
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Workspaces</h2>
      <p className="text-sm text-mist-500">Optional. Create one when you want to share a conversation with your team.</p>
      <ul className="space-y-2">
        {workspaces.map((w) => (
          <li key={w.id} className="rounded-xl bg-ink-800 px-3 py-2">
            {w.name} <span className="text-mist-600">· {w.myRole}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="flex gap-2">
        <input className="flex-1 rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Impro Software" />
        <Button type="submit">Create</Button>
      </form>
    </div>
  );
}

export function ConnectionsSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["connections"], queryFn: () => api.connections() });
  const networks = (q.data as { networks?: { network: string; displayName: string; experimental?: boolean; setupRequired?: boolean; bridgeStatus: string; accounts: { id: string; displayName: string; status: string; lastError?: string | null }[] }[] })?.networks || [];
  const [flow, setFlow] = useState<{ id: string; network: string; step: import("../../lib/api").LoginStep } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(network: string) {
    setBusy(network);
    try {
      const out = await api.startConnection(network);
      setFlow({ id: out.connection.id, network, step: out.step });
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (err) {
      setFlow({ id: "", network, step: { type: "error", message: err instanceof Error ? err.message : "Couldn't start that connection." } });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Connections</h2>
      <p className="text-sm text-mist-500">Link the accounts you already use. Impro never asks you to talk to a bridge bot.</p>
      <div className="grid gap-3">
        {networks.map((n) => (
          <div key={n.network} className="rounded-2xl border border-white/10 bg-ink-800 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {n.displayName}{" "}
                  {n.experimental && <span className="text-xs text-amber-400">Experimental</span>}
                </div>
                <div className="text-xs text-mist-500">
                  {n.setupRequired
                    ? "Setup required"
                    : n.accounts.find((a) => a.status === "needs_attention")
                      ? n.accounts.find((a) => a.status === "needs_attention")?.lastError || "Needs attention"
                      : n.accounts.find((a) => a.status === "connected")
                        ? "Connected"
                        : n.accounts[0]?.status || n.bridgeStatus}
                </div>
              </div>
              <Button variant="muted" disabled={busy === n.network || n.bridgeStatus === "unavailable"} onClick={() => connect(n.network)}>
                {busy === n.network ? "Connecting…" : n.bridgeStatus === "unavailable" ? "Unavailable" : "Connect"}
              </Button>
            </div>
            {n.accounts.map((a) => (
              <div key={a.id} className="mt-2 text-xs text-mist-500">
                {a.displayName} · {a.status}
                {a.lastError ? ` — ${a.lastError}` : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
      {flow && (
        <LoginModal
          flow={flow}
          onClose={() => {
            setFlow(null);
            qc.invalidateQueries({ queryKey: ["connections"] });
          }}
          onStep={(step) => setFlow((f) => (f ? { ...f, step } : f))}
        />
      )}
    </div>
  );
}

function LoginModal({
  flow,
  onClose,
  onStep,
}: {
  flow: { id: string; network: string; step: import("../../lib/api").LoginStep };
  onClose: () => void;
  onStep: (step: import("../../lib/api").LoginStep) => void;
}) {
  const qc = useQueryClient();
  const [qrUrl, setQrUrl] = useState<string | null>(flow.step.qrImageUrl || null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    const data = flow.step.qrData;
    if (flow.step.qrImageUrl) {
      setQrUrl(flow.step.qrImageUrl);
      return;
    }
    if (!data) return;
    let cancelled = false;
    import("qrcode").then((QR) =>
      QR.toDataURL(data, { width: 256, margin: 1, color: { dark: "#0b0d10", light: "#ffffff" } }).then((url) => {
        if (!cancelled) setQrUrl(url);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [flow.step.qrData, flow.step.qrImageUrl]);

  useEffect(() => {
    if (!flow.id) return;
    if (flow.step.type === "complete" || flow.step.type === "error") return;
    let stop = false;
    const onStepRef = onStep;
    (async () => {
      while (!stop) {
        try {
          const { step } = await api.connectionLoginState(flow.id);
          if (stop) return;
          onStepRef(step);
          if (step.type === "complete") {
            qc.invalidateQueries({ queryKey: ["conversations"] });
            qc.invalidateQueries({ queryKey: ["connections"] });
            return;
          }
          if (step.type === "error") return;
        } catch {
          if (stop) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
    return () => {
      stop = true;
    };
    // Only bind to this login attempt. Re-creating the effect aborts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ink-800 p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Connect {flow.network}</h3>
          <button className="text-mist-500" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mb-4 text-sm text-mist-500">{flow.step.message}</p>
        {flow.step.type === "qr" && qrUrl && (
          <img src={qrUrl} alt="QR code" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
        )}
        {flow.step.type === "qr" && (
          <p className="mt-3 text-center text-xs text-mist-600">
            {flow.network === "signal"
              ? "Signal → Settings → Linked devices → Link new device"
              : flow.network === "discord"
                ? "Discord mobile app → scan this QR, then approve"
                : "WhatsApp → Linked devices → Link a device. Don't remove the linked device afterwards."}
          </p>
        )}
        {(flow.step.type === "waiting" || flow.step.type === "code") && (
          <p className="text-center text-sm text-mist-300">{flow.step.message || "Waiting for the official app…"}</p>
        )}
        {flow.step.type === "cookies" && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const { step } = await api.connectionLoginStep(flow.id, { ...fields, __kind: "cookies" });
              onStep(step);
            }}
          >
            <p className="text-sm text-mist-300">
              Log in on the official site, then paste cookies (JSON, a curl command, or <code>sessionid=…; csrftoken=…</code>
              ).
              {flow.step.cookieUrl ? (
                <>
                  {" "}
                  <a className="text-accent underline" href={flow.step.cookieUrl} target="_blank" rel="noreferrer">
                    Open login page
                  </a>
                </>
              ) : null}
            </p>
            <textarea
              className="h-28 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-xs"
              placeholder="curl 'https://…' or {&quot;sessionid&quot;:&quot;…&quot;}"
              onChange={(e) => setFields((s) => ({ ...s, raw: e.target.value }))}
            />
            {flow.step.fields?.map((f) => (
              <label key={f.id} className="block text-sm">
                {f.label}
                <input
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2"
                  onChange={(e) => setFields((s) => ({ ...s, [f.id]: e.target.value }))}
                />
              </label>
            ))}
            <Button type="submit">Continue</Button>
          </form>
        )}
        {flow.step.type === "complete" && (
          <p className="text-accent">Connected. Chats will show up in Inbox — keep this device linked on your phone.</p>
        )}
        {flow.step.type === "error" && <p className="text-red-300">{flow.step.message}</p>}
        {flow.step.type === "setup_required" && <p className="text-amber-300">{flow.step.message}</p>}
        {flow.step.type === "user_input" && flow.step.fields && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const { step } = await api.connectionLoginStep(flow.id, fields);
              onStep(step);
            }}
          >
            {flow.step.fields.map((f) => (
              <label key={f.id} className="block text-sm">
                {f.label}
                <input
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2"
                  type={f.type === "password" ? "password" : "text"}
                  onChange={(e) => setFields((s) => ({ ...s, [f.id]: e.target.value }))}
                />
              </label>
            ))}
            <Button type="submit">Continue</Button>
          </form>
        )}
      </div>
    </div>
  );
}
