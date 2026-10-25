import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";
import { RedisService } from "./redis/redis.service";

describe("HealthController", () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a healthy API status", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    const result = moduleRef.get(HealthController).getHealth();
    expect(result.status).toBe("ok");
    expect(result.service).toBe("api");
  });

  it("reports database and Redis readiness", async () => {
    prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    redis.ping.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    await expect(
      moduleRef.get(HealthController).getReadiness(),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "ok",
        checks: { database: "ok", redis: "ok" },
      }),
    );
  });

  it("fails readiness when a dependency is unavailable", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("database unavailable"));
    redis.ping.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    await expect(
      moduleRef.get(HealthController).getReadiness(),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});
