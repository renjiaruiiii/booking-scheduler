import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("API_PORT");
  const webPort = configService.getOrThrow<number>("WEB_PORT");
  app.enableCors({ origin: `http://localhost:${webPort}`, credentials: true });
  await app.listen(port);
}

void bootstrap();
