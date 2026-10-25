import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === "OPTIONS") return true;

    const max = Number(this.config.get("RATE_LIMIT_MAX") ?? 120);
    const windowSeconds = Number(
      this.config.get("RATE_LIMIT_WINDOW_SECONDS") ?? 60,
    );
    const address = request.ip || request.socket.remoteAddress || "unknown";
    const route = request.route?.path ?? request.path;
    const key = `rate-limit:${address}:${request.method}:${route}`;
    const count = await this.redis.incrementWithExpiry(key, windowSeconds);

    // Redis is an optional protection layer; an outage must not block core APIs.
    if (count !== null && count > max) {
      throw new HttpException(
        "请求过于频繁，请稍后重试",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
