export const INVITATION_CODE_SECURITY = Symbol('INVITATION_CODE_SECURITY');

export interface GeneratedInvitationCode {
  code: string;
  codeHash: string;
  codeCiphertext: string;
}

export interface InvitationCodeSecurity {
  generate(): GeneratedInvitationCode;
  hash(code: string): string;
  reveal(codeCiphertext: string): string;
}

export const INVITATION_CODE_PATTERN =
  /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u;
const NORMALIZED_INVITATION_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{24}$/u;

export function normalizeInvitationCode(code: string): string {
  const normalized = code.replace(/[\s-]/gu, '').toUpperCase();
  if (!NORMALIZED_INVITATION_CODE_PATTERN.test(normalized)) {
    throw new Error('Invite Code has an invalid format');
  }

  return normalized;
}

export function formatInvitationCode(normalizedCode: string): string {
  return normalizedCode.match(/.{4}/gu)?.join('-') ?? normalizedCode;
}
