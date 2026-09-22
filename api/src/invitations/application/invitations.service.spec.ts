import type { AccessibleSpaceRecord } from '../../spaces/application/space-store';
import type {
  ClerkProfileService,
  ClerkUserProfile,
} from '../../authentication/clerk-profile-service';
import type {
  AcceptInvitationInput,
  InvitationAcceptanceStore,
} from './invitation-acceptance-store';
import type { UserRecord, UserStore } from '../../users/application/user-store';
import type {
  InvitationClock,
  InvitationDelivery,
  InvitationEmail,
} from './invitation-delivery';
import {
  INVITATION_DAILY_EMAIL_LIMIT,
  INVITATION_RESEND_COOLDOWN_MS,
  InvitationsService,
} from './invitations.service';
import type {
  DeliveryReservation,
  DeliveryReservationRequest,
  InvitationRecord,
  InvitationStore,
  NewInvitation,
  UpdateInvitation,
} from './invitation-store';
import {
  InvitationCanceledError,
  InvitationDailyLimitReachedError,
  InvitationDeclinedError,
  InvitationNotFoundError,
  InvitationRateLimitedError,
} from './invitation-errors';

interface FakeDeliveryAttempt {
  invitationId: string;
  senderUserId: string;
  attemptedAt: Date;
  succeeded: boolean;
  error: string | null;
}

