import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AccessTokenPayload } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("SYSTEM_ADMIN")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("manage")
  list(@Query() query: ListUsersDto) {
    return this.usersService.list(query);
  }

  @Patch("manage/:id/status")
  updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.usersService.updateStatus(id, dto.status, user.sub);
  }

  @Patch("manage/:id/roles")
  updateRoles(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.usersService.updateRoles(id, dto.roles, user.sub);
  }
}
