import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ResourcesService } from "./resources.service";

describe("ResourcesService", () => {
  const resource = {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const operationLog = { create: jest.fn() };
  const resourceRule = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };
  const resourceUnavailableDate = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const resourceSlot = {
    createMany: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const service = new ResourcesService({
    resource,
    resourceRule,
    resourceUnavailableDate,
    resourceSlot,
    operationLog,
    $transaction: jest.fn(async (callback) =>
      callback({
        resource,
        operationLog,
        resourceRule,
        resourceUnavailableDate,
        resourceSlot,
      }),
    ),
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it("lists only active resources with pagination and keyword filters", async () => {
    resource.findMany.mockResolvedValue([]);
    resource.count.mockResolvedValue(0);

    await service.list({ page: "2", pageSize: "5", keyword: "ROOM" });

    expect(resource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          OR: [{ code: { contains: "ROOM" } }, { name: { contains: "ROOM" } }],
        },
        skip: 5,
        take: 5,
      }),
    );
  });

  it("rejects invalid pagination values", async () => {
    await expect(service.list({ page: "0" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.list({ pageSize: "101" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("scopes the management list to the creator unless system admin", async () => {
    resource.findMany.mockResolvedValue([]);
    resource.count.mockResolvedValue(0);

    await service.listManaged({}, 7, false);
    expect(resource.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { createdById: 7 } }),
    );

    await service.listManaged({}, 7, true);
    expect(resource.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("records the creator and writes a creation log", async () => {
    resource.create.mockResolvedValue({
      id: 1,
      code: "ROOM_1",
      name: "Room 1",
    });

    await expect(
      service.create({ code: "ROOM_1", name: "Room 1" }, 7),
    ).resolves.toEqual({ id: 1, code: "ROOM_1", name: "Room 1" });

    expect(resource.create).toHaveBeenCalledWith({
      data: { code: "ROOM_1", name: "Room 1", createdById: 7 },
    });
    expect(operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "RESOURCE_CREATED",
        targetType: "RESOURCE",
        targetId: 1,
        metadata: { code: "ROOM_1", name: "Room 1" },
      },
    });
  });

  it("maps duplicate resource codes to a conflict", async () => {
    resource.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );

    await expect(
      service.create({ code: "ROOM_1", name: "Room 1" }, 7),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("limits resource administrators to resources they created", async () => {
    resource.update.mockResolvedValue({ id: 1 });

    await service.update(1, { name: "New name" }, 7, false);

    expect(resource.update).toHaveBeenCalledWith({
      where: { id: 1, createdById: 7 },
      data: { name: "New name" },
    });
    expect(operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "RESOURCE_UPDATED",
        targetType: "RESOURCE",
        targetId: 1,
        metadata: { changedFields: ["name"] },
      },
    });
  });

  it("allows system administrators to update any resource", async () => {
    resource.update.mockResolvedValue({ id: 1 });

    await service.update(1, { name: "New name" }, 7, true);

    expect(resource.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: "New name" },
    });
    expect(operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: 7,
        action: "RESOURCE_UPDATED",
        targetType: "RESOURCE",
        targetId: 1,
      }),
    });
  });

  it("changes resource status and records the transition", async () => {
    resource.findFirst.mockResolvedValue({
      id: 1,
      code: "ROOM_1",
      name: "Room 1",
      status: "ACTIVE",
    });
    resource.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.setStatus(1, "INACTIVE", 7, false)).resolves.toEqual({
      id: 1,
      status: "INACTIVE",
    });
    expect(resource.findFirst).toHaveBeenCalledWith({
      where: { id: 1, createdById: 7 },
      select: { id: true, code: true, name: true, status: true },
    });
    expect(resource.updateMany).toHaveBeenCalledWith({
      where: { id: 1, createdById: 7, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    expect(operationLog.create).toHaveBeenLastCalledWith({
      data: {
        operatorId: 7,
        action: "RESOURCE_STATUS_CHANGED",
        targetType: "RESOURCE",
        targetId: 1,
        metadata: { code: "ROOM_1", from: "ACTIVE", to: "INACTIVE" },
      },
    });
  });

  it("returns not found when the resource is not owned by the administrator", async () => {
    resource.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("not found", {
        code: "P2025",
        clientVersion: "6.19.3",
      }),
    );

    await expect(
      service.update(1, { name: "New name" }, 7, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an empty update", async () => {
    expect(() => service.update(1, {}, 7, false)).toThrow(BadRequestException);
  });

  it("creates a rule with validated time and date values", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceRule.create.mockResolvedValue({ id: 9 });

    await service.createRule(
      4,
      {
        weekday: 1,
        startTime: "09:00",
        endTime: "10:00",
        slotMinutes: 30,
        effectiveFrom: "2026-10-01",
      },
      7,
      false,
    );

    expect(resourceRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resourceId: 4,
        weekday: 1,
        slotMinutes: 30,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T10:00:00.000Z"),
        effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
        effectiveTo: null,
      }),
    });
    expect(operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "RESOURCE_RULE_CREATED",
        targetType: "RESOURCE",
        targetId: 4,
        metadata: {
          ruleId: 9,
          weekday: 1,
          startTime: "09:00",
          endTime: "10:00",
          slotMinutes: 30,
          effectiveFrom: "2026-10-01",
          effectiveTo: null,
        },
      },
    });
  });

  it("rejects a rule whose duration is not divisible by its slot length", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });

    await expect(
      service.createRule(
        4,
        {
          weekday: 1,
          startTime: "09:00",
          endTime: "10:10",
          slotMinutes: 30,
          effectiveFrom: "2026-10-01",
        },
        7,
        false,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRule.create).not.toHaveBeenCalled();
  });

  it("prevents a resource administrator from listing another owner's rules", async () => {
    resource.findFirst.mockResolvedValue(null);

    await expect(service.listRules(4, 7, false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(resourceRule.findMany).not.toHaveBeenCalled();
  });

  it("updates a rule after validating merged values", async () => {
    resourceRule.findFirst.mockResolvedValue({
      id: 9,
      resourceId: 4,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      slotMinutes: 30,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    resourceRule.update.mockResolvedValue({
      id: 9,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T11:00:00.000Z"),
      slotMinutes: 30,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: null,
    });

    await service.updateRule(4, 9, { endTime: "11:00" }, 7, false);

    expect(resourceRule.findFirst).toHaveBeenCalledWith({
      where: {
        id: 9,
        resourceId: 4,
        resource: { is: { createdById: 7 } },
      },
    });
    expect(resourceRule.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { endTime: new Date("1970-01-01T11:00:00.000Z") },
    });
    expect(operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "RESOURCE_RULE_UPDATED",
        targetType: "RESOURCE",
        targetId: 4,
        metadata: {
          ruleId: 9,
          before: {
            weekday: 1,
            startTime: "09:00",
            endTime: "10:00",
            slotMinutes: 30,
            effectiveFrom: "2026-10-01",
            effectiveTo: null,
          },
          after: {
            weekday: 1,
            startTime: "09:00",
            endTime: "11:00",
            slotMinutes: 30,
            effectiveFrom: "2026-10-01",
            effectiveTo: null,
          },
          changedFields: ["endTime"],
        },
      },
    });
  });

  it("rejects an update that makes the merged rule invalid", async () => {
    resourceRule.findFirst.mockResolvedValue({
      id: 9,
      resourceId: 4,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      slotMinutes: 30,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: null,
    });

    await expect(
      service.updateRule(4, 9, { endTime: "10:10" }, 7, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRule.update).not.toHaveBeenCalled();
  });

  it("allows clearing a rule's effective end date", async () => {
    resourceRule.findFirst.mockResolvedValue({
      id: 9,
      resourceId: 4,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      slotMinutes: 30,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-01T00:00:00.000Z"),
    });
    resourceRule.update.mockResolvedValue({
      id: 9,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      slotMinutes: 30,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: null,
    });

    await service.updateRule(4, 9, { effectiveTo: null }, 7, false);

    expect(resourceRule.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { effectiveTo: null },
    });
  });

  it("deletes only a rule belonging to the requested resource and owner", async () => {
    resourceRule.findFirst.mockResolvedValue({
      id: 9,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      slotMinutes: 30,
      effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    resourceRule.deleteMany.mockResolvedValue({ count: 1 });

    await service.deleteRule(4, 9, 7, false);

    expect(resourceRule.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 9,
        resourceId: 4,
        resource: { is: { createdById: 7 } },
      },
    });
    expect(operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "RESOURCE_RULE_DELETED",
        targetType: "RESOURCE",
        targetId: 4,
        metadata: {
          ruleId: 9,
          rule: {
            weekday: 1,
            startTime: "09:00",
            endTime: "10:00",
            slotMinutes: 30,
            effectiveFrom: "2026-10-01",
            effectiveTo: null,
          },
        },
      },
    });
  });

  it("lists unavailable dates in date order after checking resource access", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceUnavailableDate.findMany.mockResolvedValue([]);

    await service.listUnavailableDates(4, 7, false);

    expect(resourceUnavailableDate.findMany).toHaveBeenCalledWith({
      where: { resourceId: 4 },
      orderBy: { date: "asc" },
    });
  });

  it("creates an unavailable date and maps duplicates to conflict", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceUnavailableDate.create.mockResolvedValue({ id: 10 });

    await service.createUnavailableDate(
      4,
      { date: "2026-11-01", reason: "节假日" },
      7,
      false,
    );

    expect(resourceUnavailableDate.create).toHaveBeenCalledWith({
      data: {
        resourceId: 4,
        date: new Date("2026-11-01T00:00:00.000Z"),
        reason: "节假日",
      },
    });

    resourceUnavailableDate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    await expect(
      service.createUnavailableDate(4, { date: "2026-11-01" }, 7, false),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects invalid unavailable dates before writing", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });

    await expect(
      service.createUnavailableDate(4, { date: "2026-02-30" }, 7, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceUnavailableDate.create).not.toHaveBeenCalled();
  });

  it("deletes only an unavailable date belonging to the resource", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceUnavailableDate.deleteMany.mockResolvedValue({ count: 1 });

    await service.deleteUnavailableDate(4, 10, 7, false);

    expect(resourceUnavailableDate.deleteMany).toHaveBeenCalledWith({
      where: { id: 10, resourceId: 4 },
    });
  });

  it("generates idempotent slots from the active weekday rules", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceUnavailableDate.findFirst = jest.fn().mockResolvedValue(null);
    resourceRule.findMany.mockResolvedValue([
      {
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T10:00:00.000Z"),
        slotMinutes: 30,
      },
    ]);
    resourceSlot.findMany.mockResolvedValue([]);
    resourceSlot.createMany.mockResolvedValue({ count: 2 });

    const result = await service.generateSlots(
      4,
      { date: "2026-10-19" },
      7,
      false,
    );

    expect(result).toEqual({
      date: "2026-10-19",
      created: 2,
      updated: 0,
      removed: 0,
      skipped: false,
    });
    expect(resourceSlot.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          resourceId: 4,
          startAt: new Date("2026-10-19T09:00:00.000Z"),
          endAt: new Date("2026-10-19T09:30:00.000Z"),
          status: "AVAILABLE",
          version: 0,
        }),
        expect.objectContaining({
          resourceId: 4,
          startAt: new Date("2026-10-19T09:30:00.000Z"),
          endAt: new Date("2026-10-19T10:00:00.000Z"),
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it("deduplicates overlapping rules and skips unavailable dates", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceUnavailableDate.findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 20 });
    resourceRule.findMany.mockResolvedValue([
      {
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T10:00:00.000Z"),
        slotMinutes: 30,
      },
      {
        startTime: new Date("1970-01-01T09:30:00.000Z"),
        endTime: new Date("1970-01-01T10:30:00.000Z"),
        slotMinutes: 30,
      },
    ]);
    resourceSlot.findMany.mockResolvedValue([]);
    resourceSlot.createMany.mockResolvedValue({ count: 3 });

    await service.generateSlots(4, { date: "2026-10-19" }, 7, false);
    expect(resourceSlot.createMany.mock.calls[0][0].data).toHaveLength(3);

    await expect(
      service.generateSlots(4, { date: "2026-10-20" }, 7, false),
    ).resolves.toEqual({
      date: "2026-10-20",
      created: 0,
      updated: 0,
      removed: 0,
      skipped: true,
    });
    expect(resourceSlot.createMany).toHaveBeenCalledTimes(1);
  });

  it("synchronizes changed rules without touching booked slots", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceUnavailableDate.findFirst.mockResolvedValue(null);
    resourceRule.findMany.mockResolvedValue([
      {
        startTime: new Date("1970-01-01T18:00:00.000Z"),
        endTime: new Date("1970-01-01T20:00:00.000Z"),
        slotMinutes: 60,
      },
    ]);
    resourceSlot.findMany.mockResolvedValue([
      {
        id: 1,
        startAt: new Date("2026-10-21T13:00:00.000Z"),
        endAt: new Date("2026-10-21T14:00:00.000Z"),
        status: "AVAILABLE",
      },
      {
        id: 2,
        startAt: new Date("2026-10-21T18:00:00.000Z"),
        endAt: new Date("2026-10-21T19:00:00.000Z"),
        status: "BOOKED",
      },
      {
        id: 3,
        startAt: new Date("2026-10-21T19:00:00.000Z"),
        endAt: new Date("2026-10-21T19:30:00.000Z"),
        status: "AVAILABLE",
      },
    ]);
    resourceSlot.deleteMany.mockResolvedValue({ count: 1 });
    resourceSlot.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.generateSlots(4, { date: "2026-10-21" }, 7, false),
    ).resolves.toEqual({
      date: "2026-10-21",
      created: 0,
      updated: 1,
      removed: 1,
      skipped: false,
    });
    expect(resourceSlot.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, status: "AVAILABLE" },
    });
    expect(resourceSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 3, status: "AVAILABLE" },
      data: {
        endAt: new Date("2026-10-21T20:00:00.000Z"),
        version: { increment: 1 },
      },
    });
    expect(resourceSlot.createMany).not.toHaveBeenCalled();
  });

  it("lists available slots for an active resource in start order", async () => {
    resource.findFirst.mockResolvedValue({ id: 4 });
    resourceSlot.findMany.mockResolvedValue([]);

    await service.listAvailableSlots(4, { date: "2026-10-19" });

    expect(resourceSlot.findMany).toHaveBeenCalledWith({
      where: {
        resourceId: 4,
        slotDate: new Date("2026-10-19T00:00:00.000Z"),
        status: "AVAILABLE",
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        slotDate: true,
        startAt: true,
        endAt: true,
        status: true,
      },
    });
  });

  it("does not expose slots for an inactive or missing resource", async () => {
    resource.findFirst.mockResolvedValue(null);

    await expect(
      service.listAvailableSlots(4, { date: "2026-10-19" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resourceSlot.findMany).not.toHaveBeenCalled();
  });
});
