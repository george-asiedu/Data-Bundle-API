import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds storefront settings columns to the shops table (tagline, welcome message,
 * contact + socials, logo). Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export class AddShopSettings1750400000000 implements MigrationInterface {
  private static readonly COLUMNS: { name: string; type: string }[] = [
    { name: 'tagline', type: 'character varying' },
    { name: 'welcome_message', type: 'character varying(500)' },
    { name: 'contact_phone', type: 'character varying' },
    { name: 'whatsapp', type: 'character varying' },
    { name: 'facebook', type: 'character varying' },
    { name: 'instagram', type: 'character varying' },
    { name: 'logo_url', type: 'character varying' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const col of AddShopSettings1750400000000.COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of AddShopSettings1750400000000.COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "shops" DROP COLUMN IF EXISTS "${col.name}"`,
      );
    }
  }
}
