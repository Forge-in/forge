import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { AuthModule, OTP_TRANSPORT } from '../auth/auth.module';
import { OtpService } from '../auth/otp.service';
import type { OtpTransport } from '../auth/otp-transport';
import { TokenService } from '../auth/token.service';
import { AdminAuthController, AdminProvisioningController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';

/**
 * The company admin console's own auth module.
 *
 * It REUSES OtpService, TokenService and the SMS transport rather than reimplementing them.
 * That is the whole reason those are separate services: the code hashing, the constant-time
 * compare, the attempt counter, the rotation-with-reuse-detection and the successor grace
 * window are the hard parts, and a second copy of them would be a second set of bugs — and
 * only one of the two would get the fix.
 *
 * What is NOT shared is the orchestration above them: which phones may sign in, whether a
 * user is created on the way, and what the resulting session is scoped to. Those are the
 * decisions that differ, and they live in AdminAuthService.
 *
 * The audience claim keeps the shared token machinery from blurring the two surfaces back
 * together — see TokenAudience in @forge/shared.
 */
@Module({
  // AuthModule is @Global, so its providers resolve without re-importing — but the import is
  // explicit anyway. A global module makes the dependency invisible in the graph, and this
  // module genuinely cannot function without those three services.
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminProvisioningController],
  providers: [
    {
      provide: AdminAuthService,
      inject: [OtpService, OTP_TRANSPORT, TokenService, ConfigService],
      useFactory: (
        otp: OtpService,
        transport: OtpTransport,
        tokens: TokenService,
        config: ConfigService<Env, true>,
      ) => new AdminAuthService(otp, transport, tokens, config),
    },
  ],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
