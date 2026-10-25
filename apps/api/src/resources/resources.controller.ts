import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AccessTokenPayload } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateResourceDto } from "./dto/create-resource.dto";
import { CreateResourceRuleDto } from "./dto/create-resource-rule.dto";
import { CreateResourceUnavailableDateDto } from "./dto/create-resource-unavailable-date.dto";
import { GenerateResourceSlotsDto } from "./dto/generate-resource-slots.dto";
import { GenerateResourceSlotsRangeDto } from "./dto/generate-resource-slots-range.dto";
import { ListResourcesDto } from "./dto/list-resources.dto";
import { ListResourceSlotsDto } from "./dto/list-resource-slots.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";
import { UpdateResourceRuleDto } from "./dto/update-resource-rule.dto";
import { UpdateResourceStatusDto } from "./dto/update-resource-status.dto";
import { ResourcesService } from "./resources.service";

@Controller("resources")
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  list(@Query() query: ListResourcesDto) {
    return this.resourcesService.list(query);
  }

  @Get("manage")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  listManaged(
    @Query() query: ListResourcesDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.listManaged(
      query,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Get(":resourceId/unavailable-dates")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  listUnavailableDates(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.listUnavailableDates(
      resourceId,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Post(":resourceId/unavailable-dates")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  createUnavailableDate(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Body() dto: CreateResourceUnavailableDateDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.createUnavailableDate(
      resourceId,
      dto,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Delete(":resourceId/unavailable-dates/:dateId")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  deleteUnavailableDate(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Param("dateId", ParseIntPipe) dateId: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.deleteUnavailableDate(
      resourceId,
      dateId,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Post(":resourceId/slots/generate")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  generateSlots(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Body() dto: GenerateResourceSlotsDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.generateSlots(
      resourceId,
      dto,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Post(":resourceId/slots/generate-range")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  generateSlotsRange(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Body() dto: GenerateResourceSlotsRangeDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.generateSlotsRange(
      resourceId,
      dto,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.resourcesService.get(id);
  }

  @Get(":resourceId/slots")
  listAvailableSlots(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Query() query: ListResourceSlotsDto,
  ) {
    return this.resourcesService.listAvailableSlots(resourceId, query);
  }

  @Post()
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  create(
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.create(dto, user.sub);
  }

  @Patch(":id")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.update(
      id,
      dto,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Patch(":id/status")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  setStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateResourceStatusDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.setStatus(
      id,
      dto.status,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Get(":resourceId/rules")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  listRules(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.listRules(
      resourceId,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Post(":resourceId/rules")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  createRule(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Body() dto: CreateResourceRuleDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.createRule(
      resourceId,
      dto,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Patch(":resourceId/rules/:ruleId")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  updateRule(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Param("ruleId", ParseIntPipe) ruleId: number,
    @Body() dto: UpdateResourceRuleDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.updateRule(
      resourceId,
      ruleId,
      dto,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Delete(":resourceId/rules/:ruleId")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  deleteRule(
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Param("ruleId", ParseIntPipe) ruleId: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.resourcesService.deleteRule(
      resourceId,
      ruleId,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }
}
