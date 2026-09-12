import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Modal } from "../ui/primitives";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ users?: { username: string; displayName: string }[]; conversations?: { id: string; title: string }[]; contacts?: { id: string; displayName: string }[] }>({});
  const nav = useNavigate();

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      api.search(q).then(setRes).catch(() => undefined);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;
  return (
    <Modal title="Search" onClose={onClose}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Conversations, people, messages…"
        className="mb-4 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-sm outline-none"
      />
      <div className="impro-scroll max-h-80 space-y-3 overflow-auto text-sm">
        {res.users?.map((u) => (
          <button
            key={u.username}
            className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/5"
            onClick={() => {
              api.startDm(u.username).then((r: { conversation: { id: string } }) => nav(`/c/${r.conversation.id}`));
              onClose();
            }}
          >
            {u.displayName} <span className="text-mist-600">@{u.username}</span>
          </button>
        ))}
        {res.conversations?.map((c) => (
          <button
            key={c.id}
            className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/5"
            onClick={() => {
              nav(`/c/${c.id}`);
              onClose();
            }}
          >
            {c.title}
          </button>
        ))}
        {res.contacts?.map((c) => (
          <button
            key={c.id}
            className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/5"
            onClick={() => {
              nav(`/contacts/${c.id}`);
              onClose();
            }}
          >
            {c.displayName}
          </button>
        ))}
      </div>
    </Modal>
  );
}
