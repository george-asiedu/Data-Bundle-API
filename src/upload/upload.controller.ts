import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UploadService } from './upload.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { AbortUploadDto } from './dto/abort-upload.dto';
import {
  swaggerAbortUploadResponse,
  swaggerCompleteUploadResponse,
  swaggerInitiateUploadResponse,
} from './upload.swagger';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @ApiOperation(swaggerInitiateUploadResponse)
  @Post('initiate')
  initiateUpload(@Body() body: InitiateUploadDto, @CurrentUser() user: User) {
    return this.uploadService.initiateUpload(body, user);
  }

  @ApiOperation(swaggerCompleteUploadResponse)
  @Post('complete')
  completeUpload(@Body() body: CompleteUploadDto) {
    return this.uploadService.completeUpload(body);
  }

  @ApiOperation(swaggerAbortUploadResponse)
  @Post('abort')
  abortUpload(@Body() body: AbortUploadDto) {
    return this.uploadService.abortUpload(body);
  }
}
