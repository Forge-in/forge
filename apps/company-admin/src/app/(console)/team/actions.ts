'use server';

import { revalidatePath } from 'next/cache';
import { ForgeApiError, ForgeNetworkError } from '@forge/api-client';
import { ErrorCode, v1 } from '@forge/shared';

import { consoleApi } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';

/**
 * Platform admin management, as server actions.
 *
 * EVERY ACTION RE-VERIFIES THE CALLER.
 *
 * A server action is a public HTTP endpoint with a generated name — it is not protected by
 * the layout that rendered the button, and it can be invoked directly. `requireAdmin()` here
 * is therefore not belt-and-braces over the layout check; it is the only check that applies
 * to this request at all.
 *
 * The API re-checks everything again on its side. That is deliberate duplication: this layer
 * exists to give a person a good error message, and the API layer exists to be correct. If
 * they ever disagree, the API wins and the user sees its message.
 */

/**
 * Result shape shared by every action.
 *
 * A discriminated union rather than `{ ok, error? }`, so a caller cannot read `token` from a
 * failed result without narrowing first — and the invite token is precisely the field where
 * reading it off a failure would be a bug worth preventing at the type level.
 */
export type ActionResult<T = void> =
  | ({ status: 'ok' } & (T extends void ? { data?: never } : { data: T }))
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

/**
 * Turns any thrown value into a message a person can act on.
 *
 * The three outcomes are kept distinct on purpose. A refusal from the API is meaningful and
 * is shown verbatim — those messages are written for humans and already avoid leaking
 * internals. A network failure must NOT read as a refusal, or an operator will believe an
 * action was rejected when it may simply not have been attempted. Anything else is opaque,
 * because an unknown error's message can carry internals.
 */
function toError(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof ForgeApiError) {
    const fieldErrors = error.fieldErrors();
    return {
      status: 'error',
      message: error.message,
      ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    };
  }

  if (error instanceof ForgeNetworkError) {
    return {
      status: 'error',
      message: 'Could not reach Forge. Nothing was changed — check your connection and retry.',
    };
  }

  return { status: 'error', message: fallback };
}

/**
 * Refreshes the page's data after a change.
 *
 * These lists are read by a server component, so without this the browser would keep showing
 * the pre-change snapshot from the router cache — a suspended admin still reading "Active"
 * is exactly the kind of stale state that gets someone to press the button twice.
 */
function refresh(): void {
  revalidatePath('/team');
}

// =======================================================================================
// Invites
// =======================================================================================

export interface CreatedInvite {
  phone: string;
  expiresAt: string;
  /**
   * The plaintext token, returned to the browser EXACTLY ONCE.
   *
   * It is never persisted anywhere on this side — not in a cookie, not in the router cache,
   * not refetched. It lives in the drawer's React state until the drawer closes, and then it
   * is gone. Losing it means revoking the invite and issuing a new one, which is the correct
   * and intended cost.
   */
  token: string;
}

export async function createInvite(
  phone: string,
  expiresInHours: number,
): Promise<ActionResult<CreatedInvite>> {
  await requireAdmin();

  /**
   * Validated with the SAME schema the API uses, so the two cannot disagree. A separate
   * client-side rule would drift and start rejecting numbers the API accepts, and this
   * screen is the only place that would ever show it.
   */
  const parsed = v1.createAdminInviteBody.safeParse({ phone: phone.trim(), expiresInHours });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? 'phone');
    return {
      status: 'error',
      message:
        field === 'phone'
          ? 'Enter a valid Indian mobile number, with +91.'
          : 'Choose a validity between 1 hour and 14 days.',
      fieldErrors: { [field]: issue?.message ?? 'Invalid' },
    };
  }

  try {
    const result = await consoleApi().createInvite(parsed.data);
    refresh();

    return {
      status: 'ok',
      data: {
        phone: result.invite.phone,
        expiresAt: result.invite.expiresAt,
        token: result.inviteToken,
      },
    };
  } catch (error) {
    return toError(error, 'Could not create the invite. Please try again.');
  }
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  await requireAdmin();

  try {
    await consoleApi().revokeInvite(inviteId);
    refresh();
    return { status: 'ok' };
  } catch (error) {
    /**
     * A 404 here usually means someone else already revoked it, or the invited person just
     * accepted it — both are races between two open consoles, not failures. The list is
     * refreshed so the row disappears and the operator sees what actually happened rather
     * than a dead-end error.
     */
    if (error instanceof ForgeApiError && error.code === ErrorCode.NOT_FOUND) {
      refresh();
      return {
        status: 'error',
        message: 'That invite is no longer outstanding — it was already used or revoked.',
      };
    }

    return toError(error, 'Could not revoke the invite. Please try again.');
  }
}

// =======================================================================================
// Administrators
// =======================================================================================

export async function suspendAdmin(adminId: string): Promise<ActionResult> {
  const { admin } = await requireAdmin();

  /**
   * Refused here as well as in the API, and the reason is the message rather than the rule.
   *
   * The API returns a correct 403 for this, but by then the request has been made. Catching
   * it here lets the console say something specific before anything happens — and the UI
   * also hides the control on your own row, so this is the third layer, for the case where
   * the action is invoked directly.
   */
  if (adminId === admin.adminId) {
    return {
      status: 'error',
      message: 'You cannot suspend your own account. Ask another admin to do it.',
    };
  }

  try {
    await consoleApi().suspendAdmin(adminId);
    refresh();
    return { status: 'ok' };
  } catch (error) {
    return toError(error, 'Could not suspend that admin. Please try again.');
  }
}

export async function reinstateAdmin(adminId: string): Promise<ActionResult> {
  await requireAdmin();

  try {
    await consoleApi().reinstateAdmin(adminId);
    refresh();
    return { status: 'ok' };
  } catch (error) {
    return toError(error, 'Could not reinstate that admin. Please try again.');
  }
}
