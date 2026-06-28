import { Global, Module } from '@nestjs/common';

import { QueryRunnerExec } from './services/query-runner-exec.service';
import { AppEvents } from './services/app-events.service';
import { TokenGenerator } from './services/token-generator.service';
import { Paginator, PaginatorBuilder } from './services/paginator.provider';
import { S3Service } from './s3/s3.service';
import { CloudFrontService } from './cloudfront/cloudfront.service';

@Global()
@Module({
  providers: [
    QueryRunnerExec,
    AppEvents,
    TokenGenerator,
    PaginatorBuilder,
    Paginator,
    S3Service,
    CloudFrontService,
  ],
  exports: [
    QueryRunnerExec,
    AppEvents,
    TokenGenerator,
    PaginatorBuilder,
    Paginator,
    S3Service,
    CloudFrontService,
  ],
})
export class SharedModule {}
