import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
/**
 * 2023/03/09 한영광
 * 서버 로깅 미들웨어
 */
import {
  Inject,
  Injectable,
  LoggerService,
  NestMiddleware,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const start = Date.now();
    const { method, originalUrl, body } = request;
    const userAgent = request.get('user-agent') || '';
    const ip =
      request.headers['x-forwarded-for'] || request.socket.remoteAddress;

    response.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = response;
      const contentLength = response.get('content-length');

      const logMessage = {
        method,
        url: originalUrl,
        status: statusCode,
        duration: `${duration}ms`,
        contentLength,
        ip,
        // userAgent,
        // timestamp: new Date().toISOString(),
      };

      if (statusCode >= 500) {
        // this.logger.error(
        //   `Server Error ${method} ${ip} ${originalUrl} ${statusCode} ${duration}ms`
        // );
      } else if (statusCode >= 400) {
        // if (originalUrl !== '/') {
        //   this.logger.warn(
        //     `Client Error ${method} ${ip} ${originalUrl} ${statusCode} ${duration}ms`
        //   );
        // }
      } else if (duration >= 5000) {
        this.logger.warn(
          `Slow Request ${method} ${ip} ${originalUrl} ${statusCode} ${duration}ms ${body}`
        );
      } else {
        this.logger.log(
          `${method} ${ip} ${originalUrl} ${statusCode} ${duration}ms ${body}`
        );
      }
    });
    next();
  }
}
