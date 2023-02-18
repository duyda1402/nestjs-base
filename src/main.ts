import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('/api/posi/v1');
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(8000);
}
bootstrap();
