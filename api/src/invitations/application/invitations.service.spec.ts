import type { AccessibleSpaceRecord } from '../../spaces/application/space-store';
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
  InvitationRecord,
  InvitationStore,
  NewDeliveryAttempt,
  NewInvitation,
  UpdateInvitation,
} from './invitation-store';
import {
  InvitationDailyLimitReachedError,
  InvitationNotFoundError,
  InvitationRateLimitedError,
} from './invitation-errors';

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
    await expect(service.getPublic(token)).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
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
});

function createService(
  store: FakeInvitationStore,
  delivery: TestDelivery,
  clock: TestClock,
): InvitationsService {
  return new InvitationsService(
    store,
    new FakeUserStore(),
    new FakeSpaceAccessService(),
    delivery,
    clock,
    'https://app.test',
  );
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

  async send(input: InvitationEmail): Promise<void> {
    this.messages.push(input);
    if (this.fail) throw new Error('provider unavailable');
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
  listActiveAccessibleSpaces(): Promise<AccessibleSpaceRecord[]> {
    return Promise.resolve([]);
  }
}

class FakeInvitationStore implements InvitationStore {
  records: InvitationRecord[] = [];
  private attempts: NewDeliveryAttempt[] = [];
  private nextId = 1;

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

  listIncoming(
    recipientUserId: string,
    recipientEmail: string,
  ): Promise<InvitationRecord[]> {
    return Promise.resolve(
      this.records.filter(
        (record) =>
          record.status === 'pending' &&
          (record.recipientUserId === recipientUserId ||
            record.recipientEmail === recipientEmail),
      ),
    );
  }

  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.tokenHash === tokenHash) ?? null,
    );
  }

  create(input: NewInvitation): Promise<InvitationRecord> {
    const now = new Date(input.lastSentAt);
    const record: InvitationRecord = {
      ...input,
      id: String(this.nextId++),
      status: 'pending',
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

  associateRecipientEmail(
    recipientUserId: string,
    recipientEmail: string,
  ): Promise<void> {
    this.records.forEach((record) => {
      if (
        record.recipientEmail === recipientEmail &&
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

  countDeliveryAttempts(senderUserId: string, since: Date): Promise<number> {
    return Promise.resolve(
      this.attempts.filter(
        (attempt) =>
          attempt.senderUserId === senderUserId && attempt.attemptedAt >= since,
      ).length,
    );
  }

  recordDeliveryAttempt(input: NewDeliveryAttempt): Promise<void> {
    this.attempts.push(input);
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
