/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LambdaClient,
  InvokeCommand,
  InvocationType,
  InvokeCommandInput,
} from '@aws-sdk/client-lambda';

@Injectable()
export class CloudFrontService {
  private readonly _lambda: LambdaClient;
  private readonly _distributionId: string;
  private readonly _lambdaFunctionName: string;
  private readonly _logger = new Logger(CloudFrontService.name);

  constructor(private readonly _configService: ConfigService) {
    this._lambda = new LambdaClient({
      region: this._configService.get<string>('AWS_REGION') as string,
      credentials: {
        accessKeyId: this._configService.get<string>(
          'AWS_ACCESS_KEY_ID',
        ) as string,
        secretAccessKey: this._configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        ) as string,
      },
    });

    this._distributionId = this._configService.get<string>(
      'AWS_CLOUDFRONT_DISTRIBUTION_ID',
    ) as string;
    this._lambdaFunctionName = this._configService.get<string>(
      'AWS_INVALIDATION_LAMBDA_NAME',
    ) as string;
  }

  /**
   * Invalidates multiple S3 keys in CloudFront by invoking a Lambda function.
   * @param s3Keys
   */
  async invalidatePaths(s3Keys: string[]): Promise<void> {
    const payload = {
      distributionId: this._distributionId,
      paths: s3Keys,
    };

    const params: InvokeCommandInput = {
      FunctionName: this._lambdaFunctionName,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(JSON.stringify(payload)),
    };

    try {
      const command = new InvokeCommand(params);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await this._lambda.send(command);

      this._logger.log(
        `CloudFront invalidation triggered for: ${s3Keys.join(', ')}`,
      );
    } catch (error: unknown) {
      this._logger.error(
        `CloudFront invalidation failed for paths [${s3Keys.join(', ')}]: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Invalidates a single S3 key.
   * @param s3Key
   * @returns
   */
  async invalidatePath(s3Key: string): Promise<void> {
    return this.invalidatePaths([s3Key]);
  }

  /**
   * Invalidates all assets within a collection that match a given prefix.
   * @param collectionId
   * @param assetPrefix
   * @returns file paths matching the pattern /collection/{collectionId}/{assetPrefix}*
   */
  async invalidateAssetAll(
    collectionId: string,
    assetPrefix: string,
  ): Promise<void> {
    return this.invalidatePaths([
      `/collection/${collectionId}/${assetPrefix}*`,
    ]);
  }
}
