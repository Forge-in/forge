import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { v1, type AccessTokenPayload } from '@forge/shared';
import type { Request } from 'express';

import { AccessibleGyms, CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { REQUEST_ID_HEADER } from '../../common/request-context';
import { AuthService } from './auth.service';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Public by necessity — this is how someone with no session gets one.
   *
   * Rate limited per phone AND per IP inside OtpService: per phone alone lets one host walk
   * the numbering plan, per IP alone lets a botnet hammer one number. Every request here
   * also costs a real SMS, so the limits are a spending control as much as a security one.
   */
  @Public()
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(
    @ZodBody(v1.requestOtpBody) body: v1.RequestOtpBody,
    @Req() request: Request,
  ): Promise<v1.RequestOtpResponse> {
    const requestId = String(request.headers[REQUEST_ID_HEADER] ?? '');
    // request.ip is only trustworthy because `trust proxy` is set to an explicit hop count
    // in configureApp; trusting all hops would let a client spoof its own rate-limit bucket.
    return this.auth.requestOtp(body.phone, request.ip ?? 'unknown', requestId);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @ZodBody(v1.verifyOtpBody) body: v1.VerifyOtpBody,
  ): Promise<v1.VerifyOtpResponse> {
    return this.auth.verifyOtp(body);
  }

  /**
   * Public because it is reached precisely when the access token is dead. Its own
   * credential is the refresh token in the body.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@ZodBody(v1.refreshBody) body: v1.RefreshBody): Promise<v1.RefreshResponse> {
    return this.auth.refresh(body.refreshToken);
  }

  /** Reissues for another studio. Requires a live session; the target must be the user's own. */
  @Post('switch-studio')
  @HttpCode(HttpStatus.OK)
  async switchStudio(
    @ZodBody(v1.switchStudioBody) body: v1.SwitchStudioBody,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.SwitchStudioResponse> {
    return this.auth.switchStudio(user.sub, body.membershipId);
  }

  @Get('me')
  async me(
    @CurrentUser() user: AccessTokenPayload,
    @AccessibleGyms() accessibleGymIds: string[],
  ): Promise<v1.MeResponse> {
    // Non-null: JwtAuthGuard rejects a scoped role with a null studio before reaching here.
    return this.auth.me(user.sub, user.studioId!, user.membershipId!, accessibleGymIds);
  }

  /**
   * Authenticated, so the access token being revoked is the verified one — a public logout
   * taking a token in the body would let anyone revoke anyone's session.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @ZodBody(v1.logoutBody) body: v1.LogoutBody,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.LogoutResponse> {
    return this.auth.logout(user.jti, body.refreshToken);
  }
}
