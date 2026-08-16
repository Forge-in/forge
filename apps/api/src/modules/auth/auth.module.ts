import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../../config/env.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { createOtpTransport, type OtpTransport } from './otp-transport';
import { TokenService } from './token.service';

/** Injection token for the SMS transport, so tests can substitute a recording double. */
export const OTP_TRANSPORT = Symbol('OTP_TRANSPORT');

/**
 * Global because JwtAuthGuard is registered application-wide and needs TokenService — a
 * guard cannot inject from a module it is not part of.
 */
@Global()
@Module({
  imports: [
    // Secrets are passed per sign/verify call rather than configured once here: access and
    // refresh use DIFFERENT secrets, and a single module-level secret would quietly make
    // them interchangeable — which is exactly what lets a refresh token be presented as an
    // access token.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    OtpService,
    TokenService,
    {
      provide: OTP_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): OtpTransport => createOtpTransport(config),
    },
    {
      provide: AuthService,
      inject: [OtpService, OTP_TRANSPORT, TokenService, ConfigService],
      useFactory: (
        otp: OtpService,
        transport: OtpTransport,
        tokens: TokenService,
        config: ConfigService<Env, true>,
      ) => new AuthService(otp, transport, tokens, config),
    },
  ],
  /**
   * OtpService is exported so the company admin console can reuse it rather than growing a
   * second implementation of hashed, single-use, attempt-counted codes. Being @Global does
   * not make a provider injectable elsewhere — only this list does.
   */
  exports: [TokenService, AuthService, OtpService, OTP_TRANSPORT],
})
export class AuthModule {}
