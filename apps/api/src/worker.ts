import "reflect-metadata";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "./common/crypto";
import { SynapseClient } from "./matrix/synapse.client";
import { ingestInbox, joinPendingInvites } from "./conversations/sync";

const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const matrix = new SynapseClient();

export const jobs = new Queue("impro", { connection });

new Worker(
  "impro",
  async (job) => {
    if (job.name === "snooze-expire") {
      const due = await prisma.snooze.findMany({ where: { until: { lte: new Date() } } });
      for (const s of due) {
        await prisma.notification.create({
          data: {
            userId: s.userId,
            type: "snooze",
            title: "Conversation is back",
            body: "A snoozed conversation is ready again.",
            data: { conversationId: s.conversationId },
          },
        });
        await prisma.snooze.delete({ where: { id: s.id } });
      }
    }
    if (job.name === "inbox-sync") {
      const conns = await prisma.connection.findMany({
        where: { status: { in: ["connected", "syncing", "connecting"] } },
        select: { ownerUserId: true },
        distinct: ["ownerUserId"],
        take: 25,
      });
      for (const c of conns) {
        const user = await prisma.user.findUnique({ where: { id: c.ownerUserId }, select: { id: true, matrixUserId: true } });
        if (!user) continue;
        const session = await prisma.session.findFirst({
          where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        });
        if (!session) continue;
        try {
          const token = decryptSecret(session.matrixAccessEnc);
          await ingestInbox(prisma as never, matrix, user.id, user.matrixUserId, token);
          void joinPendingInvites(matrix, token, user.matrixUserId);
        } catch {
          /* skip user */
        }
      }
    }
  },
  { connection },
);

setInterval(() => {
  jobs.add("snooze-expire", {}, { removeOnComplete: 20, removeOnFail: 20 }).catch(() => undefined);
}, 30_000);

setInterval(() => {
  jobs.add("inbox-sync", {}, { removeOnComplete: 5, removeOnFail: 5 }).catch(() => undefined);
}, 45_000);

console.log("impro-worker started");
