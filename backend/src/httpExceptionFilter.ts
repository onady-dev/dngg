import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Inject,
  LoggerService,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { method, originalUrl, body, headers } = request;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let responseBody: any = { message: 'Internal server error' };
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'getStatus' in exception &&
      typeof exception['getStatus'] === 'function'
    ) {
      status = exception['getStatus']();
      const res = exception['getResponse']();
      if (typeof res === 'object' && res !== null) {
        responseBody = res;
      } else {
        responseBody = { message: res };
      }
    } else if (exception instanceof Error) {
      responseBody = { message: exception.message };
    }

    const message =
      typeof responseBody === 'object' && responseBody !== null
        ? responseBody['message']
        : responseBody;

    const errorLog = {
      method,
      url: originalUrl,
      status,
      message,
      body,
      headers: {
        'user-agent': headers['user-agent'],
        'x-forwarded-for': headers['x-forwarded-for'],
      },
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (status >= 500) {
      this.logger.error(
        `[Server Error] ${method} ${originalUrl} ${status} ${message}\n${exception instanceof Error ? exception.stack : ''}`,
        errorLog,
      );
    } else if (status >= 400) {
      if (originalUrl !== '/') {
        this.logger.warn(
          `[Client Error] ${method} ${originalUrl} ${status} ${message}`,
          errorLog,
        );
      }
    }

    response.status(status).json(
      typeof responseBody === 'object' && responseBody !== null
        ? responseBody
        : { message: String(responseBody) }
    );
  }
}
