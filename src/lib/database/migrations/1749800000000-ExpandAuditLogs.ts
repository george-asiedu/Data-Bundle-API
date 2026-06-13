import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings the existing audit_logs table in line with the expanded auditing:
 *  - adds the new LogAction enum values,
 *  - indexes (resource_type, resource_id) for resource lookups,
 *  - widens created_at to timestamptz.
 *
 * Enum values are added with IF NOT EXISTS so the migration is idempotent and
 * safe to run on PostgreSQL 12+ inside the migration transaction.
 */
export class ExpandAuditLogs1749800000000 implements MigrationInterface {
  private static readonly NEW_ACTIONS = [
    'auth.register',
    'auth.login_initiated',
    'auth.password_reset_requested',
    'upload.business_logo',
    'upload.profile_logo',
    'payment.confirmed',
    'payment.update_financial_setup',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration only upgrades an existing audit_logs table. On a brand-new
    // database the baseline migration creates it already in its final shape, so
    // there is nothing to do here.
    const existing = (await queryRunner.query(
      `SELECT to_regclass('public.audit_logs') AS table_name`,
    )) as Array<{ table_name: string | null }>;
    if (!existing[0]?.table_name) return;

    for (const value of ExpandAuditLogs1749800000000.NEW_ACTIONS) {
      await queryRunner.query(
        `ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_resource"
      ON "audit_logs" ("resource_type", "resource_id")
    `);

    // Only convert when the column is still a naive timestamp, so re-running on
    // a DB whose column is already timestamptz (e.g. built by synchronize)
    // doesn't double-shift the stored values.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'audit_logs'
            AND column_name = 'created_at'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "audit_logs"
          ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
          USING "created_at" AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_resource"`);

    // PostgreSQL cannot drop individual enum values; the added LogAction values
    // are left in place. They are harmless when unused.
  }
}
