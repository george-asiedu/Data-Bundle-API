import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds wallet withdrawal support:
 *  - withdrawals table (request + admin-approval workflow),
 *  - withdrawals_status_enum type,
 *  - a new WITHDRAWAL_REVERSAL value on the transactions purpose enum (used when
 *    a rejected/failed payout refunds the held funds).
 *
 * Idempotent: safe to run on a fresh DB or one already shaped by synchronize.
 */
export class CreateWithdrawals1749900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Refund purpose for the ledger reversal entry.
    await queryRunner.query(
      `ALTER TYPE "transactions_purpose_enum" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_REVERSAL'`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'withdrawals_status_enum'
        ) THEN
          CREATE TYPE "withdrawals_status_enum" AS ENUM (
            'PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "withdrawals" (
        "id" character varying NOT NULL,
        "user_id" character varying,
        "wallet_id" character varying,
        "amount" integer NOT NULL,
        "status" "withdrawals_status_enum" NOT NULL DEFAULT 'PENDING',
        "reference" character varying NOT NULL,
        "recipient_code" character varying,
        "transfer_code" character varying,
        "transfer_ref" character varying,
        "reviewed_by" character varying,
        "review_note" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_withdrawals_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_withdrawals_reference" UNIQUE ("reference")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_withdrawals_user"
      ON "withdrawals" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_withdrawals_status"
      ON "withdrawals" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_withdrawals_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_withdrawals_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "withdrawals"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "withdrawals_status_enum"`);

    // PostgreSQL cannot drop an individual enum value, so WITHDRAWAL_REVERSAL is
    // intentionally left on transactions_purpose_enum (harmless when unused).
  }
}
