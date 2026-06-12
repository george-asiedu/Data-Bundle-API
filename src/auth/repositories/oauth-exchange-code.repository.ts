import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OAuthExchangeCode } from '../entities/oauth-exchange-code.entity';

@Injectable()
export class OAuthExchangeCodeRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private get _repo() {
    return this._dataSource.getRepository(OAuthExchangeCode);
  }

  async create(data: {
    codeHash: string;
    userId: string;
    isNew: boolean;
    expiresAt: Date;
  }): Promise<OAuthExchangeCode> {
    const code = this._repo.create(data);
    return await this._repo.save(code);
  }

  async findByHash(codeHash: string): Promise<OAuthExchangeCode | null> {
    return await this._repo.findOne({ where: { codeHash } });
  }

  async save(code: OAuthExchangeCode): Promise<OAuthExchangeCode> {
    return await this._repo.save(code);
  }
}
