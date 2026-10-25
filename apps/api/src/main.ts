import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("可配置预约与资源排期系统 API")
    .setDescription("资源、时间片、预约和管理接口")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/v1/docs", app, document);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("API_PORT");
  const webPort = configService.getOrThrow<number>("WEB_PORT");
  app.enableCors({ origin: `http://localhost:${webPort}`, credentials: true });
  await app.listen(port);
}

void bootstrap();
