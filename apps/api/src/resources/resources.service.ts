import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ResourceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateResourceDto } from "./dto/create-resource.dto";
import { CreateResourceRuleDto } from "./dto/create-resource-rule.dto";
import { CreateResourceUnavailableDateDto } from "./dto/create-resource-unavailable-date.dto";
import { UpdateResourceRuleDto } from "./dto/update-resource-rule.dto";
import { ListResourcesDto } from "./dto/list-resources.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListResourcesDto) {
    return this.listWhere(query, { status: "ACTIVE" });
  }

  listManaged(query: ListResourcesDto, userId: number, isSystemAdmin: boolean) {
    return this.listWhere(query, isSystemAdmin ? {} : { createdById: userId });
  }

  private async listWhere(
    query: ListResourcesDto,
    scope: Prisma.ResourceWhereInput,
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

    return { items, total, page, pageSize };
  }

  async get(id: number) {
    const resource = await this.prisma.resource.findFirst({
      where: { id, status: "ACTIVE" },
    });
    if (!resource) throw new NotFoundException("资源不存在");
    return resource;
  }

  async create(dto: CreateResourceDto, userId: number) {
    try {
      return await this.prisma.resource.create({
        data: { ...dto, createdById: userId },
      });
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

  setStatus(
    id: number,
    status: ResourceStatus,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    return this.updateOwnedResource(id, { status }, userId, isSystemAdmin);
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

    return this.prisma.resourceRule.create({
      data: {
        resourceId,
        weekday: dto.weekday,
        startTime: this.timeValue(dto.startTime),
        endTime: this.timeValue(dto.endTime),
        slotMinutes: dto.slotMinutes,
        effectiveFrom,
        effectiveTo,
      },
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

    const rule = await this.prisma.resourceRule.findFirst({
      where: {
        id: ruleId,
        resourceId,
        ...(isSystemAdmin ? {} : { resource: { is: { createdById: userId } } }),
      },
    });
    if (!rule) throw new NotFoundException("规则不存在或无权管理");

    const startTime =
      dto.startTime ?? rule.startTime.toISOString().slice(11, 16);
    const endTime = dto.endTime ?? rule.endTime.toISOString().slice(11, 16);
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

    return this.prisma.resourceRule.update({
      where: { id: ruleId },
      data: {
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
      },
    });
  }

  async deleteRule(
    resourceId: number,
    ruleId: number,
    userId: number,
    isSystemAdmin: boolean,
  ) {
    const result = await this.prisma.resourceRule.deleteMany({
      where: {
        id: ruleId,
        resourceId,
        ...(isSystemAdmin ? {} : { resource: { is: { createdById: userId } } }),
      },
    });
    if (!result.count) throw new NotFoundException("规则不存在或无权管理");
    return { success: true };
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
        throw new ConflictException("该资源在此日期已设置为不可预约");
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
      throw new NotFoundException("不可预约日期不存在");
    }
    return { success: true };
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
      return await this.prisma.resource.update({
        where: isSystemAdmin ? { id } : { id, createdById: userId },
        data,
      });
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
