import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Standalone DataSource used by the TypeORM CLI for migrations only.
 * The running app keeps configuring TypeORM through TypeormConfigService.
 *
 * `synchronize` is intentionally false here so the CLI never auto-alters the
 * schema — every production schema change goes through a reviewed migration.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/lib/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,
  ssl: {
    rejectUnauthorized: false,
  },
});
