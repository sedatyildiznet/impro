import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ImproError } from "../common/errors";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const raw =
      req.cookies?.impro_session ||
      (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);
    if (!raw) throw new ImproError("Sign in to continue.", 401, "unauthenticated");
    req.impro = await this.auth.loadSession(raw);
    return true;
  }
}
