import * as Sentry from '@sentry/nestjs';

import { scrubEvent } from './sentry-scrub';

/**
 * Error reporting. No-op unless SENTRY_DSN is set.
 *
 * MUST run before Nest and before anything it should instrument, which is why this is called
 * from the top of main.ts rather than from a Nest module.
 *
 * ERRORS ONLY, deliberately. Sentry v8+ embeds OpenTelemetry to do performance tracing, and
 * this repo already runs its own NodeSDK (src/tracing.ts). Two OTel setups fight over the
 * global tracer provider and inject duplicate trace headers, and the usual symptom is *no*
 * traces at all — a silent failure in the tooling meant to reveal silent failures.
 *
 * So the split is: Sentry owns errors, our NodeSDK owns traces. `tracesSampleRate: 0` plus
 * `skipOpenTelemetrySetup: true` is what enforces it.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    // Ties an issue to the build that caused it. /healthz reports the same value.
    release: process.env.GIT_SHA ?? undefined,

    // See the class comment: our own NodeSDK owns tracing.
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,

    /**
     * OFF. When true, Sentry attaches IP addresses, cookies and request bodies automatically
     * — the exact PII that must not reach a third-party processor under DPDP. Everything
     * useful is attached deliberately instead (see setSentryRequestContext).
     */
    sendDefaultPii: false,

    /**
     * Last line before anything leaves the process. Drops the event entirely if scrubbing
     * throws: losing an error report is recoverable, leaking a credential is not.
     */
    beforeSend: scrubEvent,

    /**
     * 4xx responses are client mistakes, not defects, and would bury real issues. The
     * exception filter already logs them at warn level with a requestId.
     */
    ignoreErrors: [/^Unauthorized$/, /^Forbidden$/, /^Not Found$/],
  });
}

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  studioId?: string;
  role?: string;
  method?: string;
  path?: string;
}

/**
 * Reports an exception with its request context attached.
 *
 * Tagging and capturing happen inside ONE withScope callback on purpose. `withScope` is
 * callback-scoped — tags set in a separate call are discarded when it returns, so a
 * "set context, then capture" split would silently produce untagged events. That failure is
 * invisible until an incident, when the tags you needed turn out never to have been there.
 *
 * studioId is the tag that earns its place: it answers "is this failing for one studio or all
 * of them", the first question on any incident and unanswerable from an aggregated count.
 *
 * The phone number is deliberately NOT attached. requestId correlates to our own logs, which
 * do hold it — see sentry-scrub.ts for why PII stops here.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.studioId) scope.setTag('studio_id', context.studioId);
    if (context.role) scope.setTag('role', context.role);
    if (context.method) scope.setTag('http_method', context.method);
    // The matched route pattern, not the concrete URL — otherwise every id is its own issue
    // and grouping becomes useless.
    if (context.path) scope.setTag('route', context.path);
    // An opaque uuid: groups issues by user without identifying anyone.
    if (context.userId) scope.setUser({ id: context.userId });

    Sentry.captureException(error);
  });
}

/** Flushes buffered events on shutdown. Without it, the crash that killed the pod is lost. */
export async function flushSentry(timeoutMs = 2_000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  await Sentry.flush(timeoutMs).catch(() => undefined);
}
