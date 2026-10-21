import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ManageBookingStatus } from "./dto/update-booking-status.dto";
import { BookingsService } from "./bookings.service";

describe("BookingsService", () => {
  const tx = {
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    resource: {
      findFirst: jest.fn(),
    },
    resourceSlot: {
      updateMany: jest.fn(),
    },
    operationLog: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  };
  const prisma = {
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
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

  it("limits a resource admin's booking list to owned resources", async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);

    await service.listManaged({ page: "2", pageSize: "5" }, 7, false);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resource: { createdById: 7 } },
        skip: 5,
        take: 5,
      }),
    );
    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: { resource: { createdById: 7 } },
    });
  });

  it("allows system admins to list bookings for all resources", async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);

    await service.listManaged({}, 7, true);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(prisma.booking.count).toHaveBeenCalledWith({ where: {} });
  });

  it("counts booking statuses within the manager's resource scope", async () => {
    prisma.booking.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { _all: 2 } },
      { status: "CONFIRMED", _count: { _all: 1 } },
    ]);

    await expect(service.getManagedStats(7, false)).resolves.toEqual({
      total: 3,
      byStatus: {
        PENDING: 2,
        CONFIRMED: 1,
        CANCELLED: 0,
        REJECTED: 0,
        COMPLETED: 0,
      },
    });
    expect(prisma.booking.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: { resource: { createdById: 7 } },
      _count: { _all: true },
    });
  });

  it("counts all booking statuses for system admins", async () => {
    prisma.booking.groupBy.mockResolvedValue([]);

    await expect(service.getManagedStats(1, true)).resolves.toEqual({
      total: 0,
      byStatus: {
        PENDING: 0,
        CONFIRMED: 0,
        CANCELLED: 0,
        REJECTED: 0,
        COMPLETED: 0,
      },
    });
    expect(prisma.booking.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: {},
      _count: { _all: true },
    });
  });

  it("confirms a pending booking within the manager's resource scope", async () => {
    tx.booking.findFirst.mockResolvedValue({
      id: 12,
      status: "PENDING",
      bookingSlots: [{ slotId: 10 }],
    });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateManagedStatus(12, ManageBookingStatus.CONFIRMED, 7, false),
    ).resolves.toEqual({ id: 12, status: "CONFIRMED" });
    expect(tx.booking.findFirst).toHaveBeenCalledWith({
      where: {
        id: 12,
        resource: { createdById: 7 },
      },
      select: {
        id: true,
        status: true,
        bookingSlots: { select: { slotId: true } },
      },
    });
    expect(tx.resourceSlot.updateMany).not.toHaveBeenCalled();
    expect(tx.operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
        targetId: 12,
        metadata: { from: "PENDING", to: "CONFIRMED" },
      },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "BookingConfirmed",
        aggregateType: "BOOKING",
        aggregateId: 12,
        payload: { bookingId: 12, from: "PENDING", to: "CONFIRMED" },
      },
    });
  });

  it("rejects a pending booking and releases its slots", async () => {
    tx.booking.findFirst.mockResolvedValue({
      id: 12,
      status: "PENDING",
      bookingSlots: [{ slotId: 10 }, { slotId: 11 }],
    });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.resourceSlot.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.updateManagedStatus(12, ManageBookingStatus.REJECTED, 7, true),
    ).resolves.toEqual({ id: 12, status: "REJECTED" });
    expect(tx.resourceSlot.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] }, status: "BOOKED" },
      data: { status: "AVAILABLE", version: { increment: 1 } },
    });
    expect(tx.operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
        targetId: 12,
        metadata: { from: "PENDING", to: "REJECTED" },
      },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "BookingRejected",
        aggregateType: "BOOKING",
        aggregateId: 12,
        payload: { bookingId: 12, from: "PENDING", to: "REJECTED" },
      },
    });
  });

  it("completes a confirmed booking without releasing its slots", async () => {
    tx.booking.findFirst.mockResolvedValue({
      id: 12,
      status: "CONFIRMED",
      bookingSlots: [{ slotId: 10 }],
    });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateManagedStatus(12, ManageBookingStatus.COMPLETED, 7, false),
    ).resolves.toEqual({ id: 12, status: "COMPLETED" });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 12, status: "CONFIRMED" },
      data: { status: "COMPLETED" },
    });
    expect(tx.resourceSlot.updateMany).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "BookingCompleted",
        aggregateType: "BOOKING",
        aggregateId: 12,
        payload: { bookingId: 12, from: "CONFIRMED", to: "COMPLETED" },
      },
    });
  });

  it("does not let a manager process an out-of-scope booking", async () => {
    tx.booking.findFirst.mockResolvedValue(null);

    await expect(
      service.updateManagedStatus(12, ManageBookingStatus.CONFIRMED, 7, false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
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

  it("cancels a pending booking and releases its slots atomically", async () => {
    tx.booking.findFirst.mockResolvedValue({
      id: 12,
      status: "PENDING",
      bookingSlots: [{ slotId: 10 }, { slotId: 11 }],
    });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.resourceSlot.updateMany.mockResolvedValue({ count: 2 });

    await expect(service.cancelMine(12, 7)).resolves.toEqual({
      id: 12,
      status: "CANCELLED",
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: 12,
        userId: 7,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      data: { status: "CANCELLED" },
    });
    expect(tx.resourceSlot.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] }, status: "BOOKED" },
      data: { status: "AVAILABLE", version: { increment: 1 } },
    });
    expect(tx.operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
        targetId: 12,
        metadata: { from: "PENDING", to: "CANCELLED" },
      },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "BookingCancelled",
        aggregateType: "BOOKING",
        aggregateId: 12,
        payload: { bookingId: 12, from: "PENDING", to: "CANCELLED" },
      },
    });
  });

  it("cancels a confirmed booking and releases its slots", async () => {
    tx.booking.findFirst.mockResolvedValue({
      id: 12,
      status: "CONFIRMED",
      bookingSlots: [{ slotId: 10 }],
    });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.resourceSlot.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancelMine(12, 7)).resolves.toEqual({
      id: 12,
      status: "CANCELLED",
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 12, userId: 7, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED" },
    });
  });

  it("does not cancel another user's booking", async () => {
    tx.booking.findFirst.mockResolvedValue(null);

    await expect(service.cancelMine(12, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it("rejects cancellation after a booking leaves cancellable status", async () => {
    tx.booking.findFirst.mockResolvedValue({
      id: 12,
      status: "COMPLETED",
      bookingSlots: [{ slotId: 10 }],
    });

    await expect(service.cancelMine(12, 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.resourceSlot.updateMany).not.toHaveBeenCalled();
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
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "BookingCreated",
        aggregateType: "BOOKING",
        aggregateId: 12,
        payload: { bookingId: 12, userId: 7, resourceId: 4 },
      },
    });
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
