import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { validateEnvironment } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { ResourcesModule } from "./resources/resources.module";
import { BookingsModule } from "./bookings/bookings.module";
import { OutboxModule } from "./outbox/outbox.module";
import { OperationLogModule } from "./operation-log/operation-log.module";
import { UsersModule } from "./users/users.module";
import { RedisModule } from "./redis/redis.module";
import { RateLimitGuard } from "./common/rate-limit.guard";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { RequestLoggingInterceptor } from "./common/request-logging.interceptor";

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
    RedisModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
