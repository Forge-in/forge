import { Global, Module } from '@nestjs/common';

import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';

// Global because ClientVersionGuard is registered application-wide and needs the service.
@Global()
@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
