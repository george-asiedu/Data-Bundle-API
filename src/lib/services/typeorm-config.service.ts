import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

@Injectable()
export class TypeormConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly _configService: ConfigService) {}

  createTypeOrmOptions(): Promise<TypeOrmModuleOptions> | TypeOrmModuleOptions {
    return {
      type: 'postgres',
      url: this._configService.get('DATABASE_URL') as string,
      autoLoadEntities: true,
      synchronize: this._configService.get<string>('NODE_ENV') !== 'production',
      ssl: {
        rejectUnauthorized: false,
      },
      extra: {
        max:
          this._configService.get<string>('NODE_ENV') === 'production' ? 10 : 5,
      },
    };
  }
}
