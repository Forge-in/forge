import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../common/decorators/auth.decorators';
import { HealthService, type LivenessStatus, type ReadinessStatus } from './health.service';

/**
 * Probes live OUTSIDE the /api/v1 prefix and outside versioning.
 *
 * They are infrastructure endpoints consumed by an orchestrator, not product API. Versioning
 * them would mean a load balancer config change every time the API version moves, and
 * pinning a health check to a version nobody remembers to update is how a deploy silently
 * stops being checked.
 *
 * VERSION_NEUTRAL is required, not optional: `setGlobalPrefix(..., { exclude })` only
 * removes the `/api` prefix. URI versioning is applied independently, so without this the
 * routes resolve at `/v1/healthz` and every probe gets a 404 — the container is killed as
 * unhealthy the moment it is deployed.
 */
/**
 * @Public on every probe: JwtAuthGuard is global, and an orchestrator has no bearer token.
 * A 401 on /healthz would make every container look dead the moment auth was enabled.
 */
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness. Must not touch Postgres or Redis: a failing liveness probe gets the container
   * KILLED, so making it depend on the database turns a brief database blip into a
   * simultaneous restart of every instance.
   */
  @Get('healthz')
  check(): LivenessStatus {
    return this.healthService.check();
  }

  /**
   * Readiness. Returns 503 when a dependency is down so the load balancer stops sending
   * traffic while leaving the process running to recover.
   *
   * The status code is the contract here — orchestrators do not parse the body — but the
   * body names which dependency failed, which is what turns a page into a diagnosis.
   */
  @Get('readyz')
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessStatus> {
    const result = await this.healthService.ready();

    if (result.status !== 'ready') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }

  /**
   * Retained because README and existing tooling document GET /health as the liveness
   * probe. Kept as an alias rather than a redirect: probes generally do not follow
   * redirects, so a 3xx here would read as a failure.
   */
  @Get('health')
  legacyCheck(): LivenessStatus {
    return this.healthService.check();
  }
}
