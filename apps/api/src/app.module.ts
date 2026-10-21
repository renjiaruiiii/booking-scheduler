import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { validateEnvironment } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { ResourcesModule } from "./resources/resources.module";
import { BookingsModule } from "./bookings/bookings.module";
import { OutboxModule } from "./outbox/outbox.module";
import { OperationLogModule } from "./operation-log/operation-log.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    ResourcesModule,
    BookingsModule,
    OutboxModule,
    OperationLogModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
