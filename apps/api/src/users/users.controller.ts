import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

type Authed = { impro: { user: { id: string } } };

@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly db: PrismaService) {}

  @Get("profile")
  async profile(@Req() req: Authed) {
    const profile = await this.db.userProfile.findUnique({ where: { userId: req.impro.user.id } });
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.impro.user.id } });
    return { user, profile };
  }

  @Patch("profile")
  async update(@Req() req: Authed, @Body() body: { displayName?: string; theme?: string; aiOptIn?: boolean; onboardingDone?: boolean }) {
    if (body.displayName) {
      await this.db.user.update({ where: { id: req.impro.user.id }, data: { displayName: body.displayName } });
    }
    const profile = await this.db.userProfile.upsert({
      where: { userId: req.impro.user.id },
      update: {
        ...(body.theme ? { theme: body.theme } : {}),
        ...(body.aiOptIn !== undefined ? { aiOptIn: body.aiOptIn } : {}),
        ...(body.onboardingDone !== undefined ? { onboardingDone: body.onboardingDone } : {}),
      },
      create: { userId: req.impro.user.id, theme: body.theme || "system", aiOptIn: body.aiOptIn || false },
    });
    return { profile };
  }
}
