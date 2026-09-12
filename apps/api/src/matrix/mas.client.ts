import { Injectable, Logger } from "@nestjs/common";
import { ImproError } from "../common/errors";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
};

type CompatLogin = {
  user_id: string;
  access_token: string;
  device_id: string;
  refresh_token?: string;
  expires_in_ms?: number;
  home_server?: string;
};

@Injectable()
export class MasClient {
  private readonly log = new Logger(MasClient.name);
  private adminToken: { value: string; exp: number } | null = null;

  private masUrl() {
    return (process.env.MAS_INTERNAL_URL || "http://mas:8080").replace(/\/$/, "");
  }
  private adminUrl() {
    return (process.env.MAS_ADMIN_URL || "http://mas:8081").replace(/\/$/, "");
  }

  async passwordLogin(username: string, password: string, deviceName = "Impro"): Promise<CompatLogin> {
    const res = await fetch(`${this.masUrl()}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: username },
        password,
        initial_device_display_name: deviceName,
      }),
    });
    const body = (await res.json()) as CompatLogin & { errcode?: string; error?: string };
    if (!res.ok) {
      this.log.warn(`login failed status=${res.status} errcode=${body.errcode || "none"}`);
      throw new ImproError("Couldn't sign in. Check your username and password.", 401, "login_failed");
    }
    if (!body.user_id?.endsWith(":impro.chat")) {
      throw new ImproError("Account was created on the wrong homeserver. Contact support.", 500, "bad_server_name");
    }
    return body;
  }

  async logout(accessToken: string) {
    await fetch(`${this.masUrl()}/_matrix/client/v3/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }

  async refresh(refreshToken: string): Promise<CompatLogin> {
    const res = await fetch(`${this.masUrl()}/_matrix/client/v3/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const body = (await res.json()) as CompatLogin & { errcode?: string };
    if (!res.ok) throw new ImproError("Your session expired. Sign in again.", 401, "session_expired");
    return body;
  }

  private async clientCredentials(): Promise<string> {
    if (this.adminToken && this.adminToken.exp > Date.now() + 10_000) return this.adminToken.value;
    const id = process.env.MAS_IMPRO_API_CLIENT_ID || "";
    const secret = process.env.MAS_IMPRO_API_CLIENT_SECRET || "";
    const res = await fetch(`${this.masUrl()}/oauth2/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "urn:mas:admin" }),
    });
    const body = (await res.json()) as TokenResponse & { error?: string };
    if (!res.ok || !body.access_token) {
      this.log.error(`MAS client_credentials failed: ${body.error || res.status}`);
      throw new ImproError("Couldn't reach authentication service.", 502, "mas_admin");
    }
    this.adminToken = { value: body.access_token, exp: Date.now() + (body.expires_in || 300) * 1000 };
    return body.access_token;
  }

  async createUser(username: string, displayName?: string): Promise<{ id: string; username: string }> {
    const token = await this.clientCredentials();
    const res = await fetch(`${this.adminUrl()}/api/admin/v1/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ username, displayname: displayName || null }),
    });
    const body = (await res.json()) as {
      data?: { id: string; attributes?: { username: string } };
      errors?: { title?: string }[];
    };
    if (res.status === 409) throw new ImproError("That username is already taken.", 409, "username_taken");
    if (!res.ok || !body.data) {
      this.log.error(`createUser failed ${res.status} ${JSON.stringify(body)}`);
      throw new ImproError("Couldn't create your account.", 502, "mas_create_user");
    }
    return { id: body.data.id, username: body.data.attributes?.username || username };
  }

  async setPassword(masUserId: string, password: string) {
    const token = await this.clientCredentials();
    const res = await fetch(`${this.adminUrl()}/api/admin/v1/users/${masUserId}/set-password`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ password, skip_password_check: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      this.log.error(`setPassword failed ${res.status} ${text}`);
      throw new ImproError("Couldn't set your password.", 502, "mas_password");
    }
  }

  async setDisplayName(masUserId: string, displayName: string) {
    const token = await this.clientCredentials();
    await fetch(`${this.adminUrl()}/api/admin/v1/users/${masUserId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ displayname: displayName }),
    }).catch(() => undefined);
  }

  async addEmail(masUserId: string, email: string) {
    const token = await this.clientCredentials();
    await fetch(`${this.adminUrl()}/api/admin/v1/user-emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ user_id: masUserId, email }),
    }).catch(() => undefined);
  }

  async findByUsername(username: string): Promise<{ id: string; username: string } | null> {
    const token = await this.clientCredentials();
    const res = await fetch(
      `${this.adminUrl()}/api/admin/v1/users?filter[username]=${encodeURIComponent(username)}&page[first]=1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = (await res.json()) as { data?: { id: string; attributes?: { username: string } }[] };
    const row = body.data?.[0];
    return row ? { id: row.id, username: row.attributes?.username || username } : null;
  }
}
