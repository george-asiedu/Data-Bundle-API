import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds users.registration_reference — the latest Paystack reference for a user's
 * registration fee. Login uses it to reconcile a paid-but-not-yet-activated
 * account against Paystack when the webhook is still in flight.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export class AddUserRegistrationReference1750100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "registration_reference" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "registration_reference"
    `);
  }
}
