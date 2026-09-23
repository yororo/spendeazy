import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

import {
  formatInvitationCode,
  normalizeInvitationCode,
  type GeneratedInvitationCode,
  type InvitationCodeSecurity,
} from '../application/invitation-code-security';

const INVITATION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const INVITATION_CODE_BYTE_LENGTH = 15;
const AES_ALGORITHM = 'aes-256-gcm';
const AES_IV_LENGTH = 12;
const AES_AUTH_TAG_LENGTH = 16;

export class NodeInvitationCodeSecurity implements InvitationCodeSecurity {
  private readonly key: Buffer | undefined;

  constructor(key: string | undefined) {
    this.key =
      key && /^[0-9a-f]{64}$/iu.test(key) ? Buffer.from(key, 'hex') : undefined;
  }

  generate(): GeneratedInvitationCode {
    const normalizedCode = generateNormalizedCode();
    const code = formatInvitationCode(normalizedCode);

    return {
      code,
      codeHash: this.hash(normalizedCode),
      codeCiphertext: this.encrypt(code),
    };
  }

  hash(code: string): string {
    return createHmac('sha256', this.requireKey())
      .update(normalizeInvitationCode(code))
      .digest('hex');
  }

  reveal(codeCiphertext: string): string {
    const payload = Buffer.from(codeCiphertext, 'base64url');
    if (payload.length <= AES_IV_LENGTH + AES_AUTH_TAG_LENGTH) {
      throw new Error('Invite Code storage is invalid');
    }

    const iv = payload.subarray(0, AES_IV_LENGTH);
    const authTag = payload.subarray(
      AES_IV_LENGTH,
      AES_IV_LENGTH + AES_AUTH_TAG_LENGTH,
    );
    const ciphertext = payload.subarray(AES_IV_LENGTH + AES_AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(AES_ALGORITHM, this.requireKey(), iv);
    decipher.setAuthTag(authTag);
    const code = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    return formatInvitationCode(normalizeInvitationCode(code));
  }

  private encrypt(code: string): string {
    const iv = randomBytes(AES_IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.requireKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(code, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64url',
    );
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error('Invite Code protection is not configured');
    }

    return this.key;
  }
}

function generateNormalizedCode(): string {
  const bytes = randomBytes(INVITATION_CODE_BYTE_LENGTH);
  let value = BigInt(`0x${bytes.toString('hex')}`);
  const characters = Array.from({ length: 24 }, () => {
    const character = INVITATION_CODE_ALPHABET[Number(value & 31n)];
    value >>= 5n;
    return character;
  });

  return characters.reverse().join('');
}
