import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Contact } from "../../lib/api";
import { Avatar, Button } from "../ui/primitives";
import { networkMeta } from "../../lib/network";
import { useState } from "react";

export function ContactsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contacts"], queryFn: () => api.contacts() });
  const contacts = q.data?.contacts || [];
  const [sel, setSel] = useState<string[]>([]);

  async function merge() {
    if (sel.length !== 2) return;
    await api.merge(sel[0], sel[1]);
    setSel([]);
    qc.invalidateQueries({ queryKey: ["contacts"] });
  }

  return (
    <div className="impro-scroll h-full overflow-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-mist-500">People, not platforms. Merge when two accounts are the same person.</p>
        </div>
        <Button disabled={sel.length !== 2} onClick={merge}>
          Merge selected
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {contacts.map((c) => (
          <ContactCard key={c.id} c={c} selected={sel.includes(c.id)} onToggle={() => setSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id].slice(-2)))} />
        ))}
      </div>
    </div>
  );
}

function ContactCard({ c, selected, onToggle }: { c: Contact; selected: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex gap-3 rounded-2xl border p-4 text-left ${selected ? "border-accent bg-accent/5" : "border-white/10 bg-ink-800"}`}
    >
      <Avatar name={c.displayName} />
      <div>
        <div className="font-medium">{c.displayName}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase">
          {c.identities?.map((i) => (
            <span key={i.id} className={networkMeta(i.network).className}>
              {networkMeta(i.network).label}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
