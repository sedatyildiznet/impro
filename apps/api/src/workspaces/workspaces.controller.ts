import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ImproError } from "../common/errors";
import { randomToken } from "../common/crypto";
import { toMatrixUserId } from "@impro/shared";
import { SynapseClient } from "../matrix/synapse.client";

type Authed = { impro: { user: { id: string; username: string; matrixUserId: string }; matrixToken: string } };

@Controller("workspaces")
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly db: PrismaService, private readonly matrix: SynapseClient) {}

  @Get()
  async list(@Req() req: Authed) {
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId: req.impro.user.id },
      include: { workspace: { include: { members: { include: { user: true } } } } },
    });
    return { workspaces: memberships.map((m) => ({ ...m.workspace, myRole: m.role })) };
  }

  @Post()
  async create(@Req() req: Authed, @Body() body: { name: string }) {
    const slug = (body.name || "workspace")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
    const ws = await this.db.workspace.create({
      data: {
        name: body.name,
        slug,
        ownerUserId: req.impro.user.id,
        members: { create: { userId: req.impro.user.id, role: "owner" } },
      },
    });
    return { workspace: ws };
  }

  @Post(":id/invites")
  async invite(@Req() req: Authed, @Param("id") id: string, @Body() body: { username?: string; email?: string; role?: "admin" | "manager" | "agent" | "member" }) {
    const member = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.impro.user.id } },
    });
    if (!member || !["owner", "admin"].includes(member.role)) throw new ImproError("You can't invite people here.", 403, "workspace");
    let userId: string | null = null;
    if (body.username) {
      const u = await this.db.user.findUnique({ where: { username: body.username.toLowerCase() } });
      if (u) {
        await this.db.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: id, userId: u.id } },
          update: { role: body.role || "agent" },
          create: { workspaceId: id, userId: u.id, role: body.role || "agent" },
        });
        userId = u.id;
      }
    }
    const invite = await this.db.workspaceInvite.create({
      data: {
        workspaceId: id,
        email: body.email,
        username: body.username,
        role: body.role || "agent",
        token: randomToken(16),
        expiresAt: new Date(Date.now() + 14 * 86400_000),
        acceptedAt: userId ? new Date() : null,
      },
    });
    return { invite, joined: Boolean(userId) };
  }

  @Post(":id/channels")
  async channel(@Req() req: Authed, @Param("id") id: string, @Body() body: { name: string }) {
    const member = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.impro.user.id } },
    });
    if (!member) throw new ImproError("You're not in this workspace.", 403, "workspace");
    const members = await this.db.workspaceMember.findMany({ where: { workspaceId: id }, include: { user: true } });
    const invite = members.filter((m) => m.userId !== req.impro.user.id).map((m) => m.user.matrixUserId);
    const room = await this.matrix.createRoom(req.impro.matrixToken, body.name, invite, true);
    const conv = await this.db.conversation.create({
      data: {
        ownerUserId: req.impro.user.id,
        matrixRoomId: room.room_id,
        network: "impro",
        title: body.name.startsWith("#") ? body.name : `#${body.name}`,
        type: "channel",
        workspaceChannelId: id,
      },
    });
    return { conversation: conv };
  }

  @Get(":id/tags")
  async tags(@Param("id") id: string) {
    return { tags: await this.db.tag.findMany({ where: { workspaceId: id } }) };
  }

  @Post(":id/tags")
  async addTag(@Req() req: Authed, @Param("id") id: string, @Body() body: { name: string; color?: string }) {
    const tag = await this.db.tag.create({
      data: { workspaceId: id, name: body.name, color: body.color || "#5eead4" },
    });
    return { tag };
  }

  @Get(":id/saved-replies")
  async replies(@Param("id") id: string) {
    return { replies: await this.db.savedReply.findMany({ where: { workspaceId: id } }) };
  }

  @Post(":id/saved-replies")
  async addReply(@Param("id") id: string, @Body() body: { slash: string; title: string; body: string }) {
    const row = await this.db.savedReply.create({
      data: { workspaceId: id, slash: body.slash.replace(/^\//, ""), title: body.title, body: body.body },
    });
    return { reply: row };
  }

  @Get(":id/audit")
  async audit(@Req() req: Authed, @Param("id") id: string) {
    const member = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.impro.user.id } },
    });
    if (!member) throw new ImproError("You're not in this workspace.", 403, "workspace");
    const events = await this.db.auditLog.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "desc" }, take: 100, include: { actor: true } });
    return { events };
  }
}
