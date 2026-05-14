import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

@Injectable()
export class EncryptionService {
  constructor(private readonly _configService: ConfigService) {}

  encrypt(data: string): string {
    const { algorithm, bufferKey } = this._getAlgorithmAndBufferKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(
      algorithm,
      Buffer.from(bufferKey, 'hex'),
      iv,
    ) as crypto.CipherGCM;

    let encryptedText = cipher.update(data, 'utf-8', 'hex');
    encryptedText += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encryptedText}`;
  }

  decrypt(data: string): string {
    const { algorithm, bufferKey } = this._getAlgorithmAndBufferKey();

    const [ivHex, authTagHex, encryptedText] = data.split(':');

    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(bufferKey, 'hex'),
      Buffer.from(ivHex, 'hex'),
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decryptedText = decipher.update(encryptedText, 'hex', 'utf-8');
    decryptedText += decipher.final('utf-8');

    return decryptedText;
  }

  private _getAlgorithmAndBufferKey() {
    return {
      algorithm: 'aes-256-gcm',
      bufferKey: this._configService.get<string>('BUFFER_KEY') as string,
    };
  }
}
