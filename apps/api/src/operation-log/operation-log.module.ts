import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { OperationLogController } from "./operation-log.controller";
import { OperationLogService } from "./operation-log.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OperationLogController],
  providers: [OperationLogService, AccessTokenGuard, RolesGuard],
})
export class OperationLogModule {}
