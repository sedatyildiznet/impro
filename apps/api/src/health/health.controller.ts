import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";
import Redis from "ioredis";

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  root() {
    return { status: "ok", service: "impro-api" };
  }

  @Get("live")
  live() {
    return { status: "ok", service: "impro-api" };
  }

  @Get("ready")
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.db.$queryRaw`SELECT 1`;
      checks.postgres = "ok";
    } catch {
      checks.postgres = "down";
    }
    try {
      const r = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
      await r.ping();
      await r.quit();
      checks.redis = "ok";
    } catch {
      checks.redis = "down";
    }
    try {
      const s = await fetch(`${(process.env.MATRIX_HOMESERVER_INTERNAL || "http://synapse:8008").replace(/\/$/, "")}/health`);
      checks.synapse = s.ok ? "ok" : "down";
    } catch {
      checks.synapse = "down";
    }
    try {
      const m = await fetch(`${(process.env.MAS_ADMIN_URL || "http://mas:8081").replace(/\/$/, "")}/health`);
      checks.mas = m.ok ? "ok" : "down";
    } catch {
      checks.mas = "down";
    }
    const ready = Object.values(checks).every((v) => v === "ok");
    return { status: ready ? "ok" : "degraded", checks };
  }
}
