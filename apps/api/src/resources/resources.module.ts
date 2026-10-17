import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ResourcesController } from "./resources.controller";
import { ResourcesService } from "./resources.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, AccessTokenGuard, RolesGuard],
})
export class ResourcesModule {}
