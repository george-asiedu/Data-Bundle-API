import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { S3Service } from '../shared/s3/s3.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { AbortUploadDto } from './dto/abort-upload.dto';
import { User } from '../auth/entities/user.entity';
import { UserRepository } from '../auth/repositories/user.repository';
import { LogoDto } from '../auth/dto/logo.dto';
import { MessageOnly } from '../lib/utils/types.utils';
import { QueryRunner } from 'typeorm';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { ApplicationException } from '../lib/exception/app.exception';

@Injectable()
export class UploadService {
  private readonly _logger = new Logger(UploadService.name);

  constructor(
    private readonly _s3: S3Service,
    private readonly _userRepo: UserRepository,
    private readonly _queryRunnerExec: QueryRunnerExec,
  ) {}

  async initiateUpload(body: InitiateUploadDto, user: User) {
    const key = this._s3.generateS3Key(user.id, body.category, body.fileName);

    const { uploadId } = await this._s3.initiateMultipartUpload(
      key,
      body.contentType,
    );

    const presignedUrls = await this._s3.generatePresignedUrl(
      key,
      uploadId as string,
      body.partCount,
    );

    return { message: 'Upload Initiated', uploadId, key, presignedUrls };
  }

  async completeUpload(body: CompleteUploadDto) {
    try {
      await this._s3.completeMultipartUpload(
        body.key,
        body.uploadId,
        body.parts.map((p) => ({ ETag: p.eTag, PartNumber: p.partNumber })),
      );
    } catch (err) {
      this._logger.error(
        `S3 multipart complete failed, aborting upload: ${(err as Error).message}`,
      );
      await this._s3.abortMultipartUpload(body.key, body.uploadId);
      throw new InternalServerErrorException(
        'File upload failed. The upload has been aborted.',
      );
    }

    return {
      message: 'Upload completed successfully',
      data: {
        key: body.key,
        shortUrl: this._s3.getAssetShortUrl(body.key),
        longUrl: this._s3.getAssetLongUrl(body.key),
      },
    };
  }

  async abortUpload(body: AbortUploadDto) {
    try {
      await this._s3.abortMultipartUpload(body.key, body.uploadId);
      return { message: 'Upload aborted successfully' };
    } catch (error) {
      this._logger.error(
        `Failed to abort multipart upload for key ${body.key} with UploadId ${body.uploadId}: ${
          (error as Error).message
        }`,
      );
      return {
        message: 'Abort request received but cleanup may be incomplete',
      };
    }
  }

  async addBusinessLogo(id: string, data: LogoDto): Promise<MessageOnly> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const user = await this._userRepo.find(id);
      if (!user) {
        throw new NotFoundException(`User account not found`);
      }

      await this._userRepo.addBusinessLogo(queryRunner, user, data);
      await this._queryRunnerExec.commit(queryRunner);

      return { message: 'Business logo uploaded successfully' };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async addProfileLogo(id: string, data: LogoDto): Promise<MessageOnly> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const user = await this._userRepo.find(id);
      if (!user) {
        throw new NotFoundException(`User account not found`);
      }

      await this._userRepo.addProfileLogo(queryRunner, user, data);
      await this._queryRunnerExec.commit(queryRunner);

      return { message: 'Profile image uploaded successfully' };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }
}
