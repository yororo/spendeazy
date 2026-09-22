import { Inject, Injectable, Optional } from '@nestjs/common';
import { isEmail } from 'class-validator';

import { CLERK_PROFILE_SERVICE } from '../../authentication/clerk-profile-service';
import type {
  ClerkProfileService,
  ClerkUserProfile,
} from '../../authentication/clerk-profile-service';
import { ClerkProfileUnavailableError } from '../../authentication/authentication-errors';
import { ApplicationError } from '../../errors/application-error';
import { VALIDATION_FAILED_CODE } from '../../errors/application-error-codes';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { AccessibleSpaceRecord } from '../../spaces/application/space-store';
import { type UserRecord } from '../../users/application/user-store';
import {
  INVITATION_CLOCK,
  INVITATION_DELIVERY,
  createInvitationToken,
  hashInvitationToken,
  type InvitationClock,
  type InvitationDelivery,
  type InvitationEmail,
} from './invitation-delivery';
import {
  InvitationAlreadyPendingError,
  InvitationCanceledError,
  InvitationDeclinedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationSelfError,
} from './invitation-errors';
import {
  INVITATION_STORE,
  type DeliveryReservation,
  type InvitationRecord,
  type InvitationStore,
} from './invitation-store';
import {
  INVITATION_ACCEPTANCE_STORE,
  type InvitationAcceptanceStore,
} from './invitation-acceptance-store';
import { assertInvitationSenderEligible } from './invitation-eligibility';
import {
  INVITATION_USER_READER,
  type InvitationUserReader,
} from './invitation-user-reader';

export const INVITATION_EXPIRY_DAYS = 7;
export const INVITATION_RESEND_COOLDOWN_MS = 60_000;
export const INVITATION_DAILY_EMAIL_LIMIT = 5;

const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export interface InvitationView {
  id: string;
  recipientEmail: string;
  status: InvitationRecord['status'];
  expiresAt: string;
  lastSentAt: string | null;
  deliveryStatus: InvitationRecord['deliveryStatus'];
  deliveryError: string | null;
  createdAt: string;
  updatedAt: string;
  senderName?: string;
}

export interface InvitationInboxView {
  outgoing: InvitationView | null;
  incoming: InvitationView[];
}

