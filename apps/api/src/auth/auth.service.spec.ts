import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, scryptSync } from "node:crypto";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue("access-token"),
    verifyAsync: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue("refresh-secret"),
  };

  beforeEach(() => jest.clearAllMocks());

  it("creates a user with a hashed password and default role", async () => {
    const create = jest.fn().mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      status: "ACTIVE",
      createdAt: new Date(),
      roles: [{ role: { code: "USER", name: "普通用户" } }],
    });
    const service = new AuthService(
      { user: { create } } as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.register({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });

    expect(result.email).toBe("alice@example.com");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^[a-f0-9]{32}:[a-f0-9]{128}$/),
        }),
      }),
    );
  });

  it("translates duplicate user errors to a conflict", async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    const service = new AuthService(
      { user: { create } } as never,
      jwtService as never,
      configService as never,
    );

    await expect(
      service.register({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns an access token for valid credentials", async () => {
    const salt = "a".repeat(32);
    const passwordHash = `${salt}:${scryptSync("password123", salt, 64).toString("hex")}`;
    const findFirst = jest.fn().mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      status: "ACTIVE",
      passwordHash,
      roles: [{ role: { code: "USER", name: "普通用户" } }],
    });
    const createToken = jest.fn().mockResolvedValue({});
    const service = new AuthService(
      {
        user: { findFirst },
        refreshToken: { create: createToken },
      } as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.login({
      identifier: "alice",
      password: "password123",
    });

    expect(result.accessToken).toBe("access-token");
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      username: "alice",
      roles: ["USER"],
    });
    expect(createToken).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        tokenHash: createHash("sha256").update("access-token").digest("hex"),
      }),
    });
  });

  it("rotates a valid refresh token and stores only its hash", async () => {
    const oldToken = "old-refresh-token";
    const user = {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      status: "ACTIVE",
      roles: [{ role: { code: "USER", name: "普通用户" } }],
    };
    const record = {
      id: 8,
      userId: 1,
      tokenHash: createHash("sha256").update(oldToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const transaction = { refreshToken: { updateMany, create } };
    const prisma = {
      refreshToken: { findUnique: jest.fn().mockResolvedValue(record) },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );
    jwtService.verifyAsync.mockResolvedValue({ sub: 1, tokenType: "refresh" });

    const result = await service.refresh(oldToken);

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("access-token");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { revokedAt: expect.any(Date) },
      }),
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        tokenHash: createHash("sha256").update("access-token").digest("hex"),
      }),
    });
  });

  it("rejects a revoked refresh token", async () => {
    const service = new AuthService(
      {
        refreshToken: {
          findUnique: jest.fn().mockResolvedValue({
            id: 8,
            userId: 1,
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: new Date(),
            user: { id: 1, status: "ACTIVE", roles: [] },
          }),
        },
      } as never,
      jwtService as never,
      configService as never,
    );
    jwtService.verifyAsync.mockResolvedValue({ sub: 1, tokenType: "refresh" });

    await expect(service.refresh("used-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("revokes the matching refresh token on logout", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new AuthService(
      { refreshToken: { updateMany } } as never,
      jwtService as never,
      configService as never,
    );

    await service.logout("refresh-token");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash("sha256").update("refresh-token").digest("hex"),
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
