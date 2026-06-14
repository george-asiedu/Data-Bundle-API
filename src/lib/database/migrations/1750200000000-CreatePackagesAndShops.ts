import { MigrationInterface, QueryRunner } from 'typeorm';

type Seed = {
  network: 'MTN' | 'AT' | 'TELECEL';
  type: 'REGULAR' | 'BIGTIME';
  sizes: number[];
  pricePerGbPesewas: number;
  expiry: 'NON_EXPIRY' | 'ROLLOVER_60_DAY' | 'STANDARD';
};

/**
 * Creates the packages catalog, per-agent shop pricing overrides, and shop
 * storefront identity. Seeds the platform catalog with sensible derived
 * wholesale prices (admin edits later). All money is integer pesewas.
 */
export class CreatePackagesAndShops1750200000000 implements MigrationInterface {
  private static readonly SEED: Seed[] = [
    {
      network: 'MTN',
      type: 'REGULAR',
      sizes: [1, 2, 3, 4, 5, 6, 7],
      pricePerGbPesewas: 400,
      expiry: 'NON_EXPIRY',
    },
    {
      network: 'MTN',
      type: 'BIGTIME',
      sizes: [8, 10, 12, 15, 20, 25, 30, 40, 50, 100],
      pricePerGbPesewas: 400,
      expiry: 'NON_EXPIRY',
    },
    {
      network: 'AT',
      type: 'REGULAR',
      sizes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25],
      pricePerGbPesewas: 400,
      expiry: 'ROLLOVER_60_DAY',
    },
    {
      network: 'AT',
      type: 'BIGTIME',
      sizes: [20, 30, 40, 50, 80, 100, 150, 200, 250],
      pricePerGbPesewas: 400,
      expiry: 'ROLLOVER_60_DAY',
    },
    {
      network: 'TELECEL',
      type: 'REGULAR',
      sizes: [5, 10, 15, 20, 25, 30, 40, 50, 100],
      pricePerGbPesewas: 360,
      expiry: 'STANDARD',
    },
  ];

  private static readonly PACKAGE_AUDIT_ACTIONS = [
    'package.price_updated',
    'package.visibility_toggled',
    'package.margin_applied',
    'package.created',
    'package.updated',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'packages_network_enum') THEN
          CREATE TYPE "packages_network_enum" AS ENUM ('MTN', 'AT', 'TELECEL');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'packages_type_enum') THEN
          CREATE TYPE "packages_type_enum" AS ENUM ('REGULAR', 'BIGTIME');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'packages_expiry_info_enum') THEN
          CREATE TYPE "packages_expiry_info_enum" AS ENUM ('NON_EXPIRY', 'ROLLOVER_60_DAY', 'STANDARD');
        END IF;
      END $$;
    `);

    // ── packages ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "packages" (
        "id" character varying NOT NULL,
        "network" "packages_network_enum" NOT NULL,
        "type" "packages_type_enum" NOT NULL,
        "capacity_gb" integer NOT NULL,
        "size_label" character varying NOT NULL,
        "wholesale_price" integer NOT NULL,
        "suggested_retail_price" integer NOT NULL,
        "expiry_info" "packages_expiry_info_enum" NOT NULL,
        "provider_code" character varying,
        "is_available" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_packages_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_packages_network_type_capacity" UNIQUE ("network", "type", "capacity_gb")
      )
    `);

    // ── shop_packages (per-agent overrides) ────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_packages" (
        "id" character varying NOT NULL,
        "user_id" character varying NOT NULL,
        "package_id" character varying NOT NULL,
        "retail_price" integer NOT NULL,
        "in_shop" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_packages_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shop_packages_user_package" UNIQUE ("user_id", "package_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_packages_user" ON "shop_packages" ("user_id")`,
    );

    // ── shops (storefront identity) ────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shops" (
        "id" character varying NOT NULL,
        "user_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shops_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shops_user" UNIQUE ("user_id"),
        CONSTRAINT "UQ_shops_slug" UNIQUE ("slug")
      )
    `);

    // ── Seed catalog ───────────────────────────────────────────
    const rows: string[] = [];
    let seq = 1000;
    for (const group of CreatePackagesAndShops1750200000000.SEED) {
      for (const gb of group.sizes) {
        seq += 1;
        const wholesale = gb * group.pricePerGbPesewas;
        const suggested = Math.ceil((wholesale * 1.2) / 10) * 10;
        rows.push(
          `('PKG${seq}', '${group.network}', '${group.type}', ${gb}, '${gb} GB', ${wholesale}, ${suggested}, '${group.expiry}')`,
        );
      }
    }

    await queryRunner.query(`
      INSERT INTO "packages"
        ("id", "network", "type", "capacity_gb", "size_label", "wholesale_price", "suggested_retail_price", "expiry_info")
      VALUES ${rows.join(', ')}
      ON CONFLICT ("network", "type", "capacity_gb") DO NOTHING
    `);

    // ── Audit enum values ──────────────────────────────────────
    const auditEnumExists = (await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum'`,
    )) as unknown[];
    if (auditEnumExists.length > 0) {
      for (const value of CreatePackagesAndShops1750200000000.PACKAGE_AUDIT_ACTIONS) {
        await queryRunner.query(
          `ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS '${value}'`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shops"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shop_packages_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "packages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "packages_expiry_info_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "packages_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "packages_network_enum"`);
    // Added audit enum values are left in place (PostgreSQL cannot drop them).
  }
}
