import { Controller, Get } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness probe. Kept dependency-free so it stays up when Postgres is not. */
  @Get()
  check(): HealthStatus {
    return this.healthService.check();
  }
}
