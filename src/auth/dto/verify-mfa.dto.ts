import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class VerifyMfaDto {
  @IsNotEmpty()
  @ApiProperty()
  mfaToken: string;

  @IsNotEmpty()
  @ApiProperty()
  code: string;
}
