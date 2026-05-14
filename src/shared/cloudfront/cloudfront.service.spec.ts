import { Test, TestingModule } from '@nestjs/testing';
import { CloudFrontService } from './cloudfront.service';

describe('CloudFrontService', () => {
  let service: CloudFrontService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloudFrontService],
    }).compile();

    service = module.get<CloudFrontService>(CloudFrontService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
