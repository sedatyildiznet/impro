import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Avatar, Button } from "../ui/primitives";
import { networkMeta } from "../../lib/network";

export function Details({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["conversation", id], queryFn: () => api.conversation(id) });
  const ws = useQuery({ queryKey: ["workspaces"], queryFn: () => api.workspaces() });
  const data = q.data as {
    details?: {
      title: string;
      network: string;
      avatar?: string;
      contact?: { displayName: string; identities: { network: string }[]; company?: { name: string } };
      shares?: { workspaceId: string; revokedAt?: string | null }[];
    };
  };
  const d = data?.details;
  const workspaces = (ws.data as { workspaces?: { id: string; name: string }[] })?.workspaces || [];

  return (
    <div className="impro-scroll h-full overflow-auto p-4 text-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Details</h2>
        <button onClick={onClose} className="text-mist-500">
          Close
        </button>
      </div>
      <div className="flex flex-col items-center text-center">
        <Avatar name={d?.contact?.displayName || d?.title || "Chat"} src={d?.avatar} size={64} />
        <div className="mt-3 text-base font-medium">{d?.contact?.displayName || d?.title}</div>
        <div className={`mt-1 text-[11px] uppercase ${networkMeta(d?.network || "impro").className}`}>
          {networkMeta(d?.network || "impro").label}
        </div>
      </div>
      {d?.contact?.identities?.length ? (
        <section className="mt-6">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-mist-600">Connections</h3>
          <ul className="space-y-1">
            {d.contact.identities.map((i, idx) => (
              <li key={idx} className={networkMeta(i.network).className}>
                {networkMeta(i.network).label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {d?.contact?.company && (
        <section className="mt-6">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-mist-600">Company</h3>
          {d.contact.company.name}
        </section>
      )}
      <section className="mt-6">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-mist-600">Workspace sharing</h3>
        <p className="mb-2 text-mist-500">Private until you share. History stays hidden unless you include it.</p>
        {workspaces.map((w) => (
          <Button
            key={w.id}
            variant="muted"
            className="mb-2 w-full !rounded-xl"
            onClick={async () => {
              await api.share(id, w.id, "from_now");
              qc.invalidateQueries({ queryKey: ["conversation", id] });
            }}
          >
            Share with {w.name}
          </Button>
        ))}
      </section>
    </div>
  );
}
