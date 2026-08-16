import { Controller, Get, Query } from '@nestjs/common';
import { v1 } from '@forge/shared';

import { Public } from '../../common/decorators/auth.decorators';
import { AppConfigService } from './app-config.service';

/**
 * Unauthenticated on purpose: an app too old to sign in still has to be told to update, and
 * a maintenance window has to be announceable to users who cannot authenticate.
 */
@Public()
@Controller({ path: 'app-config', version: '1' })
export class AppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get()
  async get(
    @Query('app') app?: string,
    @Query('platform') platform?: string,
  ): Promise<v1.AppConfigResponse> {
    const parsedPlatform = v1.clientPlatform.safeParse(platform ?? 'ios');

    return this.appConfig.get(
      app ?? 'user-mobile',
      parsedPlatform.success ? parsedPlatform.data : 'ios',
    );
  }
}
