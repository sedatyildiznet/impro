import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ImproError } from "../common/errors";

@Injectable()
export class PolicyService {
  constructor(private readonly db: PrismaService) {}

  async canViewConversation(userId: string, conversationId: string) {
    const conv = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: { shares: { where: { revokedAt: null } } },
    });
    if (!conv) throw new ImproError("Couldn't open this conversation.", 404, "not_found");
    if (conv.ownerUserId === userId) return { conv, share: null as (typeof conv.shares)[0] | null };
    const memberships = await this.db.workspaceMember.findMany({ where: { userId } });
    const ws = new Set(memberships.map((m) => m.workspaceId));
    const share = conv.shares.find((s) => ws.has(s.workspaceId));
    if (!share) throw new ImproError("You don't have access to this conversation.", 403, "private");
    return { conv, share };
  }

  async canReplyConversation(userId: string, conversationId: string) {
    const { conv, share } = await this.canViewConversation(userId, conversationId);
    if (conv.ownerUserId === userId) return { conv, share, canReply: true };
    if (!share?.canReply) throw new ImproError("You can view this conversation but not reply.", 403, "no_reply");
    return { conv, share, canReply: true };
  }

  async canShareConversation(userId: string, conversationId: string) {
    const conv = await this.db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new ImproError("Couldn't open this conversation.", 404, "not_found");
    if (conv.ownerUserId !== userId) throw new ImproError("Only the owner can share this conversation.", 403, "owner_only");
    return conv;
  }

  async canManageWorkspace(userId: string, workspaceId: string) {
    const m = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!m || !["owner", "admin"].includes(m.role)) {
      throw new ImproError("You can't manage this workspace.", 403, "workspace");
    }
    return m;
  }
}
