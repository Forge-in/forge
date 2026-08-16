const HOME = '/overview';

/**
 * Resolves a `?next=` value into a destination that is guaranteed same-origin.
 *
 * Only a plain absolute path is accepted. Anything else falls back to the console
 * home, so the parameter can never be turned into an open redirect:
 *
 *   //evil.com     protocol-relative URL
 *   /\evil.com     browsers normalise the backslash to //
 *   https://...    absolute URL
 *   evil.com       relative, resolves against the current directory
 *
 * Security-relevant, so it lives here rather than inside a component: reusable by
 * any surface that redirects, and testable on its own.
 */
export function safeDestination(next: string | null | undefined, fallback = HOME): string {
  if (!next || !next.startsWith('/')) return fallback;

  // 0x2f "/" and 0x5c "\" — both make the rest of the string read as a host.
  const second = next.charCodeAt(1);
  if (second === 0x2f || second === 0x5c) return fallback;

  // Browsers strip control characters before parsing, so a tab inside the path
  // can turn it into a protocol-relative URL. Reject rather than sanitise.
  // eslint-disable-next-line no-control-regex -- matching controls is the point.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  return next;
}
