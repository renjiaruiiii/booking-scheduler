import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on("error", (error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch (error) {
      this.logger.warn(
        `Redis initial connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client.status !== "end") this.client.disconnect();
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logCommandError("get", error);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logCommandError("set", error);
    }
  }

  async deletePrefix(prefix: string) {
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== "0");
    } catch (error) {
      this.logCommandError("delete", error);
    }
  }

  async incrementWithExpiry(key: string, windowSeconds: number) {
    try {
      const result = await this.client
        .multi()
        .incr(key)
        .expire(key, windowSeconds, "NX")
        .exec();
      return Number(result?.[0]?.[1] ?? 0);
    } catch (error) {
      this.logCommandError("increment", error);
      return null;
    }
  }

  async ping() {
    try {
      return (await this.client.ping()) === "PONG";
    } catch (error) {
      this.logCommandError("ping", error);
      return false;
    }
  }

  private logCommandError(command: string, error: unknown) {
    this.logger.warn(
      `Redis ${command} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
