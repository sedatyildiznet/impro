import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";

@Catch()
export class ImproExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        res.status(status).json({ code: "error", message: body });
        return;
      }
      const obj = body as { message?: unknown; code?: string; error?: string };
      const raw = obj.message ?? obj.error;
      const message = Array.isArray(raw) ? String(raw[0] || "Something went wrong.") : String(raw || "Something went wrong.");
      res.status(status).json({ code: obj.code || "error", message });
      return;
    }
    this.log.error(exception instanceof Error ? exception.stack : exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "error",
      message: "Something went wrong.",
    });
  }
}
