import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { BookingsService } from "./bookings.service";

describe("BookingsService", () => {
  const tx = {
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    resource: {
      findFirst: jest.fn(),
    },
    resourceSlot: {
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = new BookingsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("lists only the current user's bookings with pagination", async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);

    await service.listMine({ page: "2", pageSize: "5" }, 7);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        orderBy: { createdAt: "desc" },
        skip: 5,
        take: 5,
      }),
    );
    expect(prisma.booking.count).toHaveBeenCalledWith({ where: { userId: 7 } });
  });

  it("rejects invalid booking pagination", async () => {
    await expect(service.listMine({ page: "0" }, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("returns a booking only when it belongs to the current user", async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: 12, userId: 7 });

    await expect(service.getMine(12, 7)).resolves.toEqual({
      id: 12,
      userId: 7,
    });
    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: { id: 12, userId: 7 },
      include: {
        resource: { select: { id: true, code: true, name: true } },
        bookingSlots: { include: { slot: true } },
      },
    });
  });

  it("does not reveal another user's booking", async () => {
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(service.getMine(12, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates a pending booking and atomically claims its slots", async () => {
    tx.booking.findFirst.mockResolvedValue(null);
    tx.resource.findFirst.mockResolvedValue({ id: 4 });
    tx.resourceSlot.updateMany.mockResolvedValue({ count: 2 });
    tx.booking.create.mockResolvedValue({ id: 12, status: "PENDING" });

    const result = await service.create(
      { resourceId: 4, slotIds: [10, 11], remark: "备注" },
      7,
    );

    expect(result).toEqual({ id: 12, status: "PENDING" });
    expect(tx.resourceSlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [10, 11] },
        resourceId: 4,
        status: "AVAILABLE",
      },
      data: { status: "BOOKED", version: { increment: 1 } },
    });
    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 7,
          resourceId: 4,
          status: "PENDING",
          remark: "备注",
        }),
      }),
    );
  });

  it("rejects duplicate slot ids before opening a transaction", async () => {
    await expect(
      service.create({ resourceId: 4, slotIds: [10, 10] }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns the existing booking for a repeated idempotency key", async () => {
    const existing = { id: 12, bookingNo: "BK-existing" };
    tx.booking.findFirst.mockResolvedValue(existing);

    await expect(
      service.create(
        { resourceId: 4, slotIds: [10], idempotencyKey: "request-1" },
        7,
      ),
    ).resolves.toBe(existing);
    expect(tx.resourceSlot.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back the booking when any requested slot is unavailable", async () => {
    tx.booking.findFirst.mockResolvedValue(null);
    tx.resource.findFirst.mockResolvedValue({ id: 4 });
    tx.resourceSlot.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.create({ resourceId: 4, slotIds: [10, 11] }, 7),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it("rejects bookings for inactive resources", async () => {
    tx.booking.findFirst.mockResolvedValue(null);
    tx.resource.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ resourceId: 4, slotIds: [10] }, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.resourceSlot.updateMany).not.toHaveBeenCalled();
  });
});
