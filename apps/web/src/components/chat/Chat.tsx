import { FormEvent, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Paperclip, Send } from "lucide-react";
import { api } from "../../lib/api";
import { Avatar, Button } from "../ui/primitives";
import { networkMeta } from "../../lib/network";
import { Details } from "./Details";

type MatrixEvent = {
  event_id?: string;
  type?: string;
  sender?: string;
  origin_server_ts?: number;
  content?: { body?: string; msgtype?: string; "m.relates_to"?: { event_id?: string } };
};

export function Chat() {
  const { id } = useParams();
  const [details, setDetails] = useState(false);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const qc = useQueryClient();
  const conv = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.conversation(id!),
    enabled: Boolean(id),
  });
  const msgs = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.messages(id!),
    enabled: Boolean(id),
    refetchInterval: 4000,
  });
  const send = useMutation({
    mutationFn: (body: string) => (mode === "note" ? api.note(id!, body) : api.send(id!, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const input = useRef<HTMLTextAreaElement>(null);
  const data = conv.data as { conversation?: { title: string; network: string; avatar?: string }; details?: { notes?: { id: string; body: string; author: { displayName: string } }[] } };
  const chunk: MatrixEvent[] = useMemo(() => {
    const raw = (msgs.data as { chunk?: MatrixEvent[] })?.chunk || [];
    return [...raw].reverse().filter((e) => e.type === "m.room.message" && e.content?.body);
  }, [msgs.data]);
  const n = networkMeta(data?.conversation?.network || "impro");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = input.current?.value.trim();
    if (!v) return;
    send.mutate(v);
    if (input.current) input.current.value = "";
  }

  if (!id) return null;
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <Avatar name={data?.conversation?.title || "Chat"} src={data?.conversation?.avatar} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{data?.conversation?.title || "Conversation"}</div>
            <div className={`text-[11px] uppercase tracking-wide ${n.className}`}>{n.label}</div>
          </div>
          <button className="rounded-lg p-2 text-mist-500 hover:bg-white/5 hover:text-white" onClick={() => setDetails((v) => !v)} aria-label="Details">
            <Info size={18} />
          </button>
        </header>
        <div className="impro-scroll flex-1 space-y-3 overflow-auto px-4 py-4">
          {mode === "note" &&
            data?.details?.notes?.map((note) => (
              <div key={note.id} className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                <div className="text-[11px] uppercase text-amber-400">Internal note · {note.author.displayName}</div>
                {note.body}
              </div>
            ))}
          {chunk.map((e) => (
            <div key={e.event_id} className="max-w-[min(640px,85%)]">
              <div className="text-[11px] text-mist-600">{e.sender?.replace(/^@/, "").split(":")[0]}</div>
              <div className="mt-1 rounded-2xl bg-ink-700 px-3 py-2 text-sm leading-relaxed">{e.content?.body}</div>
            </div>
          ))}
        </div>
        <form onSubmit={onSubmit} className="border-t border-white/5 p-3">
          <div className="mb-2 flex gap-2 text-xs">
            <button type="button" className={mode === "reply" ? "text-accent" : "text-mist-600"} onClick={() => setMode("reply")}>
              Reply
            </button>
            <button type="button" className={mode === "note" ? "text-amber-400" : "text-mist-600"} onClick={() => setMode("note")}>
              Note
            </button>
          </div>
          <div className="flex items-end gap-2 rounded-2xl bg-ink-800 px-3 py-2">
            <button type="button" className="pb-1 text-mist-500" aria-label="Attachment">
              <Paperclip size={16} />
            </button>
            <textarea
              ref={input}
              rows={1}
              placeholder={mode === "note" ? "Internal note — never sent to the other person" : "Message"}
              className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
            />
            <Button type="submit" className="!px-3 !py-1.5" disabled={send.isPending} aria-label="Send">
              <Send size={14} />
            </Button>
          </div>
        </form>
      </div>
      {details && (
        <div className="hidden w-[320px] shrink-0 border-l border-white/5 lg:block">
          <Details id={id} onClose={() => setDetails(false)} />
        </div>
      )}
    </div>
  );
}
