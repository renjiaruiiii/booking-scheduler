import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AccessTokenPayload } from "./access-token.guard";
import { ROLES_KEY } from "./roles.decorator";

type AuthenticatedRequest = Request & { user?: AccessTokenPayload };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.roles.some((role) => requiredRoles.includes(role))) {
      throw new ForbiddenException("没有权限执行此操作");
    }

    return true;
  }
}
