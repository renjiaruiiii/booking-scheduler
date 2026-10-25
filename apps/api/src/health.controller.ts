import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { RedisService } from "./redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.redis.ping(),
    ]);

    if (!database || !redis) {
      throw new ServiceUnavailableException("依赖服务尚未就绪");
    }

    return {
      status: "ok",
      service: "api",
      checks: { database: "ok", redis: "ok" },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
