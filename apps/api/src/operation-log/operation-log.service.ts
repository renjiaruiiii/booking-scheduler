import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ListOperationLogsDto } from "./dto/list-operation-logs.dto";

@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOperationLogsDto) {
    const { page, pageSize } = this.pagination(query);
    const where: Prisma.OperationLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          operator: { select: { id: true, username: true, email: true } },
        },
      }),
      this.prisma.operationLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  private pagination(query: ListOperationLogsDto) {
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
