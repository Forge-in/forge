import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
