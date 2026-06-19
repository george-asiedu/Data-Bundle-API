import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the orders table for bundle purchases (agent dashboard + shop) with a
 * supplier-agnostic fulfilment model. Reuses the packages network/type enums.
 * Money is integer pesewas. Idempotent.
 */
export class CreateOrders1750300000000 implements MigrationInterface {
  private static readonly ORDER_AUDIT_ACTIONS = [
    'order.placed',
    'order.processing',
    'order.delivered',
    'order.failed',
    'order.retried',
    'order.status_synced',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_status_enum') THEN
          CREATE TYPE "orders_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_channel_enum') THEN
          CREATE TYPE "orders_channel_enum" AS ENUM ('AGENT_DASHBOARD', 'SHOP');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_payment_method_enum') THEN
          CREATE TYPE "orders_payment_method_enum" AS ENUM ('WALLET', 'PAYSTACK');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_supplier_enum') THEN
          CREATE TYPE "orders_supplier_enum" AS ENUM ('VERDEACCESS');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" character varying NOT NULL,
        "user_id" character varying NOT NULL,
        "package_id" character varying NOT NULL,
        "network" "packages_network_enum" NOT NULL,
        "type" "packages_type_enum" NOT NULL,
        "capacity_gb" integer NOT NULL,
        "size_label" character varying NOT NULL,
        "recipient_number" character varying NOT NULL,
        "amount" integer NOT NULL,
        "wholesale_amount" integer NOT NULL,
        "channel" "orders_channel_enum" NOT NULL,
        "payment_method" "orders_payment_method_enum" NOT NULL,
        "status" "orders_status_enum" NOT NULL DEFAULT 'PENDING',
        "supplier" "orders_supplier_enum" NOT NULL DEFAULT 'VERDEACCESS',
        "supplier_reference" character varying NOT NULL,
        "supplier_status_code" integer,
        "supplier_message" character varying,
        "paystack_reference" character varying,
        "customer_email" character varying,
        "customer_name" character varying,
        "transaction_id" character varying,
        "retry_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_supplier_reference" UNIQUE ("supplier_reference")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_user" ON "orders" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_status" ON "orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_paystack_reference" ON "orders" ("paystack_reference")`,
    );

    const auditEnumExists = (await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum'`,
    )) as unknown[];
    if (auditEnumExists.length > 0) {
      for (const value of CreateOrders1750300000000.ORDER_AUDIT_ACTIONS) {
        await queryRunner.query(
          `ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS '${value}'`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_orders_paystack_reference"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_supplier_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_status_enum"`);
  }
}
