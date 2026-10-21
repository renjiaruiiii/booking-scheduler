import { BadRequestException, ConflictException } from "@nestjs/common";
import { UserRoleCode } from "./dto/update-user-roles.dto";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    role: { findMany: jest.fn() },
    userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    operationLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  it("lists users with role summaries and filters", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 7,
        username: "admin",
        email: "admin@example.com",
        status: "ACTIVE",
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        roles: [{ role: { id: 2, code: "SYSTEM_ADMIN", name: "系统管理员" } }],
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const service = new UsersService(prisma as never);
    await expect(
      service.list({
        page: "2",
        pageSize: "5",
        keyword: "admin",
        status: "ACTIVE",
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 7,
          username: "admin",
          email: "admin@example.com",
          status: "ACTIVE",
          createdAt: new Date("2026-10-20T00:00:00.000Z"),
          roles: [{ id: 2, code: "SYSTEM_ADMIN", name: "系统管理员" }],
        },
      ],
      total: 1,
      page: 2,
      pageSize: 5,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: { contains: "admin" } },
          { email: { contains: "admin" } },
        ],
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      skip: 5,
      take: 5,
      select: expect.any(Object),
    });
  });

  it("rejects invalid pagination", async () => {
    const service = new UsersService(prisma as never);

    await expect(service.list({ page: "0" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("updates status and records an operation log", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 8, status: "ACTIVE" });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const service = new UsersService(prisma as never);

    await expect(service.updateStatus(8, "DISABLED", 7)).resolves.toEqual({
      id: 8,
      status: "DISABLED",
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 8, status: "ACTIVE" },
      data: { status: "DISABLED" },
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "USER_STATUS_CHANGED",
        targetType: "USER",
        targetId: 8,
        metadata: { from: "ACTIVE", to: "DISABLED" },
      },
    });
  });

  it("does not allow an administrator to disable their own account", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, status: "ACTIVE" });
    const service = new UsersService(prisma as never);

    await expect(service.updateStatus(7, "DISABLED", 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("replaces roles and records the change in one transaction", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 8,
      roles: [{ role: { code: "USER" } }],
    });
    prisma.role.findMany.mockResolvedValue([
      { id: 1, code: "USER" },
      { id: 2, code: "RESOURCE_ADMIN" },
    ]);

    const service = new UsersService(prisma as never);
    await expect(
      service.updateRoles(
        8,
        [UserRoleCode.USER, UserRoleCode.RESOURCE_ADMIN],
        7,
      ),
    ).resolves.toEqual({ id: 8, roles: ["RESOURCE_ADMIN", "USER"] });
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 8 },
    });
    expect(prisma.userRole.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 8, roleId: 1 },
        { userId: 8, roleId: 2 },
      ],
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: {
        operatorId: 7,
        action: "USER_ROLES_CHANGED",
        targetType: "USER",
        targetId: 8,
        metadata: {
          from: ["USER"],
          to: ["RESOURCE_ADMIN", "USER"],
        },
      },
    });
  });

  it("rejects self role changes and role sets without USER", async () => {
    const service = new UsersService(prisma as never);

    await expect(
      service.updateRoles(7, [UserRoleCode.USER, UserRoleCode.SYSTEM_ADMIN], 7),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.updateRoles(8, [UserRoleCode.RESOURCE_ADMIN], 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
