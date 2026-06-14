import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  RequestMethod,
  ClassSerializerInterceptor,
  Logger,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { Server } from 'http';
import { Socket } from 'net';

import { AppModule } from './app.module';

const processLogger = new Logger('Process');

/**
 * Keep a single bad/aborted request from taking the whole instance down.
 * Node can throw internally (e.g. "this.removeListener is not a function" /
 * ERR_INTERNAL_ASSERTION in socketOnError) when a client aborts a request while
 * the server is still writing the response. That throw is otherwise unhandled
 * and exits the process — which on Render drops every in-flight request (the
 * symptom: subsequent calls fail with "no Access-Control-Allow-Origin header").
 * We log and keep serving instead of crashing.
 */
function registerProcessGuards(): void {
  process.on('uncaughtException', (error) => {
    processLogger.error(
      `Uncaught exception (kept alive): ${error?.message}`,
      error?.stack,
    );
  });

  process.on('unhandledRejection', (reason) => {
    processLogger.error(
      `Unhandled promise rejection (kept alive): ${
        reason instanceof Error ? reason.message : String(reason)
      }`,
    );
  });
}

async function bootstrap() {
  registerProcessGuards();

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      credentials: true,
    },
  });
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.use(cookieParser());

  // Swallow malformed/aborted client connections instead of bubbling them up to
  // the process. Without this, an aborted socket mid-response can crash Node.
  const httpServer = app.getHttpAdapter().getHttpServer() as Server;
  httpServer.on('clientError', (err: Error, socket: Socket) => {
    processLogger.warn(`Client connection error: ${err.message}`);
    if (socket.writable && !socket.destroyed) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  // Global interceptor to serialize responses using class-transformer
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT');

  const liveServerUrl = configService.get<string>('LIVE_SERVER_URL') as string;
  const localServerUrl = configService.get<string>(
    'LOCAL_SERVER_URL',
  ) as string;
  const isDevEnvironment =
    configService.get<string>('NODE_ENV') === 'development';
  const options = new DocumentBuilder()
    .setTitle('INFINITY DATA MALL API Documentation')
    .setDescription('REST API for INFINITY DATA MALL Web Application')
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
