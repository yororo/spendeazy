import { NodeInvitationCodeSecurity } from '../infrastructure/node-invitation-code-security';

describe('NodeInvitationCodeSecurity', () => {
  const key = '0123456789abcdef'.repeat(4);

  it('generates a grouped high-entropy code and can reveal it from protected storage', () => {
    const security = new NodeInvitationCodeSecurity(key);

    const generated = security.generate();

    expect(generated.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u,
    );
    expect(generated.codeHash).not.toContain(generated.code);
    expect(generated.codeCiphertext).not.toContain(generated.code);
    expect(security.reveal(generated.codeCiphertext)).toBe(generated.code);
  });

  it('normalizes case and grouping separators before hashing', () => {
    const security = new NodeInvitationCodeSecurity(key);
    const generated = security.generate();
    const ungrouped = generated.code.replaceAll('-', '').toLowerCase();

    expect(security.hash(ungrouped)).toBe(generated.codeHash);
  });
});
