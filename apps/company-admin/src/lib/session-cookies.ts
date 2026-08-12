/**
 * Cookie NAMES only. No imports, no `next/headers`, no `server-only`.
 *
 * `proxy.ts` and `lib/session.ts` both need to agree on these, but they run in different
 * places: the proxy is invoked separately from render code and, in an optimised deployment,
 * can be pushed to a CDN edge — so the Next.js guidance is explicitly not to have it depend
 * on shared render-time modules. Importing `session.ts` there would drag `next/headers` and
 * the `server-only` marker into the proxy bundle for the sake of two string constants.
 *
 * Two constants in a leaf module is the whole fix, and it keeps the names in exactly one
 * place — which matters more than it looks, because a proxy checking for a cookie name the
 * writer never sets is a login loop with no error anywhere.
 */

export const ACCESS_COOKIE = 'forge_console_at';
export const REFRESH_COOKIE = 'forge_console_rt';
