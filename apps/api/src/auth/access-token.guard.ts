import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type AccessTokenPayload = {
  sub: number;
  username: string;
  roles: string[];
};

type AuthenticatedRequest = Request & { user?: AccessTokenPayload };

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "number" &&
    Number.isInteger(payload.sub) &&
    typeof payload.username === "string" &&
    Array.isArray(payload.roles) &&
    payload.roles.every((role) => typeof role === "string")
  );
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === "string"
        ? /^Bearer\s+(\S+)$/i.exec(authorization)
        : null;

    if (!match) throw new UnauthorizedException();

    try {
      const payload: unknown = await this.jwtService.verifyAsync(match[1]);
      if (!isAccessTokenPayload(payload)) throw new UnauthorizedException();
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
