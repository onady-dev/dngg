import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// 로그인 토큰({userId, email, groupId, role})과 이메일 인증 토큰
// ({email, purpose, verificationId})이 같은 JWT_SECRET으로 서명되어 있어
// userId가 없는 payload도 여기로 들어올 수 있다.
interface JwtPayload {
  userId?: number;
  email?: string;
  groupId?: number;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    // userId 검사는 필수 가드다 (EmailVerificationService.confirmCode 참고).
    // 이게 없으면 계정 없이 이메일 인증만 마친 사람의 인증 토큰(userId 없음)이
    // 로그인 토큰으로 통과해 모든 AuthGuard('jwt') 라우트에 접근할 수 있게 된다.
    if (payload.userId === undefined || payload.userId === null) {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      userId: payload.userId,
      email: payload.email,
      groupId: payload.groupId,
      // 기존 발급 토큰에는 role이 없다 — 'user'로 취급 (재로그인 시 role 반영)
      role: payload.role ?? 'user',
    };
  }
}
