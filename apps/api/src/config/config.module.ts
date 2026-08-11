import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { validateEnv, type Env } from './env.schema';

/**
 * Typed access to the validated environment.
 *
 * `ConfigService<Env, true>` — the `true` is inferAll, which makes `get('PORT')` return
 * `number` rather than `string | undefined`. Without it every call site needs a cast or a
 * non-null assertion, and one of them eventually gets the type wrong.
 */
export type ForgeConfigService = ConfigService<Env, true>;

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Boot fails here, before any module initialises, if the environment is incomplete.
      validate: validateEnv,
      // In development, load .env; in production the platform supplies real variables and
      // a stray .env file on the image should never win.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: ['.env', '../../.env'],
      // The schema applies defaults, so a second layer of expansion would just create a
      // way for values to differ between what was validated and what is served.
      cache: true,
    }),
  ],
  exports: [ConfigModule],
})
export class ForgeConfigModule {}
