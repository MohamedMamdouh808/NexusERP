import { Global, Module } from '@nestjs/common';
import { loadConfiguration } from './configuration';

/**
 * Provides the validated startup configuration.
 *
 * Validation happens at MODULE LOAD, not on first use, so an unusable environment fails
 * before the HTTP server starts accepting traffic. A service that boots and then fails on
 * its first request has already told a load balancer it is healthy.
 *
 * The validated value is read from the environment once, here, and shared. No application
 * code reads `process.env` directly, so an unvalidated value cannot reach a module.
 */
export const CONFIGURATION = Symbol('CONFIGURATION');

export type AppConfiguration = ReturnType<typeof loadConfiguration>;

@Global()
@Module({
  providers: [
    {
      provide: CONFIGURATION,
      useFactory: (): AppConfiguration => loadConfiguration(),
    },
  ],
  exports: [CONFIGURATION],
})
export class ConfigurationModule {}