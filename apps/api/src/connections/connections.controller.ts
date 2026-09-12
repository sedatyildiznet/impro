import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { SynapseClient } from "../matrix/synapse.client";
import { buildAdapters } from "../bridges/adapters";
import { ImproError } from "../common/errors";
import { NETWORKS } from "@impro/shared";
import { ingestInbox, joinPendingInvites } from "../conversations/sync";

type Authed = { impro: { user: { id: string; matrixUserId: string; username: string }; matrixToken: string } };

@Controller("connections")
@UseGuards(AuthGuard)
export class ConnectionsController {
  private adapters = buildAdapters();
  constructor(
    private readonly db: PrismaService,
    private readonly matrix: SynapseClient,
  ) {}

  private adapter(network: string): import("../bridges/adapters").ConnectionAdapter | undefined {
    return (this.adapters as Record<string, import("../bridges/adapters").ConnectionAdapter | undefined>)[network];
  }

  private kickInbox(userId: string, mxid: string, token: string) {
    const run = () => ingestInbox(this.db, this.matrix, userId, mxid, token, { force: true }).then(() => joinPendingInvites(this.matrix, token, mxid));
    void run().catch(() => undefined);
    for (const ms of [3000, 10000, 25000, 60000]) setTimeout(() => void run().catch(() => undefined), ms);
  }

  @Get()
  async list(@Req() req: Authed) {
    const rows = await this.db.connection.findMany({ where: { ownerUserId: req.impro.user.id } });
    const live = new Map<string, "connected" | "logged_out" | "connecting" | "unknown">();
    await Promise.all(
      [...new Set(rows.map((r) => r.network))].map(async (network) => {
        const ad = this.adapter(network);
        if (!ad?.accountState) return;
        live.set(network, await ad.accountState(req.impro.user.matrixUserId).catch(() => "unknown" as const));
      }),
    );
    for (const row of rows) {
      const st = live.get(row.network);
      if (st === "logged_out" && row.status === "connected") {
        await this.db.connection.update({
          where: { id: row.id },
          data: { status: "needs_attention", lastError: "Logged out from the official app. Connect again." },
        });
        row.status = "needs_attention";
        row.lastError = "Logged out from the official app. Connect again.";
      }
      if (st === "connected" && row.status !== "connected") {
        await this.db.connection.update({ where: { id: row.id }, data: { status: "connected", lastError: null, lastSyncAt: new Date() } });
        row.status = "connected";
        row.lastError = null;
      }
    }
    const cards = await Promise.all(
      ["whatsapp", "telegram", "signal", "instagram", "messenger", "discord", "matrix"].map(async (network) => {
        const ad = this.adapter(network);
        const status = ad ? await ad.getStatus() : "unavailable";
        const mine = rows.filter((r) => r.network === network);
        return {
          network,
          displayName: ad?.displayName || network,
          experimental: ad?.experimental || false,
          setupRequired: ad?.setupRequired() || false,
          bridgeStatus: status,
          accounts: mine,
        };
      }),
    );
    return { networks: cards };
  }

  @Post(":network/start")
  async start(@Req() req: Authed, @Param("network") network: string, @Body() body: { displayName?: string }) {
    if (!NETWORKS.includes(network as (typeof NETWORKS)[number])) throw new ImproError("Unknown network.", 400, "network");
    const ad = this.adapter(network);
    if (!ad) throw new ImproError("Unknown network.", 400, "network");
    const conn = await this.db.connection.create({
      data: {
        ownerUserId: req.impro.user.id,
        network,
        displayName: body.displayName || ad.displayName,
        status: ad.setupRequired() ? "setup_required" : "connecting",
        capabilities: ad.capabilities() as object,
      },
    });
    const step = await ad.startLogin(req.impro.user.matrixUserId, conn.id, req.impro.matrixToken);
    const status =
      step.type === "complete"
        ? "connected"
        : step.type === "setup_required"
          ? "setup_required"
          : step.type === "error"
            ? "needs_attention"
            : "connecting";
    const updated = await this.db.connection.update({
      where: { id: conn.id },
      data: {
        status,
        lastError: step.type === "error" ? step.message : null,
        lastSyncAt: step.type === "complete" ? new Date() : undefined,
      },
    });
    if (step.type === "complete") this.kickInbox(req.impro.user.id, req.impro.user.matrixUserId, req.impro.matrixToken);
    return { connection: updated, step };
  }

  @Get(":id/login-state")
  async loginState(@Req() req: Authed, @Param("id") id: string) {
    const conn = await this.db.connection.findFirst({ where: { id, ownerUserId: req.impro.user.id } });
    if (!conn) throw new ImproError("Connection not found.", 404, "not_found");
    const ad = this.adapter(conn.network);
    if (!ad) throw new ImproError("Unknown network.", 400, "network");
    const step = await ad.getLoginState(conn.id, req.impro.matrixToken, req.impro.user.matrixUserId);
    if (step.type === "complete") {
      await this.db.connection.update({ where: { id: conn.id }, data: { status: "connected", lastSyncAt: new Date(), lastError: null } });
      this.kickInbox(req.impro.user.id, req.impro.user.matrixUserId, req.impro.matrixToken);
    }
    if (step.type === "error") {
      await this.db.connection.update({ where: { id: conn.id }, data: { status: "needs_attention", lastError: step.message } });
    }
    return { step };
  }

  @Post(":id/login-step")
  async step(@Req() req: Authed, @Param("id") id: string, @Body() body: Record<string, string>) {
    const conn = await this.db.connection.findFirst({ where: { id, ownerUserId: req.impro.user.id } });
    if (!conn) throw new ImproError("Connection not found.", 404, "not_found");
    const ad = this.adapter(conn.network);
    if (!ad) throw new ImproError("Unknown network.", 400, "network");
    const step = await ad.submitLoginStep(conn.id, body, req.impro.matrixToken);
    if (step.type === "complete") {
      await this.db.connection.update({ where: { id: conn.id }, data: { status: "connected", lastSyncAt: new Date() } });
      this.kickInbox(req.impro.user.id, req.impro.user.matrixUserId, req.impro.matrixToken);
    }
    return { step };
  }

  @Post(":id/reconnect")
  async reconnect(@Req() req: Authed, @Param("id") id: string) {
    const conn = await this.db.connection.findFirst({ where: { id, ownerUserId: req.impro.user.id } });
    if (!conn) throw new ImproError("Connection not found.", 404, "not_found");
    const ad = this.adapter(conn.network);
    if (!ad) throw new ImproError("Unknown network.", 400, "network");
    await ad.reconnect(conn.id);
    await this.db.connection.update({ where: { id }, data: { status: "connecting" } });
    return { ok: true };
  }

  @Delete(":id")
  async remove(@Req() req: Authed, @Param("id") id: string) {
    const conn = await this.db.connection.findFirst({ where: { id, ownerUserId: req.impro.user.id } });
    if (!conn) throw new ImproError("Connection not found.", 404, "not_found");
    const ad = this.adapter(conn.network);
    if (!ad) throw new ImproError("Unknown network.", 400, "network");
    await ad.disconnect(conn.id, req.impro.matrixToken, req.impro.user.matrixUserId);
    await this.db.connection.delete({ where: { id } });
    return { ok: true };
  }
}
