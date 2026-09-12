import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ImproError } from "../common/errors";

type Authed = { impro: { user: { id: string } } };

@Controller("contacts")
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  async list(@Req() req: Authed) {
    const contacts = await this.db.contact.findMany({
      where: { ownerUserId: req.impro.user.id },
      include: { identities: true, company: true },
      orderBy: { displayName: "asc" },
    });
    return { contacts };
  }

  @Get(":id")
  async get(@Req() req: Authed, @Param("id") id: string) {
    const contact = await this.db.contact.findFirst({
      where: { id, ownerUserId: req.impro.user.id },
      include: { identities: true, company: true, conversations: { orderBy: { lastMessageAt: "desc" }, take: 50 } },
    });
    if (!contact) throw new ImproError("Contact not found.", 404, "not_found");
    return { contact };
  }

  @Post()
  async create(@Req() req: Authed, @Body() body: { displayName: string; email?: string; phone?: string }) {
    const contact = await this.db.contact.create({
      data: { ownerUserId: req.impro.user.id, displayName: body.displayName, email: body.email, phone: body.phone },
    });
    return { contact };
  }

  @Post("merge")
  async merge(@Req() req: Authed, @Body() body: { primaryId: string; secondaryId: string }) {
    const [a, b] = await Promise.all([
      this.db.contact.findFirst({ where: { id: body.primaryId, ownerUserId: req.impro.user.id } }),
      this.db.contact.findFirst({ where: { id: body.secondaryId, ownerUserId: req.impro.user.id }, include: { identities: true } }),
    ]);
    if (!a || !b) throw new ImproError("Contact not found.", 404, "not_found");
    await this.db.$transaction([
      this.db.contactIdentity.updateMany({ where: { contactId: b.id }, data: { contactId: a.id } }),
      this.db.conversation.updateMany({ where: { contactId: b.id }, data: { contactId: a.id } }),
      this.db.contact.delete({ where: { id: b.id } }),
    ]);
    const contact = await this.db.contact.findUnique({ where: { id: a.id }, include: { identities: true } });
    return { contact };
  }

  @Post(":id/split")
  async split(@Req() req: Authed, @Param("id") id: string, @Body() body: { identityId: string }) {
    const contact = await this.db.contact.findFirst({
      where: { id, ownerUserId: req.impro.user.id },
      include: { identities: true },
    });
    if (!contact) throw new ImproError("Contact not found.", 404, "not_found");
    const ident = contact.identities.find((i) => i.id === body.identityId);
    if (!ident) throw new ImproError("Identity not found.", 404, "not_found");
    const created = await this.db.contact.create({
      data: {
        ownerUserId: req.impro.user.id,
        displayName: ident.remoteDisplayName || ident.remoteUsername || ident.network,
        avatar: ident.remoteAvatar,
        identities: { connect: { id: ident.id } },
      },
      include: { identities: true },
    });
    await this.db.contactIdentity.update({ where: { id: ident.id }, data: { contactId: created.id } });
    return { contact: created };
  }

  @Post("suggest-merge")
  async suggest(@Req() req: Authed) {
    const contacts = await this.db.contact.findMany({
      where: { ownerUserId: req.impro.user.id },
      include: { identities: true },
    });
    const suggestions: { a: string; b: string; reason: string }[] = [];
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const A = contacts[i], B = contacts[j];
        if (A.email && B.email && A.email === B.email) suggestions.push({ a: A.id, b: B.id, reason: "Same email" });
        else if (A.phone && B.phone && A.phone === B.phone) suggestions.push({ a: A.id, b: B.id, reason: "Same phone" });
      }
    }
    return { suggestions };
  }
}
