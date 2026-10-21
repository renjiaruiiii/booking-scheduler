import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BookingStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ListBookingsDto } from "./dto/list-bookings.dto";
import { ManageBookingStatus } from "./dto/update-booking-status.dto";

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(query: ListBookingsDto, userId: number) {
    const { page, pageSize } = this.pagination(query);
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          resource: { select: { id: true, code: true, name: true } },
          bookingSlots: { include: { slot: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async listManaged(
    query: ListBookingsDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    const { page, pageSize } = this.pagination(query);
    const where = this.managedBookingWhere(userId, isSystemAdmin);
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, email: true } },
          resource: { select: { id: true, code: true, name: true } },
          bookingSlots: { include: { slot: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getManagedStats(userId: number, isSystemAdmin: boolean) {
    const groups = await this.prisma.booking.groupBy({
      by: ["status"],
      where: this.managedBookingWhere(userId, isSystemAdmin),
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      Object.values(BookingStatus).map((status) => [status, 0]),
    ) as Record<BookingStatus, number>;

    for (const group of groups) byStatus[group.status] = group._count._all;

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
    };
  }

  private managedBookingWhere(
    userId: number,
    isSystemAdmin: boolean,
  ): Prisma.BookingWhereInput {
    return isSystemAdmin ? {} : { resource: { createdById: userId } };
  }

  async updateManagedStatus(
    id: number,
    status: ManageBookingStatus,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const nextStatus =
        status === ManageBookingStatus.CONFIRMED
          ? "CONFIRMED"
          : status === ManageBookingStatus.REJECTED
            ? "REJECTED"
            : "COMPLETED";
      const booking = await tx.booking.findFirst({
        where: {
          id,
          ...(isSystemAdmin ? {} : { resource: { createdById: userId } }),
        },
        select: {
          id: true,
          status: true,
          bookingSlots: { select: { slotId: true } },
        },
      });
      if (!booking) throw new NotFoundException("预约不存在或无权操作");

      const pendingTransition =
        booking.status === "PENDING" &&
        (nextStatus === "CONFIRMED" || nextStatus === "REJECTED");
      const completionTransition =
        booking.status === "CONFIRMED" && nextStatus === "COMPLETED";
      if (!pendingTransition && !completionTransition) {
        throw new ConflictException("当前预约状态不允许此操作");
      }

      const updated = await tx.booking.updateMany({
        where: { id, status: booking.status },
        data: { status: nextStatus },
      });
      if (updated.count !== 1) {
        throw new ConflictException("预约状态已变更，请刷新后重试");
      }

      if (nextStatus === "REJECTED") {
        const slotIds = booking.bookingSlots.map(({ slotId }) => slotId);
        const released = await tx.resourceSlot.updateMany({
          where: { id: { in: slotIds }, status: "BOOKED" },
          data: { status: "AVAILABLE", version: { increment: 1 } },
        });
        if (released.count !== slotIds.length) {
          throw new ConflictException("预约时间片状态异常，拒绝未完成");
        }
      }

      await tx.operationLog.create({
        data: {
          operatorId: userId,
          action: "BOOKING_STATUS_CHANGED",
          targetType: "BOOKING",
          targetId: id,
          metadata: { from: booking.status, to: nextStatus },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: `Booking${nextStatus[0]}${nextStatus.slice(1).toLowerCase()}`,
          aggregateType: "BOOKING",
          aggregateId: id,
          payload: { bookingId: id, from: booking.status, to: nextStatus },
        },
      });

      return { id, status };
    });
  }

  private pagination(query: ListBookingsDto) {
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

  async getMine(id: number, userId: number) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: {
        resource: { select: { id: true, code: true, name: true } },
        bookingSlots: { include: { slot: true } },
      },
    });
    if (!booking) throw new NotFoundException("预约不存在");
    return booking;
  }

  async cancelMine(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id, userId },
        select: {
          id: true,
          status: true,
          bookingSlots: { select: { slotId: true } },
        },
      });
      if (!booking) throw new NotFoundException("预约不存在");
      if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
        throw new ConflictException("只有待确认或已确认预约可以取消");
      }

      const updated = await tx.booking.updateMany({
        where: { id, userId, status: { in: ["PENDING", "CONFIRMED"] } },
        data: { status: "CANCELLED" },
      });
      if (updated.count !== 1) {
        throw new ConflictException("预约状态已变更，请刷新后重试");
      }

      const slotIds = booking.bookingSlots.map(({ slotId }) => slotId);
      const released = await tx.resourceSlot.updateMany({
        where: { id: { in: slotIds }, status: "BOOKED" },
        data: { status: "AVAILABLE", version: { increment: 1 } },
      });
      if (released.count !== slotIds.length) {
        throw new ConflictException("预约时间片状态异常，取消未完成");
      }

      await tx.operationLog.create({
        data: {
          operatorId: userId,
          action: "BOOKING_STATUS_CHANGED",
          targetType: "BOOKING",
          targetId: id,
          metadata: { from: booking.status, to: "CANCELLED" },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "BookingCancelled",
          aggregateType: "BOOKING",
          aggregateId: id,
          payload: { bookingId: id, from: booking.status, to: "CANCELLED" },
        },
      });

      return { id, status: "CANCELLED" as const };
    });
  }

  async create(dto: CreateBookingDto, userId: number) {
    const slotIds = [...new Set(dto.slotIds)];
    if (slotIds.length !== dto.slotIds.length) {
      throw new BadRequestException("slotIds 不能重复");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.idempotencyKey) {
          const existing = await tx.booking.findFirst({
            where: { userId, idempotencyKey: dto.idempotencyKey },
            include: { bookingSlots: true },
          });
          if (existing) return existing;
        }

        const resource = await tx.resource.findFirst({
          where: { id: dto.resourceId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!resource) throw new NotFoundException("资源不存在或未启用");

        const claimed = await tx.resourceSlot.updateMany({
          where: {
            id: { in: slotIds },
            resourceId: dto.resourceId,
            status: "AVAILABLE",
          },
          data: { status: "BOOKED", version: { increment: 1 } },
        });
        if (claimed.count !== slotIds.length) {
          throw new ConflictException("部分时间片已不可预约");
        }

        const booking = await tx.booking.create({
          data: {
            bookingNo: `BK-${randomUUID()}`,
            userId,
            resourceId: dto.resourceId,
            status: "PENDING",
            remark: dto.remark,
            idempotencyKey: dto.idempotencyKey,
            bookingSlots: {
              create: slotIds.map((slotId) => ({
                slot: { connect: { id: slotId } },
              })),
            },
          },
          include: { bookingSlots: true },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: "BookingCreated",
            aggregateType: "BOOKING",
            aggregateId: booking.id,
            payload: {
              bookingId: booking.id,
              userId,
              resourceId: dto.resourceId,
            },
          },
        });
        return booking;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("幂等键已被使用");
      }
      throw error;
    }
  }
}
