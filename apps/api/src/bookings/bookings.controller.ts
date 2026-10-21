import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AccessTokenPayload } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ListBookingsDto } from "./dto/list-bookings.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";
import { BookingsService } from "./bookings.service";

@Controller("bookings")
@UseGuards(AccessTokenGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  listMine(
    @Query() query: ListBookingsDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.listMine(query, user.sub);
  }

  @Get("manage")
  @UseGuards(RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  listManaged(
    @Query() query: ListBookingsDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.listManaged(
      query,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Get("manage/stats")
  @UseGuards(RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  getManagedStats(@CurrentUser() user: AccessTokenPayload) {
    return this.bookingsService.getManagedStats(
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles("RESOURCE_ADMIN", "SYSTEM_ADMIN")
  updateManagedStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.updateManagedStatus(
      id,
      dto.status,
      user.sub,
      user.roles.includes("SYSTEM_ADMIN"),
    );
  }

  @Get(":id")
  getMine(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.getMine(id, user.sub);
  }

  @Delete(":id")
  cancelMine(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.cancelMine(id, user.sub);
  }

  @Post()
  create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.create(dto, user.sub);
  }
}
