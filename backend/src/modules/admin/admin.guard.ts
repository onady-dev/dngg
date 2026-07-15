import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// AuthGuard('jwt') 뒤에 배치 — req.user는 jwt.strategy.validate의 반환값
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('관리자만 사용할 수 있습니다.');
    }
    return true;
  }
}
