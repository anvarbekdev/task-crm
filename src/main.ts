import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Email-to-Task CRM API')
    .setDescription(
      'Turns inbound emails into reviewable Tasks, scoped per company. ' +
        'Authenticate with POST /auth/login, then use the returned token via "Authorize".',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth')
    .addTag('tasks')
    .addTag('webhooks')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.get<number>('port') ?? 3000);
}
bootstrap();
