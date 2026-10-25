import { HttpException, HttpStatus } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard";

describe("RateLimitGuard", () => {
  const redis = { incrementWithExpiry: jest.fn() };
  const config = { get: jest.fn() };
  const guard = new RateLimitGuard(redis as never, config as never);

  function context(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) =>
      key === "RATE_LIMIT_MAX" ? 2 : 60,
    );
  });

  it("blocks requests after the configured per-route limit", async () => {
    redis.incrementWithExpiry.mockResolvedValue(3);
    const request = {
      method: "POST",
      path: "/api/v1/bookings",
      route: { path: "/api/v1/bookings" },
      ip: "127.0.0.1",
      socket: {},
    };

    await expect(guard.canActivate(context(request))).rejects.toHaveProperty(
      "status",
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      "rate-limit:127.0.0.1:POST:/api/v1/bookings",
      60,
    );
  });

  it("allows requests when Redis is unavailable and skips preflight", async () => {
    redis.incrementWithExpiry.mockResolvedValue(null);
    const request = {
      method: "GET",
      path: "/api/v1/resources",
      ip: "127.0.0.1",
      socket: {},
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ ...request, method: "OPTIONS" })),
    ).resolves.toBe(true);
    expect(redis.incrementWithExpiry).toHaveBeenCalledTimes(1);
  });
});
