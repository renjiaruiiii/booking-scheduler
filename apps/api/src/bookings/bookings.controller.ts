import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AccessTokenPayload } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ListBookingsDto } from "./dto/list-bookings.dto";
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

  @Get(":id")
  getMine(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.getMine(id, user.sub);
  }

  @Post()
  create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.bookingsService.create(dto, user.sub);
  }
}
