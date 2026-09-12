import { HttpException, HttpStatus } from "@nestjs/common";

export class ImproError extends HttpException {
  constructor(message: string, status: number = HttpStatus.BAD_REQUEST, public code = "impro_error") {
    super({ code, message }, status);
  }
}

export function mapMatrixError(err: unknown): ImproError {
  const anyErr = err as { errcode?: string; error?: string; message?: string; status?: number };
  const code = anyErr?.errcode;
  if (code === "M_UNKNOWN_TOKEN" || code === "M_MISSING_TOKEN") {
    return new ImproError("Your session expired. Sign in again.", HttpStatus.UNAUTHORIZED, "session_expired");
  }
  if (code === "M_FORBIDDEN") {
    return new ImproError("You don't have permission to do that.", HttpStatus.FORBIDDEN, "forbidden");
  }
  if (code === "M_LIMIT_EXCEEDED") {
    return new ImproError("You're going too fast. Try again in a moment.", HttpStatus.TOO_MANY_REQUESTS, "rate_limited");
  }
  if (code === "M_USER_IN_USE") {
    return new ImproError("That username is already taken.", HttpStatus.CONFLICT, "username_taken");
  }
  return new ImproError("Couldn't complete that action.", anyErr?.status ?? HttpStatus.BAD_GATEWAY, "upstream");
}