describe('InvitationsService', () => {
  it('keeps registered and unregistered sends uniform while storing a seven-day link', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const delivery = new TestDelivery();
    const store = new FakeInvitationStore();
    const service = createService(store, delivery, clock);

    const registered = await service.create('1', 'Companion@Example.Test');
    store.reset();
    const secondService = createService(store, delivery, clock);
    await expect(
      secondService.create('2', 'unregistered@example.test'),
    ).resolves.toMatchObject({
      recipientEmail: 'unregistered@example.test',
      deliveryStatus: 'sent',
    });

    expect(registered.recipientEmail).toBe('companion@example.test');
    expect(new Date(registered.expiresAt).getTime()).toBe(
      clock.now().getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(delivery.messages.map((message) => message.recipientEmail)).toEqual([
      'companion@example.test',
      'unregistered@example.test',
    ]);
    expect(delivery.messages[0].invitationUrl).toMatch(
      /^https:\/\/app\.test\/invite\/[A-Za-z0-9_-]+$/u,
    );
    expect(store.records[0].recipientUserId).toBe('2');
  });

  it('does not mutate state for preview and requires confirmation for public decline', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const delivery = new TestDelivery();
    const store = new FakeInvitationStore();
    const service = createService(store, delivery, clock);
    await service.create('1', 'unregistered@example.test');
    const token = delivery.messages[0].invitationUrl.split('/').at(-1)!;

    await expect(service.getPublic(token)).resolves.toMatchObject({
      senderName: 'Sender',
      status: 'pending',
      canDecline: true,
    });
    expect(store.records[0].status).toBe('pending');

    await service.declinePublic(token);
    expect(store.records[0].status).toBe('declined');
    await expect(service.getPublic(token)).resolves.toMatchObject({
      status: 'declined',
      canDecline: false,
    });
  });

  it('invalidates the previous link on resend and enforces cooldown and daily limits', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const delivery = new TestDelivery();
    const store = new FakeInvitationStore();
    const service = createService(store, delivery, clock);
    const invitation = await service.create('1', 'unregistered@example.test');
    const oldToken = delivery.messages[0].invitationUrl.split('/').at(-1)!;

    await expect(service.resend('1', invitation.id)).rejects.toBeInstanceOf(
      InvitationRateLimitedError,
    );
    clock.advance(INVITATION_RESEND_COOLDOWN_MS);
    const resent = await service.resend('1', invitation.id);
    const newToken = delivery.messages[1].invitationUrl.split('/').at(-1)!;
    expect(newToken).not.toBe(oldToken);
    await expect(service.getPublic(oldToken)).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    await expect(service.getPublic(newToken)).resolves.toMatchObject({
      id: resent.id,
    });

    for (
      let attempt = 0;
      attempt < INVITATION_DAILY_EMAIL_LIMIT - 2;
      attempt += 1
    ) {
      clock.advance(INVITATION_RESEND_COOLDOWN_MS);
      await service.resend('1', invitation.id);
    }
    clock.advance(INVITATION_RESEND_COOLDOWN_MS);
    await expect(service.resend('1', invitation.id)).rejects.toBeInstanceOf(
      InvitationDailyLimitReachedError,
    );
  });

  it('persists delivery failure and allows a rate-limited retry', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const delivery = new TestDelivery();
    delivery.fail = true;
    const store = new FakeInvitationStore();
    const service = createService(store, delivery, clock);
    const invitation = await service.create('1', 'unregistered@example.test');
    expect(invitation.deliveryStatus).toBe('failed');
    expect(invitation.deliveryError).toBe('provider unavailable');

    delivery.fail = false;
    clock.advance(INVITATION_RESEND_COOLDOWN_MS);
    await expect(service.resend('1', invitation.id)).resolves.toMatchObject({
      deliveryStatus: 'sent',
      deliveryError: null,
    });
  });

  it('does not expose incoming invitations while the recipient has an active Shared Space', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const delivery = new TestDelivery();
    const store = new FakeInvitationStore();
    const senderService = createService(store, delivery, clock);
    await senderService.create('1', 'companion@example.test');

    const recipientService = createService(store, delivery, clock, [
      { kind: 'shared' } as AccessibleSpaceRecord,
    ]);
    await expect(recipientService.listForUser('2')).resolves.toMatchObject({
      incoming: [],
    });
  });

  it('reports an expired preview without mutating the invitation', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const delivery = new TestDelivery();
    const store = new FakeInvitationStore();
    const service = createService(store, delivery, clock);
    await service.create('1', 'unregistered@example.test');
    const token = delivery.messages[0].invitationUrl.split('/').at(-1)!;

    clock.advance(7 * 24 * 60 * 60 * 1000);
    await expect(service.getPublic(token)).resolves.toMatchObject({
      status: 'expired',
      canDecline: false,
    });
    expect(store.records[0].status).toBe('pending');
  });

  it.each(['expired', 'canceled', 'declined', 'accepted'] as const)(
    'reports a %s invitation without authorizing acceptance',
    async (status) => {
      const clock = new TestClock('2026-09-21T00:00:00.000Z');
      const delivery = new TestDelivery();
      const store = new FakeInvitationStore();
      const service = createService(store, delivery, clock);
      await service.create('1', 'unregistered@example.test');
      const token = delivery.messages[0].invitationUrl.split('/').at(-1)!;
      store.records[0].status = status;

      await expect(service.getPublic(token)).resolves.toMatchObject({
        status,
        canDecline: false,
      });
      expect(store.records[0].status).toBe(status);
    },
  );

  it('passes every verified identity email to the acceptance boundary', async () => {
    const clock = new TestClock('2026-09-21T00:00:00.000Z');
    const acceptanceStore = new FakeInvitationAcceptanceStore();
    const service = createService(
      new FakeInvitationStore(),
      new TestDelivery(),
      clock,
      [],
      new FakeProfileService({
        fullName: 'Companion',
        primaryVerifiedEmail: 'companion@example.test',
        verifiedEmails: [
          'COMPANION@example.test',
          'companion.secondary@example.test',
        ],
      }),
      acceptanceStore,
    );

    await expect(service.acceptForUser('2', '42')).resolves.toMatchObject({
      kind: 'shared',
      userId: '2',
    });
    expect(acceptanceStore.input).toMatchObject({
      invitationId: '42',
      recipientUserId: '2',
      verifiedRecipientEmails: [
        'companion@example.test',
        'companion.secondary@example.test',
      ],
    });
  });

  it('does not authorize an invitation when its email is not verified', async () => {
    const acceptanceStore = new FakeInvitationAcceptanceStore(
      'companion.secondary@example.test',
    );
    const service = createService(
      new FakeInvitationStore(),
      new TestDelivery(),
      new TestClock('2026-09-21T00:00:00.000Z'),
      [],
      new FakeProfileService({
        fullName: 'Companion',
        primaryVerifiedEmail: 'companion@example.test',
        verifiedEmails: ['companion@example.test'],
      }),
      acceptanceStore,
    );

    await expect(service.acceptForUser('2', '42')).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
  });
});

