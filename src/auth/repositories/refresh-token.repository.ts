import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private get _repo() {
    return this._dataSource.getRepository(RefreshToken);
  }

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const token = this._repo.create(data);
    return await this._repo.save(token);
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return await this._repo.findOne({ where: { tokenHash } });
  }

  async save(token: RefreshToken): Promise<RefreshToken> {
    return await this._repo.save(token);
  }

  /**
   * Revokes every still-active token for a user. Used both on logout and as the
   * containment response when a revoked token is replayed (theft detection).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this._repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
