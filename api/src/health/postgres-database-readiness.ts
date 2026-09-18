import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import {
  APP_CONFIG,
  DATABASE_CONNECTION_TIMEOUT_MS,
  DATABASE_IDLE_TIMEOUT_MS,
  DATABASE_POOL_SIZE,
} from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import type { DatabaseReadiness } from './database-readiness';
import { exceptionLogger } from '../logging/exception-logger';

@Injectable()
export class PostgresDatabaseReadiness
  implements DatabaseReadiness, OnApplicationShutdown
{
  private readonly pool: Pool | undefined;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.databaseUrl) {
      this.pool = new Pool({
        connectionString: config.databaseUrl,
        max: DATABASE_POOL_SIZE,
        connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
        idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
      });
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error: unknown) {
      exceptionLogger.report('database_readiness_failed', error);
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}
