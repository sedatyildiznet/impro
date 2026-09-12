import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./prisma/prisma.service";
import { MasClient } from "./matrix/mas.client";
import { SynapseClient } from "./matrix/synapse.client";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { PolicyService } from "./policy/policy.service";
import { HealthController } from "./health/health.controller";
import { ConversationsController } from "./conversations/conversations.controller";
import { ContactsController } from "./contacts/contacts.controller";
import { WorkspacesController } from "./workspaces/workspaces.controller";
import { ConnectionsController } from "./connections/connections.controller";
import { SearchController } from "./search/search.controller";
import { AdminController } from "./admin/admin.controller";
import { AiController } from "./ai/ai.controller";
import { UsersController } from "./users/users.controller";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    ConversationsController,
    ContactsController,
    WorkspacesController,
    ConnectionsController,
    SearchController,
    AdminController,
    AiController,
    UsersController,
  ],
  providers: [
    PrismaService,
    MasClient,
    SynapseClient,
    AuthService,
    AuthGuard,
    PolicyService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
