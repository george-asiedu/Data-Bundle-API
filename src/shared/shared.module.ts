import { Global, Module } from '@nestjs/common';

import { QueryRunnerExec } from './services/query-runner-exec.service';
import { TokenGenerator } from './services/token-generator.service';
import { Paginator, PaginatorBuilder } from './services/paginator.provider';
import { S3Service } from './s3/s3.service';
import { CloudFrontService } from './cloudfront/cloudfront.service';

@Global()
@Module({
  providers: [
    QueryRunnerExec,
    TokenGenerator,
    PaginatorBuilder,
    Paginator,
    S3Service,
    CloudFrontService,
  ],
  exports: [
    QueryRunnerExec,
    TokenGenerator,
    PaginatorBuilder,
    Paginator,
    S3Service,
    CloudFrontService,
  ],
})
export class SharedModule {}
