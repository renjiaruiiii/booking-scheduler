import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AccessTokenGuard } from "./access-token.guard";

describe("AccessTokenGuard", () => {
  const jwtService = { verifyAsync: jest.fn() };
  const guard = new AccessTokenGuard(jwtService as never);

  function context(authorization?: string) {
    const request: { headers: { authorization?: string }; user?: unknown } = {
      headers: { authorization },
    };
    return {
      request,
      executionContext: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("verifies the bearer token and attaches its claims to the request", async () => {
    const payload = { sub: 12, username: "alice", roles: ["USER"] };
    const { request, executionContext } = context("Bearer valid-token");
    jwtService.verifyAsync.mockResolvedValue(payload);

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith("valid-token");
    expect(request.user).toBe(payload);
  });

  it.each([undefined, "Basic token", "Bearer one two"])(
    "rejects a missing or malformed authorization header: %s",
    async (authorization) => {
      const { executionContext } = context(authorization);

      await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid token", async () => {
    const { executionContext } = context("Bearer invalid-token");
    jwtService.verifyAsync.mockRejectedValue(new Error("invalid signature"));

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token without the expected access-token claims", async () => {
    const { executionContext } = context("Bearer refresh-token");
    jwtService.verifyAsync.mockResolvedValue({ sub: 12, tokenType: "refresh" });

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
