import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export type RequestWithId = Request & { requestId?: string };

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction) {
    const incoming = request.header("x-request-id");
    const requestId =
      incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}
