import {
  InvitationAlreadyPendingError,
  InvitationIneligibleError,
} from './invitation-errors';
import {
  type InvitationRecord,
  type InvitationStore,
} from './invitation-store';
import { type InvitationCodeSecurity } from './invitation-code-security';
import { type InvitationClock } from './invitation-clock';
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
  let revealCodeMock: jest.MockedFunction<InvitationCodeSecurity['reveal']>;
  let clock: jest.Mocked<InvitationClock>;
  let service: InvitationsService;

  beforeEach(() => {
    createInvitationMock = jest.fn();
    store = {
      findPendingBySender: jest.fn().mockResolvedValue(null),
      create: createInvitationMock,
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
    revealCodeMock = jest.fn().mockReturnValue(code);
    codeSecurity = {
      generate: generateCodeMock,
      hash: jest.fn(),
      reveal: revealCodeMock,
    };
    clock = { now: jest.fn().mockReturnValue(now) };
    service = new InvitationsService(
      store,
      spaceAccessService,
      codeSecurity,
      clock,
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
