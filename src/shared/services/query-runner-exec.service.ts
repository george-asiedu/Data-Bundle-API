import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class QueryRunnerExec {
  constructor(private readonly _dataSource: DataSource) {}

  async getRunner(): Promise<QueryRunner> {
    const queryRunner = this._dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    return queryRunner;
  }

  async commit(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.commitTransaction();
    await queryRunner.release();
  }

  async rollback(queryRunner?: QueryRunner): Promise<void> {
    await queryRunner?.rollbackTransaction();
    await queryRunner?.release();
  }
}
