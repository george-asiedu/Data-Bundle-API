import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ShopCheckoutDto {
  @ApiProperty({ example: 'PKG1001' })
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @ApiProperty({ example: '0554821034', description: 'Recipient Ghana number' })
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'Enter a valid 10-digit Ghana phone number (e.g. 0554821034)',
  })
  recipientNumber: string;

  @ApiProperty({ example: 'customer@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ required: false, example: 'Kofi Mensah' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;
}
