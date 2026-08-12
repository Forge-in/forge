import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Role, v1, type AccessTokenPayload } from '@forge/shared';
import type { Request } from 'express';

import { ConsoleRoute, CurrentUser, Public, Roles } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { REQUEST_ID_HEADER } from '../../common/request-context';
import { AdminAuthService } from './admin-auth.service';

/**
 * Sign-in for the company admin console.
 *
 * `@ConsoleRoute()` at the class level pins the token audience for every route below it, so
 * a member's access token is rejected here before its role is read — and a console token is
 * rejected by every route that does NOT carry this marker. Declared once on the controller
 * rather than per handler: an audience marker that has to be repeated is one that will
 * eventually be forgotten on the handler that matters.
 */
@ConsoleRoute()
@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(private readonly admin: AdminAuthService) {}

  /**
   * Public by necessity — this is how an administrator with no session gets one.
   *
   * The response is identical whether or not the number belongs to an administrator. Only
   * entitled numbers actually receive an SMS, which the caller cannot observe.
   */
  @Public()
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(
    @ZodBody(v1.adminRequestOtpBody) body: v1.AdminRequestOtpBody,
    @Req() request: Request,
  ): Promise<v1.AdminRequestOtpResponse> {
    const requestId = String(request.headers[REQUEST_ID_HEADER] ?? '');
    // request.ip is only trustworthy because `trust proxy` is an explicit hop count in
    // configureApp; trusting all hops would let a caller pick their own rate-limit bucket.
    return this.admin.requestOtp(body.phone, request.ip ?? 'unknown', requestId);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @ZodBody(v1.adminVerifyOtpBody) body: v1.AdminVerifyOtpBody,
  ): Promise<v1.AdminSessionResponse> {
    return this.admin.verifyOtp(body);
  }

  /** Activation. Public because the person accepting has no session yet, by definition. */
  @Public()
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @ZodBody(v1.adminAcceptInviteBody) body: v1.AdminAcceptInviteBody,
  ): Promise<v1.AdminSessionResponse> {
    return this.admin.acceptInvite(body);
  }

  /**
   * Public because it is reached precisely when the access token is dead. Its own credential
   * is the refresh token in the body, and that token must carry the console audience.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @ZodBody(v1.adminRefreshBody) body: v1.AdminRefreshBody,
  ): Promise<v1.AdminRefreshResponse> {
    return this.admin.refresh(body.refreshToken);
  }

  @Roles(Role.PLATFORM_ADMIN)
  @Get('me')
  async me(@CurrentUser() user: AccessTokenPayload): Promise<v1.AdminMeResponse> {
    return this.admin.me(user.sub);
  }

  /**
   * Authenticated, so the access token being revoked is the verified one. A public logout
   * taking a token in the body would let anyone end anyone's session.
   */
  @Roles(Role.PLATFORM_ADMIN)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @ZodBody(v1.adminLogoutBody) body: v1.AdminLogoutBody,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.AdminLogoutResponse> {
    return this.admin.logout(user.jti, body.refreshToken);
  }
}

/**
 * Provisioning: who may reach the console, and who may stop reaching it.
 *
 * Every route here requires an existing platform admin session. There is deliberately no
 * public path into this controller — the only way to become the first administrator is the
 * seed CLI, run by someone with database credentials.
 */
@ConsoleRoute()
@Roles(Role.PLATFORM_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminProvisioningController {
  constructor(private readonly admin: AdminAuthService) {}

  /**
   * Returns the invite token in the response body, exactly once.
   *
   * Not emailed, not texted, not stored in readable form. The inviting administrator hands
   * it over out-of-band, which is what makes it a genuine second factor rather than a second
   * message to the same SIM an attacker has already swapped.
   */
  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @ZodBody(v1.createAdminInviteBody) body: v1.CreateAdminInviteBody,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.CreateAdminInviteResponse> {
    return this.admin.createInvite(user.sub, body);
  }

  @Get('invites')
  async listInvites(): Promise<v1.ListAdminInvitesResponse> {
    return this.admin.listInvites();
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.OK)
  async revokeInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.RevokeAdminInviteResponse> {
    return this.admin.revokeInvite(inviteId, user.sub);
  }

  @Get('admins')
  async listAdmins(): Promise<v1.ListAdminsResponse> {
    return this.admin.listAdmins();
  }

  /** Ends every session the target holds, immediately — not at the next token expiry. */
  @Post('admins/:adminId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Param('adminId') adminId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.AdminStatusResponse> {
    return this.admin.suspend(adminId, user.sub);
  }

  @Post('admins/:adminId/reinstate')
  @HttpCode(HttpStatus.OK)
  async reinstate(
    @Param('adminId') adminId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<v1.AdminStatusResponse> {
    return this.admin.reinstate(adminId, user.sub);
  }
}
