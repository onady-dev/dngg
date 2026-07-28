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
    const { method, originalUrl } = request;

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

    // Nest LoggerService의 위치 인자는 error(message, stack, context) / warn(message, context)다.
    // 여기에 구조화 메타 객체를 넘기면 스택이 유실될 뿐 아니라, 요청 body(가입·로그인 평문
    // 비밀번호)가 로그 파이프라인으로 새어 들어간다. 문자열만 넘긴다.
    const where = `${method} ${originalUrl} ${status} ${message}`;

    if (status >= 500) {
      this.logger.error(
        `[Server Error] ${where}`,
        exception instanceof Error ? exception.stack : undefined,
        HttpExceptionFilter.name,
      );
    } else if (status >= 400) {
      if (originalUrl !== '/') {
        this.logger.warn(`[Client Error] ${where}`, HttpExceptionFilter.name);
      }
    }

    response.status(status).json(
      typeof responseBody === 'object' && responseBody !== null
        ? responseBody
        : { message: String(responseBody) }
    );
  }
}
