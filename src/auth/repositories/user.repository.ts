import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  AccountStatus,
  AuthProvider,
  CreateUserType,
  OAuthProfile,
  Role,
} from '../auth.types';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private _getQueryBuilder() {
    return this._dataSource.getRepository(User).createQueryBuilder('users');
  }

  /**
   * Creates a new row in the user table
   * whiles attaching a default plan of 'Individual' to the users
   * @param queryRunner
   * @param data
   * @returns
   */
  async add(queryRunner: QueryRunner, data: CreateUserType): Promise<User> {
    const user = new User();
    const assignedRole = data.role ?? Role.AGENT;

    user.id = await this._getNextId(assignedRole);
    user.role = assignedRole;
    user.email = data.email;
    user.password = data.password;
    user.fullName = data.fullName;
    user.provider = AuthProvider.LOCAL;
    return await queryRunner.manager.save(user);
  }

  private async _getNextId(role: Role): Promise<string> {
    const totalUsersWithRole = await this._getQueryBuilder()
      .where('role=:role', { role })
      .getCount();

    const initial = this._getInitials(role);
    const seed = 1000,
      increment = 1;

    return `${initial}${seed + totalUsersWithRole + increment}`;
  }

  private _getInitials(role: Role): string {
    switch (role) {
      case Role.SUPER_ADMIN:
        return 'SA';
      case Role.AGENT:
        return 'AG';
      case Role.SUB_AGENT:
        return 'SA';
      case Role.CUSTOMER:
        return 'CU';
    }
  }

  async update(
    queryRunner: QueryRunner,
    user: User,
    data: Partial<
      Pick<
        User,
        | 'fullName'
        | 'password'
        | 'imageShortUrl'
        | 'imageLongUrl'
        | 'accountStatus'
        | 'role'
        | 'lastLoginAt'
      >
    >,
  ) {
    user.fullName = data.fullName ?? user.fullName;
    user.password = data.password ?? user.password;
    user.imageShortUrl = data.imageShortUrl ?? user.imageShortUrl;
    user.imageLongUrl = data.imageLongUrl ?? user.imageLongUrl;
    user.accountStatus = data.accountStatus ?? user.accountStatus;
    user.role = data.role ?? user.role;

    if (data.lastLoginAt !== undefined) {
      user.lastLoginAt = data.lastLoginAt;
    }

    return await queryRunner.manager.save(user);
  }

  async find(value: string): Promise<User | null> {
    return this._getQueryBuilder()
      .where('id=:value')
      .orWhere('email=:value')
      .setParameters({ value })
      .getOne();
  }

  /**
   * Finds or creates a user from an OAuth profile.
   * @param queryRunner
   * @param profile
   * @returns the user and whether they were just created (for welcome emails)
   */
  async findOrCreateOAuthUser(
    queryRunner: QueryRunner,
    profile: OAuthProfile,
  ): Promise<{ user: User; isNew: boolean }> {
    // try matching by providerId + provider (returning OAuth user)
    let user = await this._getQueryBuilder()
      .where('users.providerId = :providerId AND users.provider = :provider', {
        providerId: profile.providerId,
        provider: profile.provider,
      })
      .getOne();

    if (user) return { user, isNew: false };

    // try matching by email (user may have registered with local auth)
    user = await this._getQueryBuilder()
      .where('users.email = :email', { email: profile.email })
      .getOne();

    if (user) {
      // Link the OAuth provider to the existing account
      user.providerId = profile.providerId;
      user.provider = profile.provider;
      user.fullName = profile.fullName;
      user.imageLongUrl = user.imageLongUrl ?? profile.imageUrl;
      user.imageShortUrl = user.imageShortUrl ?? profile.imageUrl;
      user = await queryRunner.manager.save(user);
      return { user, isNew: false };
    }

    // create a brand new user
    const newUser = new User();

    newUser.id = await this._getNextId(Role.AGENT);
    newUser.email = profile.email;
    newUser.fullName = profile.fullName;
    newUser.imageLongUrl = profile.imageUrl;
    newUser.imageShortUrl = profile.imageUrl;
    newUser.role = Role.AGENT;
    newUser.provider = profile.provider;
    newUser.providerId = profile.providerId;
    newUser.accountStatus = AccountStatus.ACTIVE;

    const saved = await queryRunner.manager.save(newUser);
    return { user: saved, isNew: true };
  }
}
