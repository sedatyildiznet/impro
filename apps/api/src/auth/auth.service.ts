import { Injectable, Logger } from "@nestjs/common";
import {
  assertImproMatrixId,
  toMatrixUserId,
  usernameIssueMessage,
  validateUsername,
} from "@impro/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MasClient } from "../matrix/mas.client";
import { SynapseClient } from "../matrix/synapse.client";
import { encryptSecret, decryptSecret, hashToken, randomToken } from "../common/crypto";
import { ImproError } from "../common/errors";

const COOKIE = "impro_session";
const SESSION_DAYS = 14;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly mas: MasClient,
    private readonly synapse: SynapseClient,
  ) {}

  cookieName() {
    return COOKIE;
  }

  async register(input: { username: string; displayName: string; email?: string; password: string; ip?: string; ua?: string }) {
    const v = validateUsername(input.username);
    if (!v.ok) throw new ImproError(usernameIssueMessage(v.issue), 400, "invalid_username");
    if (!input.password || input.password.length < 8) {
      throw new ImproError("Password must be at least 8 characters.", 400, "weak_password");
    }
    const existing = await this.db.user.findUnique({ where: { username: v.username } });
    if (existing) throw new ImproError("That username is already taken.", 409, "username_taken");
    if (input.email) {
      const em = await this.db.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (em) throw new ImproError("That email is already in use.", 409, "email_taken");
    }

    let created: { id: string; username: string };
    try {
      created = await this.mas.createUser(v.username, input.displayName);
    } catch (err) {
      if (!(err instanceof ImproError) || err.getStatus() !== 409) throw err;
      const found = await this.mas.findByUsername(v.username);
      if (!found) throw err;
      created = found;
    }
    await this.mas.setPassword(created.id, input.password);
    if (input.displayName) await this.mas.setDisplayName(created.id, input.displayName);
    if (input.email) await this.mas.addEmail(created.id, input.email.toLowerCase());

    const mxid = toMatrixUserId(v.username);
    assertImproMatrixId(mxid);

    const user = await this.db.user.create({
      data: {
        username: v.username,
        displayName: input.displayName || v.username,
        email: input.email?.toLowerCase() || null,
        matrixUserId: mxid,
        masUserId: created.id,
        profile: { create: {} },
      },
    });

    const login = await this.mas.passwordLogin(v.username, input.password, "Impro");
    if (login.user_id !== mxid) {
      this.log.error(`Matrix ID mismatch: expected ${mxid} got ${login.user_id}`);
      throw new ImproError("Account was created on the wrong homeserver.", 500, "bad_server_name");
    }
    await this.synapse.setDisplayName(login.access_token, mxid, input.displayName || v.username).catch(() => undefined);
    return this.issueSession(user.id, login, input.ip, input.ua);
  }

  async login(username: string, password: string, ip?: string, ua?: string) {
    const v = validateUsername(username);
    const local = v.ok ? v.username : username.trim().toLowerCase();
    const login = await this.mas.passwordLogin(local, password, "Impro");
    assertImproMatrixId(login.user_id);
    let user = await this.db.user.findUnique({ where: { matrixUserId: login.user_id } });
    if (!user) {
      const parsed = login.user_id.match(/^@([^:]+):impro\.chat$/);
      user = await this.db.user.create({
        data: {
          username: parsed?.[1] || local,
          displayName: parsed?.[1] || local,
          matrixUserId: login.user_id,
          profile: { create: {} },
        },
      });
    }
    if (user.isSuspended) throw new ImproError("This account is suspended.", 403, "suspended");
    return this.issueSession(user.id, login, ip, ua);
  }

  private async issueSession(
    userId: string,
    login: { access_token: string; refresh_token?: string; device_id: string; user_id: string },
    ip?: string,
    ua?: string,
  ) {
    const raw = randomToken(32);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await this.db.session.create({
      data: {
        userId,
        deviceId: login.device_id,
        deviceName: "Impro",
        refreshHash: hashToken(raw),
        matrixAccessEnc: encryptSecret(login.access_token),
        matrixRefreshEnc: login.refresh_token ? encryptSecret(login.refresh_token) : null,
        expiresAt,
        ip,
        userAgent: ua,
      },
    });
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      cookie: raw,
      expiresAt,
      user: this.publicUser(user),
      matrix: {
        userId: login.user_id,
        accessToken: login.access_token,
        deviceId: login.device_id,
        homeserver: process.env.MATRIX_PUBLIC_URL || "https://matrix.impro.chat",
      },
    };
  }

  async loadSession(raw: string) {
    const row = await this.db.session.findFirst({
      where: { refreshHash: hashToken(raw), revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!row) throw new ImproError("Your session expired. Sign in again.", 401, "session_expired");
    if (row.user.isSuspended) throw new ImproError("This account is suspended.", 403, "suspended");
    return {
      sessionId: row.id,
      user: row.user,
      matrixToken: decryptSecret(row.matrixAccessEnc),
      deviceId: row.deviceId,
    };
  }

  async logout(raw: string) {
    const row = await this.db.session.findFirst({ where: { refreshHash: hashToken(raw), revokedAt: null } });
    if (row) {
      await this.db.session.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      try {
        await this.mas.logout(decryptSecret(row.matrixAccessEnc));
      } catch {
        /* ignore */
      }
    }
  }

  publicUser(user: { id: string; username: string; displayName: string; email: string | null; avatarUrl: string | null; matrixUserId: string; isGlobalAdmin: boolean }) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      matrixUserId: user.matrixUserId,
      isGlobalAdmin: user.isGlobalAdmin,
    };
  }
}
