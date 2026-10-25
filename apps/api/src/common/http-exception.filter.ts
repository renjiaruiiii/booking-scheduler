import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-id.middleware";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const details =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof details === "object" && details !== null && "message" in details
        ? (details as { message: unknown }).message
        : typeof details === "string"
          ? details
          : "服务器内部错误";
    const error =
      typeof details === "object" && details !== null && "error" in details
        ? (details as { error: unknown }).error
        : (HttpStatus[status] ?? "Error");

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.originalUrl,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
