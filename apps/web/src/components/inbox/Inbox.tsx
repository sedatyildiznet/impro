import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, Conversation } from "../../lib/api";
import { Avatar } from "../ui/primitives";
import { formatTime, networkMeta } from "../../lib/network";

const FILTERS = ["All", "Unread", "Starred", "Snoozed"] as const;

export function Inbox() {
  const { id } = useParams();
  const [filter, setFilter] = useState<string>("All");
  const q = useQuery({
    queryKey: ["conversations", filter],
    queryFn: () => api.conversations(filter === "All" ? undefined : filter.toLowerCase()),
    refetchInterval: 8000,
  });
  const items = q.data?.conversations || [];

  return (
    <div className="flex h-full">
      <aside className={clsx("flex w-full shrink-0 flex-col border-r border-white/5 md:w-[340px]", id && "hidden md:flex")}>
        <header className="flex items-center justify-between px-4 py-4">
          <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
        </header>
        <div className="flex gap-1 overflow-x-auto px-3 pb-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "rounded-full px-3 py-1 text-xs",
                filter === f ? "bg-white/10 text-white" : "text-mist-500 hover:text-white",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="impro-scroll flex-1 overflow-auto">
          {items.map((c) => (
            <Row key={c.id} c={c} active={c.id === id} />
          ))}
          {!items.length && (
            <p className="px-4 py-8 text-sm text-mist-600">
              No conversations yet. Connect WhatsApp (or another network) in Settings → Connections, keep the linked device on your phone, then wait a few seconds for chats to land here.
            </p>
          )}
        </div>
      </aside>
      <main className={clsx("min-w-0 flex-1", !id && "hidden md:block")}>
        {id ? <Outlet /> : <EmptyChat />}
      </main>
    </div>
  );
}

function Row({ c, active }: { c: Conversation; active: boolean }) {
  const n = networkMeta(c.network);
  return (
    <NavLink
      to={`/c/${c.id}`}
      className={clsx(
        "flex gap-3 px-4 py-3 hover:bg-white/[0.04]",
        active && "bg-white/[0.06]",
      )}
    >
      <Avatar name={c.title} src={c.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{c.title}</span>
          <span className="shrink-0 text-[11px] text-mist-600">{formatTime(c.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={clsx("text-[10px] font-medium uppercase tracking-wide", n.className)}>{n.label}</span>
          <span className="truncate text-xs text-mist-500">{c.preview}</span>
          {c.unread > 0 && (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
              {c.unread}
            </span>
          )}
        </div>
      </div>
    </NavLink>
  );
}

function EmptyChat() {
  return (
    <div className="grid h-full place-items-center text-mist-600">
      <div className="text-center">
        <p className="text-lg font-medium text-mist-300">Select a conversation</p>
        <p className="mt-1 text-sm">Or press ⌘K to find someone.</p>
      </div>
    </div>
  );
}

export function useInboxHotkeys(ids: string[], current?: string) {
  const [list, setList] = useState(ids);
  useEffect(() => setList(ids), [ids]);
  return useMemo(() => ({ list, current }), [list, current]);
}
