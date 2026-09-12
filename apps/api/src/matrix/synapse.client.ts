import { Injectable, Logger } from "@nestjs/common";
import { mapMatrixError } from "../common/errors";

type Json = Record<string, unknown>;

@Injectable()
export class SynapseClient {
  private readonly log = new Logger(SynapseClient.name);
  private hs() {
    return (process.env.MATRIX_HOMESERVER_INTERNAL || "http://synapse:8008").replace(/\/$/, "");
  }

  async cs<T = Json>(token: string, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.hs()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T & { errcode?: string; error?: string };
    if (!res.ok) {
      this.log.debug(`CS ${method} ${path} -> ${res.status} ${json.errcode || ""}`);
      throw mapMatrixError({ ...json, status: res.status });
    }
    return json;
  }

  profile(token: string, mxid: string) {
    return this.cs(token, "GET", `/_matrix/client/v3/profile/${encodeURIComponent(mxid)}`);
  }

  setDisplayName(token: string, mxid: string, displayname: string) {
    return this.cs(token, "PUT", `/_matrix/client/v3/profile/${encodeURIComponent(mxid)}/displayname`, {
      displayname,
    });
  }

  searchUsers(token: string, term: string) {
    return this.cs<{ results?: { user_id: string; display_name?: string; avatar_url?: string }[] }>(
      token,
      "POST",
      "/_matrix/client/v3/user_directory/search",
      { search_term: term, limit: 20 },
    );
  }

  createDm(token: string, invite: string[]) {
    return this.cs<{ room_id: string }>(token, "POST", "/_matrix/client/v3/createRoom", {
      preset: "trusted_private_chat",
      is_direct: true,
      invite,
      visibility: "private",
    });
  }

  createRoom(token: string, name: string, invite: string[], isChannel = false) {
    return this.cs<{ room_id: string }>(token, "POST", "/_matrix/client/v3/createRoom", {
      name,
      preset: isChannel ? "private_chat" : "private_chat",
      invite,
      visibility: "private",
    });
  }

  sendText(token: string, roomId: string, body: string, extra: Json = {}) {
    const txn = `i${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    return this.cs<{ event_id: string }>(
      token,
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txn}`,
      { msgtype: "m.text", body, ...extra },
    );
  }

  joinedRooms(token: string, asUser?: string) {
    const q = asUser ? `?user_id=${encodeURIComponent(asUser)}` : "";
    return this.cs<{ joined_rooms: string[] }>(token, "GET", `/_matrix/client/v3/joined_rooms${q}`);
  }

  joinRoom(token: string, roomId: string) {
    return this.cs<{ room_id: string }>(token, "POST", `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {});
  }

  async joinRoomSoft(token: string, roomId: string): Promise<{ ok: boolean; retryMs: number }> {
    const res = await fetch(`${this.hs()}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    });
    if (res.ok) return { ok: true, retryMs: 0 };
    const json = (await res.json().catch(() => ({}))) as { retry_after_ms?: number; errcode?: string };
    const retryMs = json.retry_after_ms || (res.status === 429 ? 2000 : 0);
    return { ok: false, retryMs };
  }

  invite(token: string, roomId: string, userId: string, asUser?: string) {
    const q = asUser ? `?user_id=${encodeURIComponent(asUser)}` : "";
    return this.cs(token, "POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite${q}`, { user_id: userId });
  }

  async invitedRooms(token: string): Promise<{ id: string; name: string; memberIds: string[] }[]> {
    const filter = JSON.stringify({
      presence: { types: [] as string[] },
      account_data: { types: [] as string[] },
      room: {
        ephemeral: { types: [] as string[] },
        account_data: { types: [] as string[] },
        timeline: { limit: 0, types: [] as string[] },
        state: { lazy_load_members: true, types: ["m.room.name", "m.room.member", "m.room.topic"] },
        invite: { types: ["m.room.name", "m.room.member", "m.room.topic"] },
      },
    });
    try {
      const data = await this.cs<{
        rooms?: {
          invite?: Record<
            string,
            { invite_state?: { events?: { type?: string; state_key?: string; content?: { name?: string; membership?: string } }[] } }
          >;
        };
      }>(token, "GET", `/_matrix/client/v3/sync?timeout=0&set_presence=offline&filter=${encodeURIComponent(filter)}`);
      const out: { id: string; name: string; memberIds: string[] }[] = [];
      for (const [id, body] of Object.entries(data.rooms?.invite || {})) {
        let name = "";
        const memberIds: string[] = [];
        for (const ev of body.invite_state?.events || []) {
          if (ev.type === "m.room.name" && ev.content?.name) name = ev.content.name;
          if (ev.type === "m.room.member" && ev.state_key) memberIds.push(ev.state_key);
        }
        out.push({ id, name, memberIds });
      }
      return out;
    } catch {
      return [];
    }
  }

  async invitedRoomIds(token: string): Promise<string[]> {
    return (await this.invitedRooms(token)).map((r) => r.id);
  }

  joinedMembers(token: string, roomId: string) {
    return this.cs<{ joined: Record<string, { display_name?: string; avatar_url?: string }> }>(
      token,
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
    );
  }

  roomName(token: string, roomId: string) {
    return this.cs<{ name?: string }>(
      token,
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`,
    ).catch(() => ({ name: "" }));
  }

  roomMessages(token: string, roomId: string, from?: string, dir: "b" | "f" = "b", limit = 50) {
    const q = new URLSearchParams({ dir, limit: String(limit) });
    if (from) q.set("from", from);
    return this.cs(token, "GET", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${q}`);
  }

  redact(token: string, roomId: string, eventId: string) {
    const txn = `r${Date.now()}`;
    return this.cs(
      token,
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txn}`,
      { reason: "" },
    );
  }

  sendReaction(token: string, roomId: string, eventId: string, key: string) {
    const txn = `e${Date.now()}`;
    return this.cs(
      token,
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${txn}`,
      { "m.relates_to": { rel_type: "m.annotation", event_id: eventId, key } },
    );
  }
}
