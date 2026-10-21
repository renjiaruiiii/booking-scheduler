import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxEventStatus, Prisma } from "@prisma/client";
import { Job, Queue, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { ListOutboxEventsDto } from "./dto/list-outbox-events.dto";

const QUEUE_NAME = "booking-events";
const MAX_ATTEMPTS = 3;

type OutboxJob = { outboxEventId: number };

function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private readonly connection: ReturnType<typeof redisConnection>;
  private readonly queue: Queue<OutboxJob>;
  private worker?: Worker<OutboxJob>;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.connection = redisConnection(config.getOrThrow<string>("REDIS_URL"));
    this.queue = new Queue<OutboxJob>(QUEUE_NAME, {
      connection: this.connection,
    });
  }

  onModuleInit() {
    void this.prisma.outboxEvent
      .updateMany({
        where: { status: "PROCESSING" },
        data: { status: "PENDING", nextRetryAt: null },
      })
      .then(() => this.dispatchPending())
      .catch((error: unknown) => this.logDispatchError(error));

    this.worker = new Worker<OutboxJob>(
      QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on("failed", (job, error) => this.recordFailure(job, error));
    this.timer = setInterval(() => {
      void this.dispatchPending().catch((error: unknown) =>
        this.logDispatchError(error),
      );
    }, 5000);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue.close();
  }

  async list(query: ListOutboxEventsDto) {
    const { page, pageSize } = this.pagination(query);
    const where: Prisma.OutboxEventWhereInput = {
      ...(query.status ? { status: query.status as OutboxEventStatus } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.aggregateType ? { aggregateType: query.aggregateType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.outboxEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.outboxEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  private async dispatchPending() {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        status: "PENDING",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: { id: "asc" },
      take: 20,
    });

    for (const event of events) {
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, status: "PENDING" },
        data: { status: "PROCESSING" },
      });
      if (claimed.count !== 1) continue;

      try {
        await this.queue.add(
          event.eventType,
          { outboxEventId: event.id },
          {
            jobId: `outbox-${event.id}`,
            attempts: MAX_ATTEMPTS,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: true,
          },
        );
      } catch (error) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: "PENDING",
            nextRetryAt: new Date(Date.now() + 5000),
          },
        });
        this.logger.error(
          `Outbox publish failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private logDispatchError(error: unknown) {
    this.logger.error(
      `Outbox poll failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private pagination(query: ListOutboxEventsDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new BadRequestException(
        "page 必须大于 0，pageSize 必须在 1 到 100 之间",
      );
    }
    return { page, pageSize };
  }

  private async process(job: Job<OutboxJob>) {
    await this.prisma.outboxEvent.update({
      where: { id: job.data.outboxEventId, status: "PROCESSING" },
      data: { status: "COMPLETED", nextRetryAt: null },
    });
  }

  private async recordFailure(job: Job<OutboxJob> | undefined, error: Error) {
    if (job) {
      try {
        await this.prisma.outboxEvent.update({
          where: { id: job.data.outboxEventId },
          data: {
            retryCount: { increment: 1 },
            ...(job.attemptsMade >= MAX_ATTEMPTS
              ? { status: "FAILED" as const, nextRetryAt: null }
              : {}),
          },
        });
      } catch (updateError) {
        this.logger.error(
          `Outbox retry state update failed: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
        );
      }
    }
    this.logger.error(`Outbox job failed: ${error.message}`);
  }
}
