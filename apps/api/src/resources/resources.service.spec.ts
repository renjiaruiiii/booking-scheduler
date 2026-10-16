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
  };
  const resourceRule = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };
  const resourceUnavailableDate = {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const service = new ResourcesService({
    resource,
    resourceRule,
    resourceUnavailableDate,
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

  it("records the creator when creating a resource", async () => {
    resource.create.mockResolvedValue({ id: 1 });

    await service.create({ code: "ROOM_1", name: "Room 1" }, 7);

    expect(resource.create).toHaveBeenCalledWith({
      data: { code: "ROOM_1", name: "Room 1", createdById: 7 },
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
  });

  it("allows system administrators to update any resource", async () => {
    resource.update.mockResolvedValue({ id: 1 });

    await service.update(1, { name: "New name" }, 7, true);

    expect(resource.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: "New name" },
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
    resourceRule.update.mockResolvedValue({ id: 9 });

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
    resourceRule.update.mockResolvedValue({ id: 9 });

    await service.updateRule(4, 9, { effectiveTo: null }, 7, false);

    expect(resourceRule.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { effectiveTo: null },
    });
  });

  it("deletes only a rule belonging to the requested resource and owner", async () => {
    resourceRule.deleteMany.mockResolvedValue({ count: 1 });

    await service.deleteRule(4, 9, 7, false);

    expect(resourceRule.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 9,
        resourceId: 4,
        resource: { is: { createdById: 7 } },
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
});
