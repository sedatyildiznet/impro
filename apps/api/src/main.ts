import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ImproExceptionFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const origins = [process.env.APP_URL, process.env.SITE_URL].filter(Boolean) as string[];
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
  });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ImproExceptionFilter());

  if (process.env.NODE_ENV !== "production" || process.env.OPENAPI === "1") {
    const config = new DocumentBuilder()
      .setTitle("Impro API")
      .setDescription("Impro business/app layer. Matrix internals are not part of the public contract.")
      .setVersion("0.1.0")
      .build();
    SwaggerModule.setup("internal/docs", app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, "0.0.0.0");
}

bootstrap();
