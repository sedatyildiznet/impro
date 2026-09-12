import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { SynapseClient } from "../matrix/synapse.client";

type Authed = { impro: { user: { id: string }; matrixToken: string } };

@Controller("search")
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly db: PrismaService, private readonly matrix: SynapseClient) {}

  @Get()
  async search(@Req() req: Authed, @Query("q") q = "", @Query("type") type?: string) {
    const term = q.trim();
    if (!term) return { conversations: [], contacts: [], users: [], messages: [] };
    const userId = req.impro.user.id;
    const memberships = await this.db.workspaceMember.findMany({ where: { userId } });
    const ws = memberships.map((m) => m.workspaceId);

    const conversations = type && type !== "conversations" ? [] : await this.db.conversation.findMany({
      where: {
        AND: [
          { OR: [{ ownerUserId: userId }, { shares: { some: { workspaceId: { in: ws }, revokedAt: null } } }] },
          { OR: [{ title: { contains: term, mode: "insensitive" } }, { lastMessagePreview: { contains: term, mode: "insensitive" } }] },
        ],
      },
      take: 20,
    });
    const contacts = type && type !== "contacts" ? [] : await this.db.contact.findMany({
      where: { ownerUserId: userId, displayName: { contains: term, mode: "insensitive" } },
      include: { identities: true },
      take: 20,
    });
    const users = await this.db.user.findMany({
      where: { OR: [{ username: { contains: term.toLowerCase() } }, { displayName: { contains: term, mode: "insensitive" } }] },
      take: 10,
      select: { id: true, username: true, displayName: true, avatarUrl: true, matrixUserId: true },
    });
    const messages = await this.db.messageIndex.findMany({
      where: {
        body: { contains: term, mode: "insensitive" },
        OR: [{ ownerUserId: userId }, { workspaceId: { in: ws } }],
      },
      take: 30,
      orderBy: { sentAt: "desc" },
    });
    return { conversations, contacts, users, messages };
  }

  @Get("people")
  async people(@Req() req: Authed, @Query("q") q = "") {
    const local = await this.db.user.findMany({
      where: { username: { contains: q.toLowerCase() } },
      take: 10,
      select: { username: true, displayName: true, avatarUrl: true, matrixUserId: true },
    });
    let remote: { user_id: string; display_name?: string }[] = [];
    try {
      const r = await this.matrix.searchUsers(req.impro.matrixToken, q);
      remote = r.results || [];
    } catch {
      remote = [];
    }
    return { users: local, directory: remote };
  }
}
