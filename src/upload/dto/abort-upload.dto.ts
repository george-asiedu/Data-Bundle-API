import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AbortUploadDto {
  @ApiProperty({ example: 'upload123' })
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @ApiProperty({ example: 'collection/CL01/098ujhbmnkj809/example.png' })
  @IsString()
  @IsNotEmpty()
  key: string;
}
