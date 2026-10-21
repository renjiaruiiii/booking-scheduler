import { BadRequestException } from "@nestjs/common";
import { OperationLogService } from "./operation-log.service";

describe("OperationLogService", () => {
  const prisma = {
    operationLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it("lists logs with operator summaries and filters", async () => {
    const items = [
      {
        id: 1,
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
        operator: { id: 7, username: "admin", email: "admin@example.com" },
      },
    ];
    prisma.operationLog.findMany.mockResolvedValue(items);
    prisma.operationLog.count.mockResolvedValue(1);

    const service = new OperationLogService(prisma as never);
    await expect(
      service.list({
        page: "2",
        pageSize: "5",
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
      }),
    ).resolves.toEqual({ items, total: 1, page: 2, pageSize: 5 });

    expect(prisma.operationLog.findMany).toHaveBeenCalledWith({
      where: {
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
      },
      orderBy: { createdAt: "desc" },
      skip: 5,
      take: 5,
      include: {
        operator: { select: { id: true, username: true, email: true } },
      },
    });
  });

  it("rejects invalid pagination", async () => {
    const service = new OperationLogService(prisma as never);

    await expect(service.list({ pageSize: "101" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
