import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class OAuthExchangeDto {
  @ApiProperty({
    description: 'The single-use code returned on the OAuth callback redirect.',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
