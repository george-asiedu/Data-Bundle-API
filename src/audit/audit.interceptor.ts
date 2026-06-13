import {
  Injectable,
  NestInterceptor,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { buildAuditContext, resolveAction } from './resolve-action.utils';
import { AuditService } from './audit.service';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly _auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const method = req.method;
    const path = req.path;
    const user: User | null = (req.user as User | null) ?? null;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      null;
    const ua = req.headers['user-agent'] ?? null;

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const action = resolveAction(method, path);
          if (!action) return;

          const statusCode = http.getResponse<{ statusCode: number }>()
            .statusCode;
          const durationMs = Date.now() - start;
          const ctx = buildAuditContext(action, req, responseBody);

          // Fire and forget — never await, never blocks the response
          void this._auditService.logFromRequest(
            {
              action,
              endpoint: `${method} ${path}`,
              statusCode,
              durationMs,
              ipAddress: ip,
              userAgent: ua,
              resourceType: ctx.resourceType,
              resourceId: ctx.resourceId,
              metadata: ctx.metadata,
            },
            user,
          );
        },
        error: (error: unknown) => {
          const action = resolveAction(method, path);
          if (!action) return;

          const ctx = buildAuditContext(action, req, undefined);

          // Log failures too — useful for detecting repeated 401s, 403s, etc.
          void this._auditService.logFromRequest(
            {
              action,
              endpoint: `${method} ${path}`,
              statusCode: (error as { status?: number }).status ?? 500,
              durationMs: Date.now() - start,
              ipAddress: ip,
              userAgent: ua,
              resourceType: ctx.resourceType,
              resourceId: ctx.resourceId,
              metadata: { ...ctx.metadata, error: (error as Error).message },
            },
            user,
          );
        },
      }),
    );
  }
}
