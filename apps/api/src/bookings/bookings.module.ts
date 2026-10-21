import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BookingsController],
  providers: [BookingsService, AccessTokenGuard, RolesGuard],
})
export class BookingsModule {}
