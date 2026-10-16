import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as never);

  function context(roles: string[]) {
    const request = { user: { sub: 1, username: "alice", roles } };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => jest.clearAllMocks());

  it("allows a user with one of the required roles", () => {
    reflector.getAllAndOverride.mockReturnValue([
      "RESOURCE_ADMIN",
      "SYSTEM_ADMIN",
    ]);

    expect(guard.canActivate(context(["USER", "RESOURCE_ADMIN"]))).toBe(true);
  });

  it("rejects a user without a required role", () => {
    reflector.getAllAndOverride.mockReturnValue(["SYSTEM_ADMIN"]);

    expect(() => guard.canActivate(context(["USER"]))).toThrow(
      ForbiddenException,
    );
  });

  it("allows routes without role metadata", () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(context(["USER"]))).toBe(true);
  });
});
