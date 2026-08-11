import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';

import { HealthController } from './health.controller';
import { REDIS } from '../../redis/redis.module';
import { HealthService, type ReadinessStatus } from './health.service';

describe('HealthController', () => {
  let healthController: HealthController;
  let healthService: HealthService;

  const configValues: Record<string, string> = { GIT_SHA: 'abc1234', BUILT_AT: '2026-08-12' };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
        // Liveness must not touch it; readiness is asserted through a stubbed service.
        { provide: REDIS, useValue: { ping: jest.fn().mockResolvedValue('PONG') } },
      ],
    }).compile();

    healthController = app.get(HealthController);
    healthService = app.get(HealthService);
  });

  describe('liveness', () => {
    it('reports ok with an ISO timestamp', () => {
      const result = healthController.check();

      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('carries build identity so the running version is never a guess', () => {
      const result = healthController.check();

      expect(result.sha).toBe('abc1234');
      expect(result.builtAt).toBe('2026-08-12');
    });

    /**
     * The property that matters most about liveness: a failing probe gets the container
     * KILLED. If it touched Postgres, one database blip would restart every instance at
     * once and hit a recovering database with a thundering herd of cold starts.
     */
    it('touches no external dependency', () => {
      const spy = jest.spyOn(healthService, 'ready');
      healthController.check();
      expect(spy).not.toHaveBeenCalled();
    });

    it('is also served at the legacy /health path', () => {
      expect(healthController.legacyCheck()).toMatchObject({ status: 'ok' });
    });
  });

  describe('readiness', () => {
    const mockResponse = (): Response => ({ status: jest.fn() }) as unknown as Response;

    it('leaves the status at 200 when every dependency is up', async () => {
      const ready: ReadinessStatus = {
        status: 'ready',
        checks: { postgres: { ok: true }, redis: { ok: true } },
        timestamp: new Date().toISOString(),
      };
      jest.spyOn(healthService, 'ready').mockResolvedValue(ready);

      const response = mockResponse();
      const result = await healthController.ready(response);

      expect(result.status).toBe('ready');
      expect(response.status).not.toHaveBeenCalled();
    });

    /**
     * 503 is the contract — orchestrators read the status code, not the body. Returning
     * 200 with `status: "not_ready"` inside would keep a broken instance in the load
     * balancer, which is the failure this probe exists to prevent.
     */
    it('returns 503 when a dependency is down', async () => {
      const notReady: ReadinessStatus = {
        status: 'not_ready',
        checks: { postgres: { ok: false, error: 'connection refused' }, redis: { ok: true } },
        timestamp: new Date().toISOString(),
      };
      jest.spyOn(healthService, 'ready').mockResolvedValue(notReady);

      const response = mockResponse();
      const result = await healthController.ready(response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      // The body still names the culprit — that is what turns a page into a diagnosis.
      expect(result.checks.postgres?.ok).toBe(false);
      expect(result.checks.postgres?.error).toBe('connection refused');
    });
  });
});
