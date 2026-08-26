import { CONSOLE_HOME } from './navigation';

/**
 * Validates a `?next=` destination before redirecting to it.
 *
 * `proxy.ts` writes the path an unauthenticated visitor was reaching for into
 * the login URL, which means an attacker can write one too. Redirecting to it
 * unchecked turns the sign-in screen into an open redirect: a link to
 * `/login?next=https://evil.example` sends a freshly authenticated owner
 * straight off the site, from a URL that starts with the real domain.
 *
 * Only a path on this origin is allowed through. Everything else falls back to
 * the console home, which is never wrong — only less specific.
 *
 * The rejected shapes, and why each one matters:
 *   - `https://evil.example`  absolute URL, the obvious case
 *   - `//evil.example`        protocol-relative; the browser treats it as absolute
 *   - `/\evil.example`        backslash, which some parsers normalise to `//`
 *   - `javascript:alert(1)`   a scheme, not a path
 *   - anything not starting with `/`
 */

/**
 * Whitespace and C0/C1 control characters.
 *
 * Both are used to smuggle a scheme past a naive prefix check: a browser strips
 * a leading tab or newline before parsing, so "\n//evil.example" is an absolute
 * URL that does not start with `//` as far as `startsWith` is concerned.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARACTERS = /[\s\u0000-\u001f\u007f-\u009f]/;

export function safeDestination(next: string | null | undefined): string {
  if (!next) return CONSOLE_HOME;

  if (UNSAFE_CHARACTERS.test(next)) return CONSOLE_HOME;

  if (!next.startsWith('/')) return CONSOLE_HOME;
  if (next.startsWith('//')) return CONSOLE_HOME;
  if (next.startsWith('/\\')) return CONSOLE_HOME;

  return next;
}
