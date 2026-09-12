import { PrismaService } from "../prisma/prisma.service";
import { SynapseClient } from "../matrix/synapse.client";

const BOTS: { prefix: string; network: string }[] = [
  { prefix: "@whatsapp", network: "whatsapp" },
  { prefix: "@signal", network: "signal" },
  { prefix: "@telegram", network: "telegram" },
  { prefix: "@instagram", network: "instagram" },
  { prefix: "@discord", network: "discord" },
  { prefix: "@facebook", network: "messenger" },
  { prefix: "@messenger", network: "messenger" },
];

const lastIngest = new Map<string, number>();
const joining = new Set<string>();
const puppeted = new Set<string>();

function networkFromMembers(ids: string[]): string {
  for (const { prefix, network } of BOTS) {
    if (ids.some((id) => id.startsWith(prefix))) return network;
  }
  return "impro";
}

export function isManagement(name: string, memberIds: string[]) {
  const n = (name || "").toLowerCase().trim();
  if (!n) return false;
  if (n.includes("management") || n.includes("bridge bot") || n.includes("bridge management")) return true;
  if (/^(whatsapp|signal|telegram|instagram|discord|messenger|facebook)(\s|\(|\+|$).*/i.test(n)) {
    if (memberIds.some((id) => /bot:/.test(id)) || memberIds.length <= 3) return true;
  }
  return false;
}

async function upsertRoom(
  db: PrismaService,
  ownerUserId: string,
  roomId: string,
  title: string,
  network: string,
  connectionId: string | null,
  preview?: string | null,
  lastAt?: Date | null,
) {
  const existing = await db.conversation.findFirst({ where: { ownerUserId, matrixRoomId: roomId } });
  if (existing) {
    const patch: { title?: string; lastMessagePreview?: string | null; lastMessageAt?: Date; connectionId?: string | null; network?: string } = {};
    if (title && title !== existing.title && !title.startsWith("@")) patch.title = title;
    if (preview) patch.lastMessagePreview = preview;
    if (lastAt) patch.lastMessageAt = lastAt;
    if (connectionId && !existing.connectionId) patch.connectionId = connectionId;
    if (network && existing.network === "impro" && network !== "impro") patch.network = network;
    if (Object.keys(patch).length) await db.conversation.update({ where: { id: existing.id }, data: patch });
    return;
  }
  await db.conversation.create({
    data: {
      ownerUserId,
      matrixRoomId: roomId,
      connectionId,
      network,
      title: title || "Chat",
      type: network === "impro" ? "dm" : "bridged",
      lastMessagePreview: preview || null,
      lastMessageAt: lastAt || new Date(),
    },
  });
}

export async function ingestInbox(
  db: PrismaService,
  matrix: SynapseClient,
  ownerUserId: string,
  mxid: string,
  token: string,
  opts: { force?: boolean } = {},
) {
  const now = Date.now();
  const prev = lastIngest.get(ownerUserId) || 0;
  if (!opts.force && now - prev < 8_000) return;
  lastIngest.set(ownerUserId, now);

  await db.conversation.deleteMany({
    where: {
      ownerUserId,
      OR: [
        { title: { in: ["WhatsApp", "Signal", "Telegram", "Instagram", "Discord", "Messenger", "Facebook"] } },
        { title: { startsWith: "WhatsApp (" } },
        { title: { startsWith: "Signal (" } },
      ],
    },
  });

  const connections = await db.connection.findMany({ where: { ownerUserId, status: { in: ["connected", "syncing", "connecting"] } } });
  const connByNetwork = new Map(connections.map((c) => [c.network, c.id]));

  const invites = await matrix.invitedRooms(token).catch(() => [] as { id: string; name: string; memberIds: string[] }[]);
  for (const inv of invites) {
    if (isManagement(inv.name, inv.memberIds)) continue;
    const network = networkFromMembers(inv.memberIds);
    const title = inv.name || "Chat";
    await upsertRoom(db, ownerUserId, inv.id, title, network, connByNetwork.get(network) || null);
  }

  let joined: string[] = [];
  try {
    joined = (await matrix.joinedRooms(token)).joined_rooms || [];
  } catch {
    joined = [];
  }

  const existing = await db.conversation.findMany({ where: { ownerUserId }, select: { matrixRoomId: true } });
  const have = new Set(existing.map((c) => c.matrixRoomId).filter(Boolean) as string[]);
  const missingJoined = joined.filter((id) => !have.has(id)).slice(0, 200);
  for (const roomId of missingJoined) {
    try {
      const [nameRes, membersRes] = await Promise.all([matrix.roomName(token, roomId), matrix.joinedMembers(token, roomId)]);
      const memberIds = Object.keys(membersRes.joined || {});
      const title =
        nameRes.name ||
        memberIds
          .filter((id) => id !== mxid && !id.includes("bot:"))
          .map((id) => membersRes.joined[id]?.display_name || id.split(":")[0].slice(1))
          .join(", ") ||
        "Chat";
      if (isManagement(title, memberIds)) continue;
      const network = networkFromMembers(memberIds);
      await upsertRoom(db, ownerUserId, roomId, title, network, connByNetwork.get(network) || null);
    } catch {
      /* skip */
    }
  }

  await enableBridgePuppet(matrix, token, mxid).catch(() => undefined);
}

export async function joinPendingInvites(matrix: SynapseClient, token: string, mxid: string) {
  if (joining.has(mxid)) return;
  joining.add(mxid);
  try {
    const invites = await matrix.invitedRoomIds(token);
    for (const roomId of invites.slice(0, 200)) {
      const res = await matrix.joinRoomSoft(token, roomId);
      if (!res.ok && res.retryMs) {
        await new Promise((r) => setTimeout(r, Math.min(res.retryMs, 8000)));
        await matrix.joinRoomSoft(token, roomId);
      } else if (res.ok) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }
  } finally {
    joining.delete(mxid);
  }
}

export async function enableBridgePuppet(matrix: SynapseClient, token: string, mxid: string) {
  const rooms = (await matrix.joinedRooms(token).catch(() => ({ joined_rooms: [] as string[] }))).joined_rooms || [];
  for (const roomId of rooms.slice(0, 30)) {
    const key = `${mxid}:${roomId}`;
    if (puppeted.has(key)) continue;
    try {
      const [nameRes, membersRes] = await Promise.all([matrix.roomName(token, roomId), matrix.joinedMembers(token, roomId)]);
      const memberIds = Object.keys(membersRes.joined || {});
      const title = nameRes.name || "";
      if (!isManagement(title, memberIds)) continue;
      await matrix.sendText(token, roomId, `login-matrix ${token}`);
      await matrix.sendText(token, roomId, "sync");
      puppeted.add(key);
    } catch {
      /* next */
    }
  }
}

/** @deprecated use ingestInbox + joinPendingInvites */
export async function syncJoinedRooms(
  db: PrismaService,
  matrix: SynapseClient,
  ownerUserId: string,
  mxid: string,
  token: string,
  opts: { force?: boolean } = {},
) {
  await ingestInbox(db, matrix, ownerUserId, mxid, token, opts);
  void joinPendingInvites(matrix, token, mxid);
}
