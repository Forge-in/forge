/**
 * The session cookie NAMES, and nothing else.
 *
 * Split out from `session.ts` because `proxy.ts` needs them and `session.ts`
 * imports `next/headers`, which does not exist in the proxy runtime. Importing
 * the reader there fails the build; re-declaring the strings there instead
 * would work right up until one of the two is renamed.
 */

export const ACCESS_COOKIE = 'forge_at';
export const REFRESH_COOKIE = 'forge_rt';
