import { v1 } from '@forge/shared';

import { ForgeHttpClient } from './client.js';

/**
 * The company admin console's client.
 *
 * A sibling of ForgeApiClient rather than a superset of it. They share the transport — the
 * timeouts, the idempotency keys, the error envelope, the single-flight refresh — because
 * those absorb real network failure modes and a second copy would be a second set of bugs
 * with only one of them ever getting the fix.
 *
 * What they do NOT share is the endpoints. Console tokens carry the `console` audience and
 * are rejected by every `/v1/auth/*` route; member tokens are rejected by every
 * `/v1/admin/*` route. Inheriting the member methods here would produce calls that compile,
 * read sensibly, and 401 every time — the worst kind of API surface.
 *
 * SERVER-SIDE ONLY in practice. The browser never holds these tokens: the console's Next
 * server actions construct this per request against an httpOnly cookie store, so an XSS on
 * the console cannot walk away with a credential to the whole platform.
 */
export class ForgeConsoleClient extends ForgeHttpClient {
  protected readonly refreshPath = '/v1/admin/auth/refresh';

  // ---- sign-in ------------------------------------------------------------------------

  /**
   * The response says nothing about whether the number is an administrator, so there is
   * nothing here for a caller to branch on — deliberately.
   */
  async requestOtp(body: v1.AdminRequestOtpBody): Promise<v1.AdminRequestOtpResponse> {
    return this.request({
      method: 'POST',
      path: '/v1/admin/auth/request-otp',
      body,
      anonymous: true,
    });
  }

  async verifyOtp(body: v1.AdminVerifyOtpBody): Promise<v1.AdminSessionResponse> {
    const result = await this.request<v1.AdminSessionResponse>({
      method: 'POST',
      path: '/v1/admin/auth/verify-otp',
      body,
      anonymous: true,
    });

    await this.options.tokenStore.setTokens(result.tokens);
    return result;
  }

  /** Activation: invite token and one-time code together, in a single request. */
  async acceptInvite(body: v1.AdminAcceptInviteBody): Promise<v1.AdminSessionResponse> {
    const result = await this.request<v1.AdminSessionResponse>({
      method: 'POST',
      path: '/v1/admin/auth/accept-invite',
      body,
      anonymous: true,
    });

    await this.options.tokenStore.setTokens(result.tokens);
    return result;
  }

  async me(): Promise<v1.AdminMeResponse> {
    return this.request({ method: 'GET', path: '/v1/admin/auth/me' });
  }

  async logout(): Promise<void> {
    const refreshToken = await this.options.tokenStore.getRefreshToken();

    try {
      await this.request({
        method: 'POST',
        path: '/v1/admin/auth/logout',
        body: refreshToken ? { refreshToken } : {},
      });
    } finally {
      // Cleared even if the call failed. Pressing "sign out" must end the local session
      // regardless of whether the server was reachable — especially on a shared machine.
      await this.options.tokenStore.clear();
    }
  }

  // ---- provisioning -------------------------------------------------------------------

  /** The response carries the plaintext invite token exactly once. Do not persist it. */
  async createInvite(body: v1.CreateAdminInviteBody): Promise<v1.CreateAdminInviteResponse> {
    return this.request({ method: 'POST', path: '/v1/admin/invites', body });
  }

  async listInvites(): Promise<v1.ListAdminInvitesResponse> {
    return this.request({ method: 'GET', path: '/v1/admin/invites' });
  }

  async revokeInvite(inviteId: string): Promise<v1.RevokeAdminInviteResponse> {
    return this.request({ method: 'DELETE', path: `/v1/admin/invites/${inviteId}` });
  }

  async listAdmins(): Promise<v1.ListAdminsResponse> {
    return this.request({ method: 'GET', path: '/v1/admin/admins' });
  }

  async suspendAdmin(adminId: string): Promise<v1.AdminStatusResponse> {
    return this.request({ method: 'POST', path: `/v1/admin/admins/${adminId}/suspend` });
  }

  async reinstateAdmin(adminId: string): Promise<v1.AdminStatusResponse> {
    return this.request({ method: 'POST', path: `/v1/admin/admins/${adminId}/reinstate` });
  }
}
