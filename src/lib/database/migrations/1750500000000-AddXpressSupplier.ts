import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds XpresPortal as a supplier:
 *  - extends `orders_supplier_enum` with 'XPRESS' (used by orders.supplier),
 *  - adds `users.api_key_supplier` so each user's stored key is routed to the
 *    right supplier; defaults to 'XPRESS' (the platform's default supplier).
 * Idempotent.
 */
export class AddXpressSupplier1750500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend the orders supplier enum. ADD VALUE IF NOT EXISTS is allowed inside
    // a transaction on PostgreSQL 12+ (Supabase is 15+).
    await queryRunner.query(`
      ALTER TYPE "orders_supplier_enum" ADD VALUE IF NOT EXISTS 'XPRESS';
    `);

    // Dedicated enum for the user's chosen supplier (matches the SupplierName
    // enum). Created with both values so it can be used immediately below.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_api_key_supplier_enum') THEN
          CREATE TYPE "users_api_key_supplier_enum" AS ENUM ('VERDEACCESS', 'XPRESS');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "api_key_supplier" "users_api_key_supplier_enum"
      NOT NULL DEFAULT 'XPRESS';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "api_key_supplier";
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "users_api_key_supplier_enum";
    `);
    // Note: 'XPRESS' is intentionally left on "orders_supplier_enum" —
    // PostgreSQL cannot drop a single enum value without recreating the type.
  }
}
