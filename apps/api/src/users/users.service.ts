import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ListUsersDto } from "./dto/list-users.dto";
import { UserRoleCode } from "./dto/update-user-roles.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersDto) {
    const { page, pageSize } = this.pagination(query);
    const keyword = query.keyword?.trim();
    const where: Prisma.UserWhereInput = {
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { email: { contains: keyword } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
          roles: {
            select: { role: { select: { id: true, code: true, name: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map(({ roles, ...user }) => ({
      ...user,
      roles: roles.map(({ role }) => role),
    }));
    return { items, total, page, pageSize };
  }

  async updateStatus(id: number, status: UserStatus, operatorId: number) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!user) throw new NotFoundException("用户不存在");
      if (id === operatorId && status === UserStatus.DISABLED) {
        throw new ConflictException("不能停用当前登录账号");
      }
      if (user.status === status) return { id, status };

      const updated = await tx.user.updateMany({
        where: { id, status: user.status },
        data: { status },
      });
      if (updated.count !== 1) {
        throw new ConflictException("用户状态已变更，请刷新后重试");
      }

      await tx.operationLog.create({
        data: {
          operatorId,
          action: "USER_STATUS_CHANGED",
          targetType: "USER",
          targetId: id,
          metadata: { from: user.status, to: status },
        },
      });

      return { id, status };
    });
  }

  async updateRoles(id: number, roles: UserRoleCode[], operatorId: number) {
    if (id === operatorId) {
      throw new ConflictException("不能修改当前登录账号的角色");
    }
    if (!roles.includes(UserRoleCode.USER)) {
      throw new BadRequestException("角色列表必须保留 USER");
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          roles: { select: { role: { select: { code: true } } } },
        },
      });
      if (!user) throw new NotFoundException("用户不存在");

      const currentRoles = user.roles.map(({ role }) => role.code).sort();
      const nextRoles = [...roles].sort();
      if (
        currentRoles.length === nextRoles.length &&
        currentRoles.every((role, index) => role === nextRoles[index])
      ) {
        return { id, roles: nextRoles };
      }

      const roleRecords = await tx.role.findMany({
        where: { code: { in: nextRoles } },
        select: { id: true, code: true },
      });
      if (roleRecords.length !== nextRoles.length) {
        throw new BadRequestException("角色数据尚未初始化");
      }

      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleRecords.map(({ id: roleId }) => ({ userId: id, roleId })),
      });
      await tx.operationLog.create({
        data: {
          operatorId,
          action: "USER_ROLES_CHANGED",
          targetType: "USER",
          targetId: id,
          metadata: { from: currentRoles, to: nextRoles },
        },
      });

      return { id, roles: nextRoles };
    });
  }

  private pagination(query: ListUsersDto) {
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
}
