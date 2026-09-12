import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ImproError } from "../common/errors";
import { buildAdapters } from "../bridges/adapters";

type Authed = { impro: { user: { id: string; isGlobalAdmin: boolean } } };

@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly db: PrismaService) {}

  private assertAdmin(req: Authed) {
    if (!req.impro.user.isGlobalAdmin) throw new ImproError("Admin only.", 403, "admin");
  }

  @Get("overview")
  async overview(@Req() req: Authed) {
    this.assertAdmin(req);
    const [users, workspaces, connections] = await Promise.all([
      this.db.user.count(),
      this.db.workspace.count(),
      this.db.connection.groupBy({ by: ["network", "status"], _count: true }),
    ]);
    const adapters = buildAdapters();
    const bridges: Record<string, string> = {};
    for (const [k, ad] of Object.entries(adapters)) {
      bridges[k] = await ad.getStatus();
    }
    return { users, workspaces, connections, bridges };
  }

  @Get("users")
  async users(@Req() req: Authed) {
    this.assertAdmin(req);
    return { users: await this.db.user.findMany({ orderBy: { createdAt: "desc" }, take: 200 }) };
  }

  @Post("users/:id/suspend")
  async suspend(@Req() req: Authed, @Param("id") id: string) {
    this.assertAdmin(req);
    await this.db.user.update({ where: { id }, data: { isSuspended: true } });
    return { ok: true };
  }

  @Get("flags")
  async flags(@Req() req: Authed) {
    this.assertAdmin(req);
    return { flags: await this.db.featureFlag.findMany() };
  }

  @Get("audit")
  async audit(@Req() req: Authed) {
    this.assertAdmin(req);
    return { events: await this.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: true } }) };
  }
}
