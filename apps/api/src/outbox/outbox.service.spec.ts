const queueAdd = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: queueAdd,
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxService } from "./outbox.service";

describe("OutboxService", () => {
  const prisma = {
    outboxEvent: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue("redis://localhost:6379"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("claims pending events and publishes them to BullMQ", async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([
      { id: 21, eventType: "BookingCreated" },
    ]);
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    queueAdd.mockResolvedValue({ id: "outbox-21" });

    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );
    await service["dispatchPending"]();

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: expect.any(Date) } }],
      },
      orderBy: { id: "asc" },
      take: 20,
    });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 21, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    expect(queueAdd).toHaveBeenCalledWith(
      "BookingCreated",
      { outboxEventId: 21 },
      expect.objectContaining({
        jobId: "outbox-21",
        attempts: 3,
      }),
    );
  });

  it("lists outbox events with pagination and filters", async () => {
    const items = [{ id: 21, status: "FAILED", eventType: "BookingCreated" }];
    prisma.outboxEvent.findMany.mockResolvedValue(items);
    prisma.outboxEvent.count.mockResolvedValue(1);
    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(
      service.list({
        page: "2",
        pageSize: "5",
        status: "FAILED",
        eventType: "BookingCreated",
        aggregateType: "BOOKING",
      }),
    ).resolves.toEqual({ items, total: 1, page: 2, pageSize: 5 });
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: {
        status: "FAILED",
        eventType: "BookingCreated",
        aggregateType: "BOOKING",
      },
      orderBy: { createdAt: "desc" },
      skip: 5,
      take: 5,
    });
  });

  it("rejects invalid outbox pagination", async () => {
    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(service.list({ pageSize: "101" })).rejects.toThrow(
      "page 必须大于 0",
    );
  });

  it("returns an event to pending when publishing to BullMQ fails", async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([
      { id: 22, eventType: "BookingCancelled" },
    ]);
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    queueAdd.mockRejectedValue(new Error("Redis unavailable"));

    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );
    await service["dispatchPending"]();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: expect.objectContaining({
        status: "PENDING",
        nextRetryAt: expect.any(Date),
      }),
    });
  });

  it("marks an event completed after the worker processes it", async () => {
    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );

    await service["process"]({ data: { outboxEventId: 23 } } as never);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 23, status: "PROCESSING" },
      data: { status: "COMPLETED", nextRetryAt: null },
    });
  });

  it("increments retry count and marks an exhausted event failed", async () => {
    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );

    await service["recordFailure"](
      { data: { outboxEventId: 24 }, attemptsMade: 3 } as never,
      new Error("handler failed"),
    );

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 24 },
      data: {
        retryCount: { increment: 1 },
        status: "FAILED",
        nextRetryAt: null,
      },
    });
  });

  it("keeps a processing event active while BullMQ still has retries", async () => {
    const service = new OutboxService(
      prisma as never,
      config as unknown as ConfigService,
    );

    await service["recordFailure"](
      { data: { outboxEventId: 25 }, attemptsMade: 1 } as never,
      new Error("temporary handler failure"),
    );

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 25 },
      data: { retryCount: { increment: 1 } },
    });
  });
});
