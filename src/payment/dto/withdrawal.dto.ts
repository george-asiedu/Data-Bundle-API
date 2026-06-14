import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class RequestWithdrawalDto {
  /** Amount in whole Ghana Cedis (GHS). Wallet balances are stored as integers. */
  @ApiProperty({ example: 50, description: 'Amount to withdraw, in GHS' })
  @IsInt()
  @Min(10)
  amount: number;
}

export class RejectWithdrawalDto {
  @ApiProperty({ example: 'Suspicious activity on the account' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
