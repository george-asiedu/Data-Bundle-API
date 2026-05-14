import { Test, TestingModule } from '@nestjs/testing';
import { TokenGenerator } from './token-generator.service';

describe('AuthService', () => {
  let tokenGeneratorService: TokenGenerator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenGenerator],
    }).compile();

    tokenGeneratorService = module.get<TokenGenerator>(TokenGenerator);
  });

  it('should be defined', () => {
    expect(tokenGeneratorService).toBeDefined();
  });

  it('should ensure the default generated token matches the right length', () => {
    const token = tokenGeneratorService.generate();
    expect(token).toBeDefined();
    expect(token.length).toBe(12);
  });

  it('should ensure the provided length matches the length of characters returned', () => {
    const token = tokenGeneratorService.generate(20);
    expect(token).toBeDefined();
    expect(token.length).toBe(20);
  });
});
