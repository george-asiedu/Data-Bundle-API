import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the tables backing httpOnly-cookie sessions:
 *  - refresh_tokens: persisted, rotatable refresh tokens (hash only).
 *  - oauth_exchange_codes: single-use codes for the OAuth code-exchange flow.
 *
 * Both ids default to gen_random_uuid() (built into PostgreSQL 13+), so no
 * extension needs to be enabled.
 */
export class CreateAuthSessionTables1749700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" character varying NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "replaced_by_hash" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "oauth_exchange_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code_hash" character varying NOT NULL,
        "user_id" character varying NOT NULL,
        "is_new" boolean NOT NULL DEFAULT false,
        "expires_at" TIMESTAMP NOT NULL,
        "consumed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_exchange_codes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_oauth_exchange_codes_code_hash" UNIQUE ("code_hash")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oauth_exchange_codes"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
