import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { SynapseClient } from "../matrix/synapse.client";
import { PolicyService } from "../policy/policy.service";
import { ImproError } from "../common/errors";
import { toMatrixUserId } from "@impro/shared";
import { ingestInbox, joinPendingInvites } from "./sync";

type Authed = { impro: { user: { id: string; username: string; matrixUserId: string }; matrixToken: string } };

@Controller()
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(
    private readonly db: PrismaService,
    private readonly matrix: SynapseClient,
    private readonly policy: PolicyService,
  ) {}

  @Get("conversations")
  async list(@Req() req: Authed, @Query("filter") filter?: string, @Query("workspaceId") workspaceId?: string) {
    const userId = req.impro.user.id;
    const prior = await this.db.conversation.count({ where: { ownerUserId: userId } });
    const ingest = ingestInbox(this.db, this.matrix, userId, req.impro.user.matrixUserId, req.impro.matrixToken, { force: prior < 3 });
    if (prior < 3) {
      await Promise.race([ingest, new Promise((r) => setTimeout(r, 6000))]).catch(() => undefined);
    } else {
      void ingest.catch(() => undefined);
    }
    void joinPendingInvites(this.matrix, req.impro.matrixToken, req.impro.user.matrixUserId);
    const memberships = await this.db.workspaceMember.findMany({ where: { userId } });
    const wsIds = memberships.map((m) => m.workspaceId);
    const now = new Date();
    const snoozed = await this.db.snooze.findMany({ where: { userId, until: { gt: now } } });
    const snoozeIds = new Set(snoozed.map((s) => s.conversationId));

    const owned = await this.db.conversation.findMany({
      where: { ownerUserId: userId, archived: filter === "archived" ? true : false },
      include: { contact: true, assignment: { include: { assignee: true } }, shares: true, tags: { include: { tag: true } } },
      orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
      take: 500,
    });
    const shared = workspaceId
      ? await this.db.conversationShare.findMany({
          where: { workspaceId, revokedAt: null, conversation: { ownerUserId: { not: userId } } },
          include: {
            conversation: {
              include: { contact: true, assignment: { include: { assignee: true } }, shares: true, tags: { include: { tag: true } } },
            },
          },
        })
      : [];

    let items = [
      ...owned.map((c) => ({ ...c, shared: c.shares.some((s) => !s.revokedAt) })),
      ...shared.map((s) => ({ ...s.conversation, shared: true, shareMeta: s })),
    ];
    if (filter === "unread") items = items.filter((c) => c.unreadCount > 0);
    if (filter === "starred") items = items.filter((c) => c.starred);
    if (filter === "snoozed") items = items.filter((c) => snoozeIds.has(c.id));
    else items = items.filter((c) => !snoozeIds.has(c.id));
    if (filter === "unassigned") items = items.filter((c) => c.assignment?.state === "unassigned" || !c.assignment);
    if (filter === "mine") items = items.filter((c) => c.assignment?.assigneeId === userId);
    if (filter === "shared") items = items.filter((c) => "shared" in c && c.shared);
    return {
      conversations: items.map((c) => this.serialize(c)),
      workspaceIds: wsIds,
    };
  }

  @Get("conversations/:id")
  async get(@Req() req: Authed, @Param("id") id: string) {
    const { conv } = await this.policy.canViewConversation(req.impro.user.id, id);
    const full = await this.db.conversation.findUniqueOrThrow({
      where: { id: conv.id },
      include: {
        contact: { include: { identities: true, company: true } },
        assignment: { include: { assignee: true } },
        shares: true,
        tags: { include: { tag: true } },
        notes: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 50 },
        participants: true,
      },
    });
    return { conversation: this.serialize(full), details: full };
  }

  @Get("conversations/:id/messages")
  async messages(@Req() req: Authed, @Param("id") id: string, @Query("from") from?: string) {
    const { conv, share } = await this.policy.canViewConversation(req.impro.user.id, id);
    if (!conv.matrixRoomId) return { chunk: [], start: null, end: null };
    let page: unknown;
    try {
      page = await this.matrix.roomMessages(req.impro.matrixToken, conv.matrixRoomId, from);
    } catch {
      await this.matrix.joinRoomSoft(req.impro.matrixToken, conv.matrixRoomId);
      page = await this.matrix.roomMessages(req.impro.matrixToken, conv.matrixRoomId, from);
    }
    if (share?.historyPolicy === "from_now" && share.historyStartAt) {
      const start = share.historyStartAt.getTime();
      const chunk = Array.isArray((page as { chunk?: { origin_server_ts?: number }[] }).chunk)
        ? (page as { chunk: { origin_server_ts?: number }[] }).chunk.filter((e) => (e.origin_server_ts || 0) >= start)
        : [];
      return { ...(page as object), chunk };
    }
    return page;
  }

  @Post("conversations/:id/messages")
  async send(
    @Req() req: Authed,
    @Param("id") id: string,
    @Body() body: { body?: string; msgtype?: string; extra?: Record<string, unknown> },
  ) {
    const { conv } = await this.policy.canReplyConversation(req.impro.user.id, id);
    if (!body.body?.trim()) throw new ImproError("Message cannot be empty.", 400, "empty");
    if (!conv.matrixRoomId) throw new ImproError("This conversation isn't ready yet.", 409, "no_room");
    const token = await this.delegatedToken(req, conv.ownerUserId);
    await this.matrix.joinRoomSoft(token, conv.matrixRoomId).catch(() => undefined);
    const sent = await this.matrix.sendText(token, conv.matrixRoomId, body.body.trim(), body.extra || {});
    await this.db.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date(), lastMessagePreview: body.body.trim().slice(0, 180) },
    });
    if (req.impro.user.id !== conv.ownerUserId) {
      await this.db.auditLog.create({
        data: {
          actorId: req.impro.user.id,
          action: "conversation.reply_delegated",
          targetType: "conversation",
          targetId: conv.id,
          metadata: { network: conv.network, via: conv.ownerUserId },
        },
      });
    }
    await this.db.messageIndex.create({
      data: {
        conversationId: conv.id,
        ownerUserId: conv.ownerUserId,
        matrixEventId: sent.event_id,
        sender: req.impro.user.matrixUserId,
        body: body.body.trim(),
        sentAt: new Date(),
        network: conv.network,
      },
    }).catch(() => undefined);
    return { eventId: sent.event_id };
  }

  @Post("conversations")
  async startDm(@Req() req: Authed, @Body() body: { username?: string; matrixUserId?: string }) {
    const targetMxid = body.matrixUserId || (body.username ? toMatrixUserId(body.username) : null);
    if (!targetMxid) throw new ImproError("Choose someone to message.", 400, "missing_user");
    const room = await this.matrix.createDm(req.impro.matrixToken, [targetMxid]);
    const other = await this.db.user.findUnique({ where: { matrixUserId: targetMxid } });
    const conv = await this.db.conversation.create({
      data: {
        ownerUserId: req.impro.user.id,
        matrixRoomId: room.room_id,
        network: targetMxid.endsWith(":impro.chat") ? "impro" : "matrix",
        title: other?.displayName || body.username || targetMxid,
        type: "dm",
        lastMessageAt: new Date(),
        participants: {
          create: [
            { userId: req.impro.user.id, matrixUserId: req.impro.user.matrixUserId, displayName: req.impro.user.username },
            { userId: other?.id, matrixUserId: targetMxid, displayName: other?.displayName || body.username },
          ],
        },
      },
    });
    return { conversation: this.serialize(conv) };
  }

  @Post("conversations/:id/share")
  async share(
    @Req() req: Authed,
    @Param("id") id: string,
    @Body() body: { workspaceId: string; historyPolicy?: "from_now" | "last_24h" | "last_7d" | "entire"; canReply?: boolean },
  ) {
    const conv = await this.policy.canShareConversation(req.impro.user.id, id);
    const member = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: body.workspaceId, userId: req.impro.user.id } },
    });
    if (!member) throw new ImproError("You're not in that workspace.", 403, "workspace");
    const policy = body.historyPolicy || "from_now";
    const now = new Date();
    const historyStartAt =
      policy === "from_now"
        ? now
        : policy === "last_24h"
          ? new Date(now.getTime() - 86400_000)
          : policy === "last_7d"
            ? new Date(now.getTime() - 7 * 86400_000)
            : null;
    const share = await this.db.conversationShare.upsert({
      where: { id: (await this.db.conversationShare.findFirst({ where: { conversationId: conv.id, workspaceId: body.workspaceId } }))?.id || "00000000-0000-0000-0000-000000000000" },
      update: { revokedAt: null, historyPolicy: policy, historyStartAt, canReply: body.canReply !== false, sharedBy: req.impro.user.id, sharedAt: now },
      create: {
        conversationId: conv.id,
        workspaceId: body.workspaceId,
        sharedBy: req.impro.user.id,
        historyPolicy: policy,
        historyStartAt,
        canReply: body.canReply !== false,
      },
    });
    await this.db.auditLog.create({
      data: {
        actorId: req.impro.user.id,
        workspaceId: body.workspaceId,
        action: "conversation.shared",
        targetType: "conversation",
        targetId: conv.id,
        metadata: { historyPolicy: policy },
      },
    });
    return { share };
  }

  @Delete("conversations/:id/share/:workspaceId")
  async unshare(@Req() req: Authed, @Param("id") id: string, @Param("workspaceId") workspaceId: string) {
    await this.policy.canShareConversation(req.impro.user.id, id);
    await this.db.conversationShare.updateMany({
      where: { conversationId: id, workspaceId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  @Post("conversations/:id/assign")
  async assign(@Req() req: Authed, @Param("id") id: string, @Body() body: { assigneeId?: string | null }) {
    const { conv } = await this.policy.canViewConversation(req.impro.user.id, id);
    const assignment = await this.db.assignment.upsert({
      where: { conversationId: conv.id },
      update: {
        assigneeId: body.assigneeId || null,
        assignedById: req.impro.user.id,
        state: body.assigneeId ? "assigned" : "unassigned",
      },
      create: {
        conversationId: conv.id,
        assigneeId: body.assigneeId || null,
        assignedById: req.impro.user.id,
        state: body.assigneeId ? "assigned" : "unassigned",
      },
    });
    await this.db.auditLog.create({
      data: {
        actorId: req.impro.user.id,
        action: body.assigneeId ? "conversation.assigned" : "conversation.unassigned",
        targetType: "conversation",
        targetId: conv.id,
        metadata: { assigneeId: body.assigneeId },
      },
    });
    return { assignment };
  }

  @Post("conversations/:id/notes")
  async note(@Req() req: Authed, @Param("id") id: string, @Body() body: { body: string }) {
    const { conv } = await this.policy.canViewConversation(req.impro.user.id, id);
    if (!body.body?.trim()) throw new ImproError("Note cannot be empty.", 400, "empty");
    const note = await this.db.internalNote.create({
      data: { conversationId: conv.id, authorId: req.impro.user.id, body: body.body.trim() },
      include: { author: true },
    });
    return { note };
  }

  @Post("conversations/:id/tags")
  async tag(@Req() req: Authed, @Param("id") id: string, @Body() body: { tagId: string }) {
    const { conv } = await this.policy.canViewConversation(req.impro.user.id, id);
    await this.db.conversationTag.upsert({
      where: { conversationId_tagId: { conversationId: conv.id, tagId: body.tagId } },
      update: {},
      create: { conversationId: conv.id, tagId: body.tagId },
    });
    return { ok: true };
  }

  @Post("conversations/:id/snooze")
  async snooze(@Req() req: Authed, @Param("id") id: string, @Body() body: { until: string }) {
    await this.policy.canViewConversation(req.impro.user.id, id);
    const until = new Date(body.until);
    const row = await this.db.snooze.create({
      data: { conversationId: id, userId: req.impro.user.id, until },
    });
    return { snooze: row };
  }

  @Post("conversations/:id/read")
  async read(@Req() req: Authed, @Param("id") id: string, @Body() body: { unread?: boolean }) {
    const { conv } = await this.policy.canViewConversation(req.impro.user.id, id);
    await this.db.conversation.update({
      where: { id: conv.id },
      data: { unreadCount: body.unread ? 1 : 0 },
    });
    return { ok: true };
  }

  @Post("conversations/:id/pin")
  async pin(@Req() req: Authed, @Param("id") id: string, @Body() body: { pinned?: boolean; starred?: boolean; archived?: boolean }) {
    const { conv } = await this.policy.canViewConversation(req.impro.user.id, id);
    await this.db.conversation.update({
      where: { id: conv.id },
      data: {
        ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
        ...(body.starred !== undefined ? { starred: body.starred } : {}),
        ...(body.archived !== undefined ? { archived: body.archived } : {}),
      },
    });
    return { ok: true };
  }

  @Post("conversations/:id/status")
  async status(@Req() req: Authed, @Param("id") id: string, @Body() body: { status: "open" | "pending" | "resolved" }) {
    const { share } = await this.policy.canViewConversation(req.impro.user.id, id);
    if (!share) throw new ImproError("Status is only available on shared conversations.", 400, "not_shared");
    await this.db.conversationShare.update({ where: { id: share.id }, data: { status: body.status } });
    return { ok: true };
  }

  private async delegatedToken(req: Authed, ownerUserId: string) {
    if (req.impro.user.id === ownerUserId) return req.impro.matrixToken;
    const session = await this.db.session.findFirst({
      where: { userId: ownerUserId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!session) throw new ImproError("The account owner needs to be signed in to send from this connection.", 409, "owner_offline");
    const { decryptSecret } = await import("../common/crypto");
    return decryptSecret(session.matrixAccessEnc);
  }

  private serialize(c: {
    id: string;
    title: string;
    network: string;
    avatar?: string | null;
    lastMessagePreview?: string | null;
    lastMessageAt?: Date | null;
    unreadCount: number;
    pinned: boolean;
    starred?: boolean;
    type?: string;
    contact?: { displayName: string } | null;
    assignment?: { assignee?: { displayName: string; username: string } | null } | null;
  }) {
    return {
      id: c.id,
      title: c.contact?.displayName || c.title,
      network: c.network,
      avatar: c.avatar,
      preview: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
      unread: c.unreadCount,
      pinned: c.pinned,
      starred: c.starred || false,
      type: c.type,
      assignee: c.assignment?.assignee
        ? { displayName: c.assignment.assignee.displayName, username: c.assignment.assignee.username }
        : null,
    };
  }
}
