import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { AbortUploadDto } from './dto/abort-upload.dto';
import {
  swaggerAbortUploadResponse,
  swaggerAddLogo,
  swaggerCompleteUploadResponse,
  swaggerInitiateUploadResponse,
} from './upload.swagger';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { LogoDto } from '../auth/dto/logo.dto';

@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @ApiOperation(swaggerInitiateUploadResponse)
  @HttpCode(HttpStatus.OK)
  @Post('initiate')
  initiateUpload(@Body() body: InitiateUploadDto, @CurrentUser() user: User) {
    return this.uploadService.initiateUpload(body, user);
  }

  @ApiOperation(swaggerCompleteUploadResponse)
  @HttpCode(HttpStatus.OK)
  @Post('complete')
  completeUpload(@Body() body: CompleteUploadDto) {
    return this.uploadService.completeUpload(body);
  }

  @ApiOperation(swaggerAbortUploadResponse)
  @HttpCode(HttpStatus.OK)
  @Post('abort')
  abortUpload(@Body() body: AbortUploadDto) {
    return this.uploadService.abortUpload(body);
  }

  @ApiOperation(swaggerAddLogo)
  @HttpCode(HttpStatus.OK)
  @Post(':id/business-logo')
  businessLogoUpload(@Param('id') id: string, @Body() body: LogoDto) {
    return this.uploadService.addBusinessLogo(id, body);
  }

  @ApiOperation(swaggerAddLogo)
  @HttpCode(HttpStatus.OK)
  @Post(':id/profile-logo')
  profileLogoUpload(@Param('id') id: string, @Body() body: LogoDto) {
    return this.uploadService.addProfileLogo(id, body);
  }
}
