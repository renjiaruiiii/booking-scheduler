import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { catchError, Observable, throwError, tap } from "rxjs";
import type { Response } from "express";
import type { RequestWithId } from "./request-id.middleware";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => this.log(request, response, startedAt)),
      catchError((error: unknown) => {
        this.log(request, response, startedAt, error);
        return throwError(() => error);
      }),
    );
  }

  private log(
    request: RequestWithId,
    response: Response,
    startedAt: number,
    error?: unknown,
  ) {
    const statusCode = this.getStatusCode(error, response.statusCode);
    this.logger.log(
      JSON.stringify({
        type: "http_request",
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  }

  private getStatusCode(error: unknown, responseStatusCode: number) {
    if (
      error &&
      typeof error === "object" &&
      "getStatus" in error &&
      typeof error.getStatus === "function"
    ) {
      return Number(error.getStatus());
    }

    return error ? 500 : responseStatusCode;
  }
}
