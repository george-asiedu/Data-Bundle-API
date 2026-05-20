import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CreateWalletDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  balance: number;
}
