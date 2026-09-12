import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ImproError } from "../common/errors";
import { PolicyService } from "../policy/policy.service";

type Authed = { impro: { user: { id: string } } };

@Controller("ai")
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly db: PrismaService, private readonly policy: PolicyService) {}

  @Post("complete")
  async complete(@Req() req: Authed, @Body() body: { kind: string; conversationId?: string; prompt?: string }) {
    if (!process.env.AI_API_KEY) {
      throw new ImproError("AI is not configured yet.", 501, "setup_required");
    }
    if (body.conversationId) {
      const { conv } = await this.policy.canViewConversation(req.impro.user.id, body.conversationId);
      const profile = await this.db.userProfile.findUnique({ where: { userId: conv.ownerUserId } });
      if (conv.ownerUserId === req.impro.user.id && profile && !profile.aiOptIn) {
        throw new ImproError("Turn on AI for your account in Settings → Privacy first.", 403, "ai_opt_in");
      }
    }
    const res = await fetch(`${(process.env.AI_BASE_URL || "https://api.spacexai.com/v1").replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.AI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "grok-4",
        messages: [
          { role: "system", content: "You are Impro, a concise assistant for messaging. Never mention Matrix internals." },
          { role: "user", content: body.prompt || `Help with ${body.kind}` },
        ],
      }),
    });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok) throw new ImproError("Couldn't complete the AI request.", 502, "ai");
    return { text: json.choices?.[0]?.message?.content || "" };
  }
}
