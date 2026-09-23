import {
  InvitationAlreadyPendingError,
  InvitationCodeRateLimitedError,
  InvitationCodeUnavailableError,
  InvitationClaimNotFoundError,
  InvitationIneligibleError,
} from './invitation-errors';
import {
  type InvitationClaimRecord,
  type InvitationRecord,
  type InvitationStore,
} from './invitation-store';
import { type InvitationCodeSecurity } from './invitation-code-security';
import { type InvitationClock } from './invitation-clock';
import { type InvitationAttemptLimiter } from './invitation-attempt-limiter';
import { InvitationsService } from './invitations.service';
import { SpaceAccessService } from '../../spaces/application/space-access.service';

describe('InvitationsService', () => {
  const now = new Date('2026-09-23T00:00:00.000Z');
  const code = '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3';
  let store: jest.Mocked<InvitationStore>;
  let createInvitationMock: jest.MockedFunction<InvitationStore['create']>;
  let spaceAccessService: jest.Mocked<
    Pick<SpaceAccessService, 'listActiveAccessibleSpaces'>
  >;
  let codeSecurity: jest.Mocked<InvitationCodeSecurity>;
  let generateCodeMock: jest.MockedFunction<InvitationCodeSecurity['generate']>;
  let hashCodeMock: jest.MockedFunction<InvitationCodeSecurity['hash']>;
  let revealCodeMock: jest.MockedFunction<InvitationCodeSecurity['reveal']>;
  let clock: jest.Mocked<InvitationClock>;
  let attemptLimiter: jest.Mocked<InvitationAttemptLimiter>;
  let service: InvitationsService;

  beforeEach(() => {
    createInvitationMock = jest.fn();
    store = {
      findPendingBySender: jest.fn().mockResolvedValue(null),
      findByCodeHash: jest.fn().mockResolvedValue(null),
      findClaimsForUser: jest.fn().mockResolvedValue([]),
      findClaimForInvitationAndUser: jest.fn().mockResolvedValue(null),
      deleteClaimForUser: jest.fn().mockResolvedValue(true),
      create: createInvitationMock,
      createClaim: jest.fn(),
      expirePending: jest.fn().mockResolvedValue(undefined),
    };
    spaceAccessService = {
      listActiveAccessibleSpaces: jest.fn().mockResolvedValue([
        {
          kind: 'personal',
          status: 'active',
        },
      ]),
    };
    generateCodeMock = jest.fn().mockReturnValue({
      code,
      codeHash: 'hash-for-code',
      codeCiphertext: 'ciphertext-for-code',
    });
    hashCodeMock = jest.fn().mockReturnValue('hash-for-code');
    revealCodeMock = jest.fn().mockReturnValue(code);
    codeSecurity = {
      generate: generateCodeMock,
      hash: hashCodeMock,
      reveal: revealCodeMock,
    };
    clock = { now: jest.fn().mockReturnValue(now) };
    attemptLimiter = {
      consume: jest.fn().mockReturnValue(true),
    };
    service = new InvitationsService(
      store,
      spaceAccessService,
      codeSecurity,
      clock,
      attemptLimiter,
    );
  });

  it('creates one sender-owned Invite Code that expires seven days later', async () => {
    const created = invitationRecord({
      codeHash: 'hash-for-code',
      codeCiphertext: 'ciphertext-for-code',
      expiresAt: new Date('2026-09-30T00:00:00.000Z'),
    });
    createInvitationMock.mockResolvedValue(created);

    await expect(service.createForUser('42')).resolves.toEqual({
      id: '7',
      code,
      status: 'pending',
      expiresAt: '2026-09-30T00:00:00.000Z',
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    });

    expect(createInvitationMock).toHaveBeenCalledWith({
      senderUserId: '42',
      codeHash: 'hash-for-code',
      codeCiphertext: 'ciphertext-for-code',
      expiresAt: new Date('2026-09-30T00:00:00.000Z'),
    });
  });

  it('returns the same active code when the sender revisits Sharing', async () => {
    store.findPendingBySender.mockResolvedValue(invitationRecord());

    await expect(service.listForUser('42')).resolves.toEqual({
      outgoing: {
        id: '7',
        code,
        status: 'pending',
        expiresAt: '2026-09-30T00:00:00.000Z',
        createdAt: '2026-09-23T00:00:00.000Z',
        updatedAt: '2026-09-23T00:00:00.000Z',
      },
      incoming: [],
    });
    expect(revealCodeMock).toHaveBeenCalledWith('ciphertext-for-code');
  });

  it('does not create an invitation for a User in an active Shared Space', async () => {
    spaceAccessService.listActiveAccessibleSpaces.mockResolvedValue([
      { kind: 'personal', status: 'active' },
      { kind: 'shared', status: 'active' },
    ]);

    await expect(service.createForUser('42')).rejects.toBeInstanceOf(
      InvitationIneligibleError,
    );
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it('rejects a second pending invitation before generating another code', async () => {
    store.findPendingBySender.mockResolvedValue(invitationRecord());

    await expect(service.createForUser('42')).rejects.toBeInstanceOf(
      InvitationAlreadyPendingError,
    );
    expect(generateCodeMock).not.toHaveBeenCalled();
  });

  it('preserves the database conflict when concurrent creation wins elsewhere', async () => {
    createInvitationMock.mockRejectedValue(new InvitationAlreadyPendingError());

    await expect(service.createForUser('42')).rejects.toBeInstanceOf(
      InvitationAlreadyPendingError,
    );
  });

  it('saves a valid code as an incoming invitation without changing membership', async () => {
    store.findByCodeHash.mockResolvedValue(invitationRecord());
    const claim = invitationClaimRecord();
    store.createClaim.mockResolvedValue(claim);

    await expect(
      service.claimForUser('99', '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3', '127.0.0.1'),
    ).resolves.toEqual(incomingView(claim));

    expect(hashCodeMock.mock.calls).toContainEqual([
      '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3',
    ]);
    expect(store.createClaim.mock.calls).toContainEqual([
      { invitationId: '7', userId: '99' },
    ]);
    expect(spaceAccessService.listActiveAccessibleSpaces).toHaveBeenCalledWith(
      '99',
    );
  });

  it('makes repeated claims idempotent for the same User and code', async () => {
    store.findByCodeHash.mockResolvedValue(invitationRecord());
    const claim = invitationClaimRecord();
    store.findClaimForInvitationAndUser.mockResolvedValue(claim);

    await expect(
      service.claimForUser('99', code, '127.0.0.1'),
    ).resolves.toEqual(incomingView(claim));

    expect(store.createClaim.mock.calls).toHaveLength(0);
  });

  it.each([
    ['an unknown code', null, false],
    ['an expired code', invitationRecord({ expiresAt: new Date(now) }), true],
    ['a revoked code', invitationRecord({ status: 'revoked' }), false],
  ])(
    'returns the same unavailable response for %s',
    async (_description, invitation, shouldUseExpiry) => {
      store.findByCodeHash.mockResolvedValue(invitation);
      if (shouldUseExpiry) {
        clock.now.mockReturnValue(new Date('2026-09-30T00:00:00.000Z'));
      }

      await expect(
        service.claimForUser('99', code, '127.0.0.1'),
      ).rejects.toBeInstanceOf(InvitationCodeUnavailableError);
    },
  );

  it('does not let a sender claim their own code or an ineligible User claim any code', async () => {
    store.findByCodeHash.mockResolvedValue(invitationRecord());

    await expect(
      service.claimForUser('42', code, '127.0.0.1'),
    ).rejects.toBeInstanceOf(InvitationCodeUnavailableError);

    spaceAccessService.listActiveAccessibleSpaces.mockResolvedValue([
      { kind: 'personal', status: 'active' },
      { kind: 'shared', status: 'active' },
    ]);
    await expect(
      service.claimForUser('99', code, '127.0.0.1'),
    ).rejects.toBeInstanceOf(InvitationCodeUnavailableError);
  });

  it('turns malformed codes into the same unavailable response', async () => {
    hashCodeMock.mockImplementation(() => {
      throw new Error('Invite Code has an invalid format');
    });

    await expect(
      service.claimForUser('99', 'not-a-code', '127.0.0.1'),
    ).rejects.toBeInstanceOf(InvitationCodeUnavailableError);
  });

  it('rejects a code attempt when either rate-limit bucket is exhausted', async () => {
    attemptLimiter.consume.mockReturnValue(false);

    await expect(
      service.claimForUser('99', code, '127.0.0.1'),
    ).rejects.toBeInstanceOf(InvitationCodeRateLimitedError);
    expect(hashCodeMock).not.toHaveBeenCalled();
  });

  it('lists saved incoming invitations and declines only the requesting User claim', async () => {
    const claim = invitationClaimRecord();
    store.findClaimsForUser.mockResolvedValue([claim]);

    await expect(service.listForUser('99')).resolves.toEqual({
      outgoing: null,
      incoming: [incomingView(claim)],
    });

    await expect(service.declineForUser('99', '88')).resolves.toBeUndefined();
    expect(store.deleteClaimForUser.mock.calls).toContainEqual(['99', '88']);
  });

  it('reports a missing saved invitation without affecting another User claim', async () => {
    store.deleteClaimForUser.mockResolvedValue(false);

    await expect(service.declineForUser('99', '88')).rejects.toBeInstanceOf(
      InvitationClaimNotFoundError,
    );
  });
});

function invitationRecord(
  overrides: Partial<InvitationRecord> = {},
): InvitationRecord {
  return {
    id: '7',
    senderUserId: '42',
    codeHash: 'hash-for-code',
    codeCiphertext: 'ciphertext-for-code',
    status: 'pending',
    expiresAt: new Date('2026-09-30T00:00:00.000Z'),
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    ...overrides,
  };
}

function invitationClaimRecord(
  overrides: Partial<InvitationClaimRecord> = {},
): InvitationClaimRecord {
  return {
    id: '88',
    invitationId: '7',
    userId: '99',
    senderUserId: '42',
    senderName: 'Invite sender',
    status: 'pending',
    expiresAt: new Date('2026-09-30T00:00:00.000Z'),
    createdAt: new Date('2026-09-23T01:00:00.000Z'),
    ...overrides,
  };
}

function incomingView(claim: InvitationClaimRecord) {
  return {
    id: claim.id,
    senderName: claim.senderName,
    status: claim.status,
    expiresAt: claim.expiresAt.toISOString(),
    createdAt: claim.createdAt.toISOString(),
  };
}
