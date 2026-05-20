import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { UploadCategory } from '../../upload/upload.types';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly s3Endpoint: string;
  private readonly cloudfrontUrl: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(configService: ConfigService) {
    this.client = new S3Client({
      region: configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID') as string,
        secretAccessKey: configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        ) as string,
      },
    });
    this.bucket = configService.get<string>('AWS_S3_BUCKET') as string;
    this.s3Endpoint = configService.get<string>('AWS_S3_ENDPOINT') as string;
    this.cloudfrontUrl = configService.get<string>(
      'AWS_CLOUDFRONT_URL',
    ) as string;
  }

  /**
   *
   * @param key
   * @param contentType
   * @returns multipart upload ID and key for the initiated upload session to s3
   * @throws error if the multipart upload initiation fails
   */
  async initiateMultipartUpload(key: string, contentType: string) {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    try {
      const { UploadId } = await this.client.send(command);
      this.logger.log(
        `Initiated multipart upload for ${key} with UploadId: ${UploadId}`,
      );
      return { uploadId: UploadId, key };
    } catch (error) {
      this.handleError(error, `initiating multipart upload for ${key}`);
    }
  }

  /**
   *
   * @param key
   * @param uploadId
   * @param partCount
   * @returns secure signed urls from s3 for secure file upload to s3 from the client for an hour
   */
  async generatePresignedUrl(key: string, uploadId: string, partCount: number) {
    try {
      const urls = await Promise.all(
        Array.from({ length: partCount }, (_, i) => {
          const command = new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: i + 1,
          });

          return getSignedUrl(this.client, command, { expiresIn: 3600 });
        }),
      );
      this.logger.log(
        `Generated presigned URLs for ${key} with UploadId: ${uploadId}`,
      );
      return urls;
    } catch (error) {
      this.handleError(
        error,
        `generating presigned URLs for ${key} with UploadId: ${uploadId}`,
      );
    }
  }

  /**
   *
   * @param key
   * @param uploadId
   * @param parts
   * @returns public or private URL of the completed file uploaded to s3
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ ETag: string; PartNumber: number }>,
  ) {
    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts,
        },
      });

      const result = await this.client.send(command);
      this.logger.log(
        `Completed multipart upload for ${key} with UploadId: ${uploadId}`,
      );
      return result.Location;
    } catch (error) {
      this.handleError(
        error,
        `completing multipart upload for ${key} with UploadId: ${uploadId}`,
      );
    }
  }

  /**
   *
   * @param key
   * @param uploadId
   * call this if anything fails mid-upload
   */
  async abortMultipartUpload(key: string, uploadId: string) {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      this.handleError(error, 'aborting multipart upload');
    }
  }

  /**
   * Deletes multiple objects from the S3 bucket in a single batch request.
   * @param keys Array of S3 keys to delete
   */
  async deleteMultipleObjects(keys: string[]): Promise<void> {
    if (!keys || keys.length === 0) return;

    try {
      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
          Quiet: false,
        },
      });

      await this.client.send(command);
      this.logger.log(
        `Successfully deleted ${keys.length} physical files from S3.`,
      );
    } catch (error) {
      this.handleError(error, 'deleting multiple objects from');
    }
  }

  getAssetLongUrl(key: string): string {
    return `${this.s3Endpoint}/${key}`;
  }

  getAssetShortUrl(key: string): string {
    return `${this.cloudfrontUrl}/${key}`;
  }

  /**
   * Generates a structured S3 key scoped to a user and upload category.
   * Format: {category}/{userId}/{uuid}_{sanitized_filename}
   * e.g. documents/usr-123/a1b2c3_my_document.pdf
   */
  generateS3Key(
    userId: string,
    category: UploadCategory,
    fileName: string,
  ): string {
    const uniqueId = uuidv4();
    const sanitizedName = fileName.replace(/\s+/g, '_').toLowerCase();

    return `${category}/${userId}/${uniqueId}_${sanitizedName}`;
  }

  private handleError(error: unknown, action: string): never {
    if (error instanceof Error) {
      this.logger.error(
        `Error ${action} file in S3: ${error.message}`,
        error.stack,
      );
    } else {
      this.logger.error(
        `Unknown error occurred while ${action} file`,
        JSON.stringify(error),
      );
    }
    throw new Error(`Failed to ${action} file in S3.`);
  }
}
