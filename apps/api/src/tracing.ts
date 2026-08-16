import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Distributed tracing, wired now rather than later.
 *
 * The argument for doing this before it is needed is that instrumentation is cheap to add to
 * an empty request path and expensive to add to a full one: retrofitting spans means touching
 * every service, and by then the questions you want to answer ("why is this endpoint slow for
 * one studio") are urgent.
 *
 * DISABLED BY DEFAULT. It costs nothing when off — no exporter, no instrumentation patching,
 * no spans. Turn it on with OTEL_ENABLED=true, and point OTEL_EXPORTER_OTLP_ENDPOINT at a
 * collector (Grafana Cloud, Honeycomb, Jaeger, anything speaking OTLP/HTTP).
 *
 * MUST be imported before anything else in main.ts — the instrumentations patch modules like
 * `http` and `pg` at require time, and a module already loaded is never patched. That is why
 * this lives in its own file with a side-effecting init rather than in the Nest lifecycle.
 */

/** Explicit instrumentation list, not auto-instrumentations-node. */
function instrumentations() {
  return [
    /**
     * Probes are polled every few seconds forever. Tracing them would make health checks the
     * overwhelming majority of spans and, on a per-span-priced backend, most of the bill.
     */
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) => {
        const url = request.url ?? '';
        return url === '/healthz' || url === '/readyz' || url === '/health';
      },
    }),
    new NestInstrumentation(),
    /**
     * enhancedDatabaseReporting is deliberately OFF: it attaches query parameters to spans,
     * and our parameters include phone numbers and — on the auth path — values that must not
     * leave the process. Statement text without parameters is enough to find a slow query.
     */
    new PgInstrumentation({ enhancedDatabaseReporting: false }),
    new IORedisInstrumentation({
      // Same reason: Redis arguments here are OTP hashes and token ids.
      requireParentSpan: true,
      dbStatementSerializer: (cmdName) => cmdName,
    }),
  ];
}

let sdk: NodeSDK | undefined;

export function startTracing(): void {
  if (process.env.OTEL_ENABLED !== 'true') return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'forge-api',
      [ATTR_SERVICE_VERSION]: process.env.GIT_SHA ?? 'unknown',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    // No endpoint configured means the exporter falls back to its default localhost
    // collector, which is the useful behaviour for a local Jaeger container.
    traceExporter: new OTLPTraceExporter(endpoint ? { url: `${endpoint}/v1/traces` } : {}),
    instrumentations: instrumentations(),
  });

  sdk.start();
}

/**
 * Flushes pending spans on shutdown.
 *
 * Without this the spans for the request that caused a crash are the ones lost — exactly the
 * ones worth having. Called from main.ts's shutdown path.
 */
export async function stopTracing(): Promise<void> {
  await sdk?.shutdown().catch(() => undefined);
}
