import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ListBookingsDto } from "./dto/list-bookings.dto";

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(query: ListBookingsDto, userId: number) {
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

        return tx.booking.create({
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
