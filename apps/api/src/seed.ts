import { PrismaClient } from "@prisma/client";
import { toMatrixUserId } from "@impro/shared";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed production");
    process.exit(1);
  }
  const owner = await db.user.upsert({
    where: { username: "dev" },
    update: {},
    create: {
      username: "dev",
      displayName: "Dev",
      email: "dev@impro.chat",
      matrixUserId: toMatrixUserId("dev"),
      isGlobalAdmin: true,
      profile: { create: { onboardingDone: true } },
    },
  });
  const names = ["Alice", "Bob", "Customer A", "Customer B"];
  for (const name of names) {
    const c = await db.contact.create({
      data: {
        ownerUserId: owner.id,
        displayName: name,
        identities: {
          create: { network: "mock", remoteId: name.toLowerCase().replace(/\s/g, "-"), remoteDisplayName: name },
        },
      },
    });
    await db.conversation.create({
      data: {
        ownerUserId: owner.id,
        network: "mock",
        title: name,
        contactId: c.id,
        type: "bridged",
        lastMessagePreview: "Hello from MockChat",
        lastMessageAt: new Date(),
      },
    });
  }
  console.log("Seeded mock contacts for development.");
}

main().finally(() => db.$disconnect());
