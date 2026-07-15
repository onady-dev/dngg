import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.userId,
      email: payload.email,
      groupId: payload.groupId,
      // 기존 발급 토큰에는 role이 없다 — 'user'로 취급 (재로그인 시 role 반영)
      role: payload.role ?? 'user',
    };
  }
} 