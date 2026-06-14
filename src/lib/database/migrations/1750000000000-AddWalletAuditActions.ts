import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registers the wallet LogAction values on the audit_logs_action_enum. Without
 * these, every wallet top-up/withdrawal audit write fails with
 * "invalid input value for enum audit_logs_action_enum".
 *
 * Idempotent via ADD VALUE IF NOT EXISTS (PostgreSQL 12+).
 */
export class AddWalletAuditActions1750000000000 implements MigrationInterface {
  private static readonly NEW_ACTIONS = [
    'wallet.top_up_initiated',
    'wallet.withdrawal_requested',
    'wallet.withdrawal_approved',
    'wallet.withdrawal_rejected',
    'wallet.withdrawal_paid',
    'wallet.withdrawal_failed',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = (await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum'`,
    )) as unknown[];
    if (existing.length === 0) return;

    for (const value of AddWalletAuditActions1750000000000.NEW_ACTIONS) {
      await queryRunner.query(
        `ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop individual enum values; the added wallet actions
    // are left in place. They are harmless when unused.
  }
}
