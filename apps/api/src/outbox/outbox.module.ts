import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OutboxService } from "./outbox.service";
import { OutboxController } from "./outbox.controller";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OutboxController],
  providers: [OutboxService, AccessTokenGuard, RolesGuard],
})
export class OutboxModule {}