function createService(
  store: FakeInvitationStore,
  delivery: TestDelivery,
  clock: TestClock,
  activeSpaces: AccessibleSpaceRecord[] = [],
  profileService?: ClerkProfileService,
  acceptanceStore?: InvitationAcceptanceStore,
): InvitationsService {
  return new InvitationsService(
    store,
    new FakeUserStore(),
    new FakeSpaceAccessService(activeSpaces),
    delivery,
    clock,
    'https://app.test',
    profileService,
    acceptanceStore,
  );
}

class FakeProfileService implements ClerkProfileService {
  constructor(private readonly profile: ClerkUserProfile) {}

  getUserProfile(): Promise<ClerkUserProfile> {
    return Promise.resolve(this.profile);
  }
}

class FakeInvitationAcceptanceStore implements InvitationAcceptanceStore {
  input: AcceptInvitationInput | undefined;

  constructor(
    private readonly requiredEmail = 'companion.secondary@example.test',
  ) {}

  accept(input: AcceptInvitationInput): Promise<AccessibleSpaceRecord> {
    this.input = input;
    if (!input.verifiedRecipientEmails.includes(this.requiredEmail)) {
      return Promise.reject(new InvitationNotFoundError());
    }

    const timestamp = new Date('2026-09-21T00:00:00.000Z');
    return Promise.resolve({
      id: '99',
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
      userId: input.recipientUserId,
      accessLevel: 'write',
      members: [
        { id: '1', name: 'Sender' },
        { id: input.recipientUserId, name: 'Companion' },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

class TestClock implements InvitationClock {
  private current: Date;

  constructor(value: string) {
    this.current = new Date(value);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class TestDelivery implements InvitationDelivery {
  readonly messages: InvitationEmail[] = [];
  fail = false;

  send(input: InvitationEmail): Promise<void> {
    this.messages.push(input);
    return this.fail
      ? Promise.reject(new Error('provider unavailable'))
      : Promise.resolve();
  }
}

class FakeUserStore implements UserStore {
  private readonly users: UserRecord[] = [
    user('1', 'Sender', 'sender@example.test'),
    user('2', 'Companion', 'companion@example.test'),
  ];

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((item) => item.id === id) ?? null);
  }

  findByClerkUserId(): Promise<UserRecord | null> {
    return Promise.resolve(null);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(
      this.users.find((item) => item.email === email) ?? null,
    );
  }

  create(): Promise<UserRecord> {
    throw new Error('not used');
  }

  update(): Promise<UserRecord | null> {
    throw new Error('not used');
  }
}

class FakeSpaceAccessService {
  constructor(private readonly spaces: AccessibleSpaceRecord[] = []) {}

  listActiveAccessibleSpaces(): Promise<AccessibleSpaceRecord[]> {
    return Promise.resolve(this.spaces);
  }
}

class FakeInvitationStore implements InvitationStore {
  records: InvitationRecord[] = [];
  private attempts: FakeDeliveryAttempt[] = [];
  private readonly reservations = new Map<string, FakeDeliveryAttempt>();
  private nextId = 1;
  private nextAttemptId = 1;

  findPendingBySender(senderUserId: string): Promise<InvitationRecord | null> {
    return Promise.resolve(
      this.records.find(
        (record) =>
          record.senderUserId === senderUserId && record.status === 'pending',
      ) ?? null,
    );
  }

  findLatestBySender(senderUserId: string): Promise<InvitationRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.senderUserId === senderUserId) ??
        null,
    );
  }

  findBySender(
    senderUserId: string,
    invitationId: string,
  ): Promise<InvitationRecord | null> {
    return Promise.resolve(
      this.records.find(
        (record) =>
          record.senderUserId === senderUserId && record.id === invitationId,
      ) ?? null,
    );
  }

  listIncomingForEmails(
    recipientUserId: string,
    recipientEmails: readonly string[],
  ): Promise<InvitationRecord[]> {
    return Promise.resolve(
      this.records.filter(
        (record) =>
          record.status === 'pending' &&
          (record.recipientUserId === recipientUserId ||
            (record.recipientUserId === null &&
              recipientEmails.includes(record.recipientEmail))),
      ),
    );
  }

  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.tokenHash === tokenHash) ?? null,
    );
  }

  create(input: NewInvitation): Promise<InvitationRecord> {
    const now = new Date(input.lastSentAt ?? input.expiresAt);
    const record: InvitationRecord = {
      ...input,
      id: String(this.nextId++),
      status: 'pending',
      acceptedSpaceId: null,
      deliveryStatus: input.deliveryStatus ?? 'pending',
      deliveryError: input.deliveryError ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return Promise.resolve(record);
  }

  update(
    invitationId: string,
    input: UpdateInvitation,
  ): Promise<InvitationRecord | null> {
    const record = this.records.find((item) => item.id === invitationId);
    if (!record) return Promise.resolve(null);
    Object.assign(record, input, {
      updatedAt: new Date(record.updatedAt.getTime() + 1),
    });
    return Promise.resolve(record);
  }

  associateRecipientEmails(
    recipientUserId: string,
    recipientEmails: readonly string[],
  ): Promise<void> {
    this.records.forEach((record) => {
      if (
        recipientEmails.includes(record.recipientEmail) &&
        record.recipientUserId === null
      ) {
        record.recipientUserId = recipientUserId;
      }
    });
    return Promise.resolve();
  }

  expirePending(before: Date): Promise<void> {
    this.records.forEach((record) => {
      if (record.status === 'pending' && record.expiresAt <= before)
        record.status = 'expired';
    });
    return Promise.resolve();
  }

  reserveDeliveryAttempt({
    senderUserId,
    invitationId,
    now,
    cooldownMs,
    dailyLimit,
    since,
  }: DeliveryReservationRequest): Promise<DeliveryReservation> {
    const invitation = this.records.find(
      (record) =>
        record.id === invitationId && record.senderUserId === senderUserId,
    );
    if (!invitation) return Promise.reject(new InvitationNotFoundError());
    if (invitation.status === 'canceled') {
      return Promise.reject(new InvitationCanceledError());
    }
    if (invitation.status === 'declined') {
      return Promise.reject(new InvitationDeclinedError());
    }
    if (
      invitation.lastSentAt &&
      now.getTime() - invitation.lastSentAt.getTime() < cooldownMs
    ) {
      return Promise.reject(new InvitationRateLimitedError());
    }
    if (
      this.attempts.filter(
        (attempt) =>
          attempt.senderUserId === senderUserId && attempt.attemptedAt >= since,
      ).length >= dailyLimit
    ) {
      return Promise.reject(new InvitationDailyLimitReachedError());
    }

    invitation.lastSentAt = now;
    invitation.deliveryStatus = 'pending';
    invitation.deliveryError = null;
    const id = String(this.nextAttemptId++);
    const attempt: FakeDeliveryAttempt = {
      invitationId,
      senderUserId,
      attemptedAt: now,
      succeeded: false,
      error: null,
    };
    this.attempts.push(attempt);
    this.reservations.set(id, attempt);
    return Promise.resolve({ id });
  }

  completeDeliveryAttempt(
    attemptId: string,
    succeeded: boolean,
    error: string | null,
  ): Promise<void> {
    const attempt = this.reservations.get(attemptId);
    if (attempt) {
      attempt.succeeded = succeeded;
      attempt.error = error;
    }
    return Promise.resolve();
  }

  reset(): void {
    this.records.forEach((record) => {
      record.status = 'canceled';
    });
  }
}

function user(id: string, name: string, email: string): UserRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    clerkUserId: `clerk-${id}`,
    name,
    email,
    createdAt: now,
    updatedAt: now,
  };
}
