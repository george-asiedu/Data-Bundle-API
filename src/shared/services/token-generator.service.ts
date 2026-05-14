import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenGenerator {
  generate(length: number = 12): string {
    const charactersAndNumbers = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890`;
    let preferredToken = '';

    for (let i = 0; i < length; i++) {
      const index = Math.floor(
        Math.random() * (charactersAndNumbers.length - 1),
      );
      preferredToken += charactersAndNumbers[index];
    }

    return preferredToken;
  }
}
