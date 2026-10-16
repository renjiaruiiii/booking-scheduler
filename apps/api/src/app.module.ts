import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { validateEnvironment } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { ResourcesModule } from "./resources/resources.module";

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
