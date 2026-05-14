import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RequestMethod } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: ['http://localhost:4200'],
      credentials: true,
    },
  });
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT');

  const liveServerUrl = configService.get<string>('LIVE_SERVER_URL') as string;
  const localServerUrl = configService.get<string>(
    'LOCAL_SERVER_URL',
  ) as string;
  const isDevEnvironment =
    configService.get<string>('NODE_ENV') === 'development';
  const options = new DocumentBuilder()
    .setTitle('DATA BUNDLE API Documentation')
    .setDescription('REST API for DATA BUNDLE Web Application')
    .setVersion('1.0.0')
    .addServer(
      isDevEnvironment ? localServerUrl : liveServerUrl,
      isDevEnvironment ? 'Local environment' : 'Live environment',
    )
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(port ?? 5050);
}

// eslint-disable-next-line
bootstrap();
