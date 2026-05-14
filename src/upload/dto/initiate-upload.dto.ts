import { IsString, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UploadCategory } from '../upload.types';

export class InitiateUploadDto {
  @ApiProperty({ example: 'example.png' })
  @IsString()
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  contentType: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(1)
  @Max(10000)
  partCount: number;

  @ApiProperty({ enum: UploadCategory, example: UploadCategory.PORTFOLIOS })
  @IsEnum(UploadCategory)
  category: UploadCategory;
}