export interface PublicInvitationView {
  id: string;
  senderName: string;
  recipientEmail: string;
  status: InvitationRecord['status'];
  expiresAt: string;
  canDecline: boolean;
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(INVITATION_STORE)
    private readonly invitationStore: InvitationStore,
    @Inject(INVITATION_USER_READER)
    private readonly userStore: InvitationUserReader,
    private readonly spaceAccessService: SpaceAccessService,
    @Inject(INVITATION_DELIVERY)
    private readonly invitationDelivery: InvitationDelivery,
    @Inject(INVITATION_CLOCK) private readonly clock: InvitationClock,
    @Inject('INVITATION_WEB_BASE_URL')
    private readonly webBaseUrl: string,
    @Optional()
    @Inject(CLERK_PROFILE_SERVICE)
    private readonly clerkProfileService?: ClerkProfileService,
    @Optional()
    @Inject(INVITATION_ACCEPTANCE_STORE)
    private readonly invitationAcceptanceStore?: InvitationAcceptanceStore,
  ) {}

  async listForUser(userId: string): Promise<InvitationInboxView> {
    const now = this.clock.now();
    await this.invitationStore.expirePending(now);
    const user = await this.requireUser(userId);
    const verifiedEmails = await this.verifiedInvitationEmails(user);
    await this.invitationStore.associateRecipientEmails(userId, verifiedEmails);
    const activeSpaces =
      await this.spaceAccessService.listActiveAccessibleSpaces(userId);
    const canReceiveInvitations = !activeSpaces.some(
      (space) => space.kind === 'shared',
    );
    const [outgoing, incoming] = await Promise.all([
      this.invitationStore.findLatestBySender(userId),
      canReceiveInvitations
        ? this.invitationStore.listIncomingForEmails(userId, verifiedEmails)
        : Promise.resolve([]),
    ]);
    return {
      outgoing:
        outgoing &&
        (outgoing.status === 'pending' || outgoing.status === 'expired')
          ? await this.toView(outgoing)
          : null,
      incoming: await Promise.all(incoming.map((item) => this.toView(item))),
    };
  }

  async acceptForUser(
    userId: string,
    invitationId: string,
  ): Promise<AccessibleSpaceRecord> {
    const user = await this.requireUser(userId);
    const verifiedEmails = await this.verifiedInvitationEmails(user);
    if (!this.invitationAcceptanceStore) {
      throw new Error('Invitation acceptance is not configured');
    }

    return this.invitationAcceptanceStore.accept({
      invitationId,
      recipientUserId: userId,
      verifiedRecipientEmails: verifiedEmails,
      now: this.clock.now(),
    });
  }

  async create(
    senderUserId: string,
    recipientEmail: string,
  ): Promise<InvitationView> {
    const now = this.clock.now();
    const sender = await this.requireUser(senderUserId);
    await this.assertSenderEligible(senderUserId);
    await this.invitationStore.expirePending(now);

    const normalizedRecipientEmail = normalizeInvitationEmail(recipientEmail);
    if (normalizedRecipientEmail === sender.email) {
      throw new InvitationSelfError();
    }

    const existing =
      await this.invitationStore.findPendingBySender(senderUserId);
    if (existing) throw new InvitationAlreadyPendingError();

    const recipient = await this.userStore.findByEmail(
      normalizedRecipientEmail,
    );
    const token = createInvitationToken();
    const invitation = await this.invitationStore.create({
      senderUserId,
      recipientEmail: normalizedRecipientEmail,
      recipientUserId: recipient?.id ?? null,
      tokenHash: hashInvitationToken(token),
      expiresAt: addExpiry(now),
      lastSentAt: null,
    });
    let reservation: DeliveryReservation;
    try {
      reservation = await this.invitationStore.reserveDeliveryAttempt({
        senderUserId,
        invitationId: invitation.id,
        now,
        cooldownMs: 0,
        dailyLimit: INVITATION_DAILY_EMAIL_LIMIT,
        since: startOfUtcDay(now),
      });
    } catch (error: unknown) {
      await this.invitationStore.update(invitation.id, { status: 'canceled' });
      throw error;
    }
    await this.deliver(invitation, token, sender, reservation);
    const current =
      (await this.invitationStore.findBySender(senderUserId, invitation.id)) ??
      invitation;
    return this.toView(current);
  }

  async cancel(senderUserId: string, invitationId: string): Promise<void> {
    const invitation = await this.requireSenderInvitation(
      senderUserId,
      invitationId,
    );
    if (invitation.status === 'canceled') return;
    if (invitation.status === 'declined') throw new InvitationDeclinedError();
    if (invitation.status === 'expired') throw new InvitationExpiredError();
    if (invitation.status === 'accepted') throw new InvitationNotFoundError();
    const canceled = await this.invitationStore.update(invitation.id, {
      status: 'canceled',
    });
    if (canceled?.status === 'canceled') return;
    if (canceled?.status === 'declined') throw new InvitationDeclinedError();
    if (canceled?.status === 'expired') throw new InvitationExpiredError();
    throw new InvitationNotFoundError();
  }

  async resend(
    senderUserId: string,
    invitationId: string,
  ): Promise<InvitationView> {
    const now = this.clock.now();
    const sender = await this.requireUser(senderUserId);
    const invitation = await this.requireSenderInvitation(
      senderUserId,
      invitationId,
    );
    if (invitation.status === 'canceled') throw new InvitationCanceledError();
    if (invitation.status === 'declined') throw new InvitationDeclinedError();
    if (invitation.status === 'accepted') throw new InvitationNotFoundError();
    const reservation = await this.invitationStore.reserveDeliveryAttempt({
      senderUserId,
      invitationId: invitation.id,
      now,
      cooldownMs: INVITATION_RESEND_COOLDOWN_MS,
      dailyLimit: INVITATION_DAILY_EMAIL_LIMIT,
      since: startOfUtcDay(now),
    });

    const token = createInvitationToken();
    const updated = await this.invitationStore.update(invitation.id, {
      tokenHash: hashInvitationToken(token),
      status: 'pending',
      expiresAt: addExpiry(now),
      deliveryStatus: 'pending',
      deliveryError: null,
    });
    if (!updated) {
      await this.invitationStore.completeDeliveryAttempt(
        reservation.id,
        false,
        'Invitation could not be updated',
      );
      throw new InvitationNotFoundError();
    }
    if (updated.status !== 'pending') {
      await this.invitationStore.completeDeliveryAttempt(
        reservation.id,
        false,
        'Invitation is no longer pending',
      );
      throw new InvitationNotFoundError();
    }
    await this.deliver(updated, token, sender, reservation);
    const current =
      (await this.invitationStore.findBySender(senderUserId, invitation.id)) ??
      updated;
    return this.toView(current);
  }

  async declineForUser(userId: string, invitationId: string): Promise<void> {
    const user = await this.requireUser(userId);
    const verifiedEmails = await this.verifiedInvitationEmails(user);
    await this.invitationStore.associateRecipientEmails(userId, verifiedEmails);
    const invitation = (
      await this.invitationStore.listIncomingForEmails(userId, verifiedEmails)
    ).find((item) => item.id === invitationId);
    if (!invitation) throw new InvitationNotFoundError();
    await this.declineRecord(invitation);
  }

  async getPublic(token: string): Promise<PublicInvitationView> {
    const invitation = await this.findPublicPreviewRecord(token);
    const sender = await this.requireUser(invitation.senderUserId);
    const status = publicInvitationStatus(invitation, this.clock.now());
    return {
      id: invitation.id,
      senderName: sender.name,
      recipientEmail: invitation.recipientEmail,
      status,
      expiresAt: invitation.expiresAt.toISOString(),
      canDecline: status === 'pending',
    };
  }

  async declinePublic(token: string): Promise<void> {
    const invitation = await this.findPublicRecord(token);
    await this.declineRecord(invitation);
  }

  private async findPublicRecord(token: string): Promise<InvitationRecord> {
    const invitation = await this.invitationStore.findByTokenHash(
      hashInvitationToken(token),
    );
    if (!invitation) throw new InvitationNotFoundError();
    if (
      invitation.status === 'pending' &&
      invitation.expiresAt <= this.clock.now()
    ) {
      throw new InvitationExpiredError();
    }
    if (invitation.status === 'expired') throw new InvitationExpiredError();
    if (invitation.status !== 'pending') {
      throw new InvitationNotFoundError();
    }
    return invitation;
  }

  private async findPublicPreviewRecord(
    token: string,
  ): Promise<InvitationRecord> {
    const invitation = await this.invitationStore.findByTokenHash(
      hashInvitationToken(token),
    );
    if (!invitation) throw new InvitationNotFoundError();
    return invitation;
  }

  private async declineRecord(invitation: InvitationRecord): Promise<void> {
    if (
      invitation.status === 'pending' &&
      invitation.expiresAt <= this.clock.now()
    ) {
      await this.invitationStore.update(invitation.id, { status: 'expired' });
      throw new InvitationExpiredError();
    }
    if (invitation.status === 'expired') throw new InvitationExpiredError();
    if (invitation.status === 'canceled') throw new InvitationCanceledError();
    if (invitation.status === 'declined') return;
    const declined = await this.invitationStore.update(invitation.id, {
      status: 'declined',
    });
    if (declined?.status === 'declined') return;
    if (declined?.status === 'canceled') {
      throw new InvitationCanceledError();
    }
    if (declined?.status === 'expired') throw new InvitationExpiredError();
    throw new InvitationNotFoundError();
  }

  private async deliver(
    invitation: InvitationRecord,
    token: string,
    sender: UserRecord,
    reservation: DeliveryReservation,
  ): Promise<void> {
    const email: InvitationEmail = {
      invitationId: invitation.id,
      recipientEmail: invitation.recipientEmail,
      senderName: sender.name,
      invitationUrl: `${this.webBaseUrl.replace(/\/$/u, '')}/invite/${encodeURIComponent(token)}`,
    };
    let deliveryError: string | null = null;
    try {
      await this.invitationDelivery.send(email);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Delivery failed';
      deliveryError = message.slice(0, 500);
    }

    await this.invitationStore.completeDeliveryAttempt(
      reservation.id,
      deliveryError === null,
      deliveryError,
    );
    await this.invitationStore.update(invitation.id, {
      deliveryStatus: deliveryError === null ? 'sent' : 'failed',
      deliveryError,
    });
  }

  private async assertSenderEligible(senderUserId: string): Promise<void> {
    const spaces =
      await this.spaceAccessService.listActiveAccessibleSpaces(senderUserId);
    assertInvitationSenderEligible(spaces);
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.userStore.findById(userId);
    if (!user) throw new InvitationNotFoundError();
    return user;
  }

  private async requireSenderInvitation(
    senderUserId: string,
    invitationId: string,
  ): Promise<InvitationRecord> {
    const invitation = await this.invitationStore.findBySender(
      senderUserId,
      invitationId,
    );
    if (!invitation) throw new InvitationNotFoundError();
    return invitation;
  }

  private async verifiedInvitationEmails(user: UserRecord): Promise<string[]> {
    if (!this.clerkProfileService) return [user.email];

    let profile: ClerkUserProfile | null;
    try {
      profile = await this.clerkProfileService.getUserProfile(user.clerkUserId);
    } catch {
      throw new ClerkProfileUnavailableError();
    }
    if (!profile) return [];

    const candidates = [
      profile.primaryVerifiedEmail,
      ...(profile.verifiedEmails ?? []),
    ];
    return [
      ...new Set(
        candidates
          .filter((email): email is string => typeof email === 'string')
          .map(normalizeInvitationEmailSafely)
          .filter((email): email is string => email !== null),
      ),
    ];
  }

  private async toView(invitation: InvitationRecord): Promise<InvitationView> {
    const sender = await this.userStore.findById(invitation.senderUserId);
    return {
      id: invitation.id,
      recipientEmail: invitation.recipientEmail,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      lastSentAt: invitation.lastSentAt?.toISOString() ?? null,
      deliveryStatus: invitation.deliveryStatus,
      deliveryError: invitation.deliveryError,
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
      ...(sender ? { senderName: sender.name } : {}),
    };
  }
}

function normalizeInvitationEmailSafely(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return isEmail(normalized) ? normalized : null;
}

export function normalizeInvitationEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isEmail(normalized)) {
    throw new ApplicationError(
      VALIDATION_FAILED_CODE,
      'Invalid invitation email',
      [
        {
          field: '/email',
          code: 'invalid_format',
          message: 'Email must be a valid email address',
        },
      ],
    );
  }
  return normalized;
}

function addExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_EXPIRY_MS);
}

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function publicInvitationStatus(
  invitation: InvitationRecord,
  now: Date,
): InvitationRecord['status'] {
  return invitation.status === 'pending' && invitation.expiresAt <= now
    ? 'expired'
    : invitation.status;
}
