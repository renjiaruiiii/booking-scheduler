import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ResourceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateResourceDto } from "./dto/create-resource.dto";
import { CreateResourceRuleDto } from "./dto/create-resource-rule.dto";
import { CreateResourceUnavailableDateDto } from "./dto/create-resource-unavailable-date.dto";
import { GenerateResourceSlotsDto } from "./dto/generate-resource-slots.dto";
import { GenerateResourceSlotsRangeDto } from "./dto/generate-resource-slots-range.dto";
import { ListResourceSlotsDto } from "./dto/list-resource-slots.dto";
import { UpdateResourceRuleDto } from "./dto/update-resource-rule.dto";
import { ListResourcesDto } from "./dto/list-resources.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  list(query: ListResourcesDto) {
    return this.listWhere(query, { status: "ACTIVE" }, true);
  }

  listManaged(query: ListResourcesDto, userId: number, isSystemAdmin: boolean) {
    return this.listWhere(query, isSystemAdmin ? {} : { createdById: userId });
  }

  private async listWhere(
    query: ListResourcesDto,
    scope: Prisma.ResourceWhereInput,
    cache = false,
  ) {
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
    const cacheKey = cache
      ? `resource-cache:list:${page}:${pageSize}:${query.keyword ?? ""}`
      : undefined;
    if (cacheKey) {
      const cached = await this.redis?.getJson<{
        items: unknown[];
        total: number;
        page: number;
        pageSize: number;
      }>(cacheKey);
      if (cached) return cached;
    }
    const where: Prisma.ResourceWhereInput = {
      ...scope,
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword } },
              { name: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.resource.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.resource.count({ where }),
    ]);

    const result = { items, total, page, pageSize };
    if (cacheKey) await this.redis?.setJson(cacheKey, result, 30);
    return result;
  }

  async get(id: number) {
    const cacheKey = `resource-cache:detail:${id}`;
    const cached = await this.redis?.getJson(cacheKey);
    if (cached) return cached;

    const resource = await this.prisma.resource.findFirst({
      where: { id, status: "ACTIVE" },
    });
    if (!resource) throw new NotFoundException("资源不存在");
    await this.redis?.setJson(cacheKey, resource, 30);
    return resource;
  }

  async create(dto: CreateResourceDto, userId: number) {
    try {
      const resource = await this.prisma.$transaction(async (tx) => {
        const resource = await tx.resource.create({
          data: { ...dto, createdById: userId },
        });
        await tx.operationLog.create({
          data: {
            operatorId: userId,
            action: "RESOURCE_CREATED",
            targetType: "RESOURCE",
            targetId: resource.id,
            metadata: { code: resource.code, name: resource.name },
          },
        });
        return resource;
      });
      await this.invalidateCache();
      return resource;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("资源编码已存在");
      }
      throw error;
    }
  }

  update(
    id: number,
    dto: UpdateResourceDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException("至少提供一个要更新的字段");
    }
    return this.updateOwnedResource(id, dto, userId, isSystemAdmin);
  }

  async setStatus(
    id: number,
    status: ResourceStatus,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const where = isSystemAdmin ? { id } : { id, createdById: userId };
      const resource = await tx.resource.findFirst({
        where,
        select: { id: true, code: true, name: true, status: true },
      });
      if (!resource) throw new NotFoundException("资源不存在或无权管理");
      if (resource.status === status) return { id, status };

      const updated = await tx.resource.updateMany({
        where: { ...where, status: resource.status },
        data: { status },
      });
      if (updated.count !== 1) {
        throw new ConflictException("资源状态已变更，请刷新后重试");
      }

      await tx.operationLog.create({
        data: {
          operatorId: userId,
          action: "RESOURCE_STATUS_CHANGED",
          targetType: "RESOURCE",
          targetId: id,
          metadata: { code: resource.code, from: resource.status, to: status },
        },
      });

      return { id, status };
    });
    await this.invalidateCache();
    return result;
  }

  async listRules(resourceId: number, userId: number, isSystemAdmin: boolean) {
    await this.requireManageAccess(resourceId, userId, isSystemAdmin);
    return this.prisma.resourceRule.findMany({
      where: { resourceId },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });
  }

  async createRule(
    resourceId: number,
    dto: CreateResourceRuleDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    await this.requireManageAccess(resourceId, userId, isSystemAdmin);

    const weekdays = dto.weekdays;
    if (!weekdays.length) {
      throw new BadRequestException("至少选择一个星期");
    }
    if (new Set(weekdays).size !== weekdays.length) {
      throw new BadRequestException("星期不能重复");
    }

    const startMinutes = this.parseTime(dto.startTime);
    const endMinutes = this.parseTime(dto.endTime);
    if (
      endMinutes <= startMinutes ||
      (endMinutes - startMinutes) % dto.slotMinutes !== 0
    ) {
      throw new BadRequestException(
        "结束时间必须晚于开始时间，且时长必须能被时间片长度整除",
      );
    }

    const effectiveFrom = this.parseDate(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo
      ? this.parseDate(dto.effectiveTo)
      : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException("生效结束日期不能早于开始日期");
    }

    return this.prisma.$transaction(async (tx) => {
      const rules = [];
      for (const weekday of weekdays) {
        const rule = await tx.resourceRule.create({
          data: {
            resourceId,
            weekday,
            startTime: this.timeValue(dto.startTime),
            endTime: this.timeValue(dto.endTime),
            slotMinutes: dto.slotMinutes,
            effectiveFrom,
            effectiveTo,
          },
        });
        rules.push(rule);
        await tx.operationLog.create({
          data: {
            operatorId: userId,
            action: "RESOURCE_RULE_CREATED",
            targetType: "RESOURCE",
            targetId: resourceId,
            metadata: {
              ruleId: rule.id,
              weekday,
              startTime: dto.startTime,
              endTime: dto.endTime,
              slotMinutes: dto.slotMinutes,
              effectiveFrom: dto.effectiveFrom,
              effectiveTo: dto.effectiveTo ?? null,
            },
          },
        });
      }
      return rules;
    });
  }

  async updateRule(
    resourceId: number,
    ruleId: number,
    dto: UpdateResourceRuleDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException("至少提供一个要更新的字段");
    }

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.resourceRule.findFirst({
        where: {
          id: ruleId,
          resourceId,
          ...(isSystemAdmin
            ? {}
            : { resource: { is: { createdById: userId } } }),
        },
      });
      if (!rule) throw new NotFoundException("规则不存在或无权管理");

      const startTime = dto.startTime ?? this.timeText(rule.startTime);
      const endTime = dto.endTime ?? this.timeText(rule.endTime);
      const slotMinutes = dto.slotMinutes ?? rule.slotMinutes;
      const startMinutes = this.parseTime(startTime);
      const endMinutes = this.parseTime(endTime);
      if (
        endMinutes <= startMinutes ||
        (endMinutes - startMinutes) % slotMinutes !== 0
      ) {
        throw new BadRequestException(
          "结束时间必须晚于开始时间，且时长必须能被时间片长度整除",
        );
      }

      const effectiveFrom = dto.effectiveFrom
        ? this.parseDate(dto.effectiveFrom)
        : rule.effectiveFrom;
      const effectiveTo =
        dto.effectiveTo === undefined
          ? rule.effectiveTo
          : dto.effectiveTo === null
            ? null
            : this.parseDate(dto.effectiveTo);
      if (effectiveTo && effectiveTo < effectiveFrom) {
        throw new BadRequestException("生效结束日期不能早于开始日期");
      }

      const data = {
        ...(dto.weekday === undefined ? {} : { weekday: dto.weekday }),
        ...(dto.startTime === undefined
          ? {}
          : { startTime: this.timeValue(dto.startTime) }),
        ...(dto.endTime === undefined
          ? {}
          : { endTime: this.timeValue(dto.endTime) }),
        ...(dto.slotMinutes === undefined
          ? {}
          : { slotMinutes: dto.slotMinutes }),
        ...(dto.effectiveFrom === undefined ? {} : { effectiveFrom }),
        ...(dto.effectiveTo === undefined ? {} : { effectiveTo }),
      };
      const updatedRule = await tx.resourceRule.update({
        where: { id: ruleId },
        data,
      });
      await tx.operationLog.create({
        data: {
          operatorId: userId,
          action: "RESOURCE_RULE_UPDATED",
          targetType: "RESOURCE",
          targetId: resourceId,
          metadata: {
            ruleId,
            before: this.ruleAuditSnapshot(rule),
            after: this.ruleAuditSnapshot(updatedRule),
            changedFields: Object.keys(data),
          },
        },
      });
      return updatedRule;
    });
  }

  async deleteRule(
    resourceId: number,
    ruleId: number,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const where = {
        id: ruleId,
        resourceId,
        ...(isSystemAdmin ? {} : { resource: { is: { createdById: userId } } }),
      };
      const rule = await tx.resourceRule.findFirst({ where });
      if (!rule) throw new NotFoundException("规则不存在或无权管理");

      const result = await tx.resourceRule.deleteMany({ where });
      if (!result.count) throw new NotFoundException("规则不存在或无权管理");
      await tx.operationLog.create({
        data: {
          operatorId: userId,
          action: "RESOURCE_RULE_DELETED",
          targetType: "RESOURCE",
          targetId: resourceId,
          metadata: { ruleId, rule: this.ruleAuditSnapshot(rule) },
        },
      });
      return { success: true };
    });
  }

  async listUnavailableDates(
    resourceId: number,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    await this.requireManageAccess(resourceId, userId, isSystemAdmin);
    return this.prisma.resourceUnavailableDate.findMany({
      where: { resourceId },
      orderBy: { date: "asc" },
    });
  }

  async createUnavailableDate(
    resourceId: number,
    dto: CreateResourceUnavailableDateDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    await this.requireManageAccess(resourceId, userId, isSystemAdmin);
    try {
      return await this.prisma.resourceUnavailableDate.create({
        data: {
          resourceId,
          date: this.parseDate(dto.date),
          reason: dto.reason,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("该资源在此日期已设置为排除日期");
      }
      throw error;
    }
  }

  async deleteUnavailableDate(
    resourceId: number,
    dateId: number,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    await this.requireManageAccess(resourceId, userId, isSystemAdmin);
    const result = await this.prisma.resourceUnavailableDate.deleteMany({
      where: { id: dateId, resourceId },
    });
    if (!result.count) {
      throw new NotFoundException("排除日期不存在");
    }
    return { success: true };
  }

  async generateSlots(
    resourceId: number,
    dto: GenerateResourceSlotsDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    await this.requireManageAccess(resourceId, userId, isSystemAdmin);
    const slotDate = this.parseDate(dto.date);
    return this.prisma.$transaction(async (tx) => {
      const unavailable = await tx.resourceUnavailableDate.findFirst({
        where: { resourceId, date: slotDate },
      });
      if (unavailable) {
        return {
          date: dto.date,
          created: 0,
          updated: 0,
          removed: 0,
          skipped: true,
        };
      }

      const weekday = slotDate.getUTCDay();
      const rules = await tx.resourceRule.findMany({
        where: {
          resourceId,
          weekday,
          effectiveFrom: { lte: slotDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: slotDate } }],
        },
      });
      const desiredSlots = new Map<
        string,
        {
          resourceId: number;
          slotDate: Date;
          startAt: Date;
          endAt: Date;
          status: "AVAILABLE";
          version: number;
        }
      >();

      for (const rule of rules) {
        const startAt = this.slotDateTime(
          dto.date,
          this.timeText(rule.startTime),
        );
        const endAt = this.slotDateTime(dto.date, this.timeText(rule.endTime));
        for (
          let current = startAt.getTime();
          current < endAt.getTime();
          current += rule.slotMinutes * 60_000
        ) {
          const slotStart = new Date(current);
          const slotEnd = new Date(current + rule.slotMinutes * 60_000);
          if (slotEnd > endAt) break;
          desiredSlots.set(slotStart.toISOString(), {
            resourceId,
            slotDate,
            startAt: slotStart,
            endAt: slotEnd,
            status: "AVAILABLE",
            version: 0,
          });
        }
      }

      const existingSlots = await tx.resourceSlot.findMany({
        where: { resourceId, slotDate },
        select: { id: true, startAt: true, endAt: true, status: true },
      });
      const existingByStart = new Map(
        existingSlots.map((slot) => [slot.startAt.toISOString(), slot]),
      );
      const obsoleteAvailableIds = existingSlots
        .filter(
          (slot) =>
            slot.status === "AVAILABLE" &&
            !desiredSlots.has(slot.startAt.toISOString()),
        )
        .map((slot) => slot.id);

      let removed = 0;
      if (obsoleteAvailableIds.length) {
        const result = await tx.resourceSlot.deleteMany({
          where: {
            id: { in: obsoleteAvailableIds },
            status: "AVAILABLE",
          },
        });
        removed = result.count;
      }

      let updated = 0;
      for (const desired of desiredSlots.values()) {
        const existing = existingByStart.get(desired.startAt.toISOString());
        if (
          existing?.status === "AVAILABLE" &&
          existing.endAt.getTime() !== desired.endAt.getTime()
        ) {
          const result = await tx.resourceSlot.updateMany({
            where: { id: existing.id, status: "AVAILABLE" },
            data: { endAt: desired.endAt, version: { increment: 1 } },
          });
          updated += result.count;
        }
      }

      const newSlots = [...desiredSlots.values()].filter(
        (slot) => !existingByStart.has(slot.startAt.toISOString()),
      );
      let created = 0;
      if (newSlots.length) {
        const result = await tx.resourceSlot.createMany({
          data: newSlots,
          skipDuplicates: true,
        });
        created = result.count;
      }

      return { date: dto.date, created, updated, removed, skipped: false };
    });
  }

  async generateSlotsRange(
    resourceId: number,
    dto: GenerateResourceSlotsRangeDto,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    const from = this.parseDate(dto.from);
    const to = this.parseDate(dto.to);
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days < 1) {
      throw new BadRequestException("结束日期不能早于开始日期");
    }
    if (days > 90) {
      throw new BadRequestException("一次最多生成 90 天的时间片");
    }

    let created = 0;
    let updated = 0;
    let removed = 0;
    let skippedDays = 0;
    for (let index = 0; index < days; index += 1) {
      const current = new Date(from);
      current.setUTCDate(current.getUTCDate() + index);
      const result = await this.generateSlots(
        resourceId,
        { date: current.toISOString().slice(0, 10) },
        userId,
        isSystemAdmin,
      );
      created += result.created;
      updated += result.updated;
      removed += result.removed;
      if (result.skipped) skippedDays += 1;
    }

    return {
      from: dto.from,
      to: dto.to,
      days,
      created,
      updated,
      removed,
      skippedDays,
    };
  }

  async listAvailableSlots(resourceId: number, dto: ListResourceSlotsDto) {
    const resource = await this.prisma.resource.findFirst({
      where: { id: resourceId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!resource) throw new NotFoundException("资源不存在");

    return this.prisma.resourceSlot.findMany({
      where: {
        resourceId,
        slotDate: this.parseDate(dto.date),
        status: { in: ["AVAILABLE", "BOOKED"] },
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
  }

  private async invalidateCache() {
    await this.redis?.deletePrefix("resource-cache:");
  }

  private async requireManageAccess(
    resourceId: number,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    const resource = await this.prisma.resource.findFirst({
      where: {
        id: resourceId,
        ...(isSystemAdmin ? {} : { createdById: userId }),
      },
      select: { id: true },
    });
    if (!resource) throw new NotFoundException("资源不存在或无权管理");
  }

  private parseTime(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private timeValue(value: string) {
    return new Date(`1970-01-01T${value}:00.000Z`);
  }

  private timeText(value: Date) {
    return value.toISOString().slice(11, 16);
  }

  private ruleAuditSnapshot(rule: {
    weekday: number;
    startTime: Date;
    endTime: Date;
    slotMinutes: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }) {
    return {
      weekday: rule.weekday,
      startTime: this.timeText(rule.startTime),
      endTime: this.timeText(rule.endTime),
      slotMinutes: rule.slotMinutes,
      effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: rule.effectiveTo?.toISOString().slice(0, 10) ?? null,
    };
  }

  private slotDateTime(date: string, time: string) {
    return new Date(`${date}T${time}:00.000Z`);
  }

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException("日期必须是有效的 YYYY-MM-DD 日期");
    }
    return date;
  }

  private async updateOwnedResource(
    id: number,
    data: Prisma.ResourceUpdateInput,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const resource = await tx.resource.update({
          where: isSystemAdmin ? { id } : { id, createdById: userId },
          data,
        });
        await tx.operationLog.create({
          data: {
            operatorId: userId,
            action: "RESOURCE_UPDATED",
            targetType: "RESOURCE",
            targetId: id,
            metadata: { changedFields: Object.keys(data) },
          },
        });
        return resource;
      });
      await this.invalidateCache();
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException("资源不存在或无权管理");
      }
      throw error;
    }
  }
}
