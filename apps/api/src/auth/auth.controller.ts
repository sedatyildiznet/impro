import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Response, Request } from "express";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

class RegisterDto {
  @IsString() username!: string;
  @IsString() displayName!: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : value))
  @IsEmail()
  email?: string;
  @IsString() @MinLength(8) password!: string;
}
class LoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(this.auth.cookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.SCHEME || "https") === "https",
      expires,
      path: "/",
      domain: process.env.COOKIE_DOMAIN || undefined,
    });
  }

  @Post("auth/register")
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.register({
      ...body,
      ip: req.ip,
      ua: req.headers["user-agent"],
    });
    this.setCookie(res, out.cookie, out.expiresAt);
    return { user: out.user, matrix: out.matrix };
  }

  @Post("auth/login")
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.login(body.username, body.password, req.ip, req.headers["user-agent"]);
    this.setCookie(res, out.cookie, out.expiresAt);
    return { user: out.user, matrix: out.matrix };
  }

  @Post("auth/logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[this.auth.cookieName()];
    if (raw) await this.auth.logout(raw);
    res.clearCookie(this.auth.cookieName(), { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: Request & { impro: { user: Parameters<AuthService["publicUser"]>[0] } }) {
    return { user: this.auth.publicUser(req.impro.user) };
  }
}
