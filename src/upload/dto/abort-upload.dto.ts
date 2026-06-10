import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AbortUploadDto {
  @ApiProperty({ example: 'upload123' })
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @ApiProperty({ example: 'business_logo/AG-101/a1b2c3_business_logo.png' })
  @IsString()
  @IsNotEmpty()
  key: string;
}
