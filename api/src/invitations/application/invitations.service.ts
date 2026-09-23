import { Inject, Injectable } from '@nestjs/common';

import { SpaceAccessService } from '../../spaces/application/space-access.service';
import {
  INVITATION_CODE_SECURITY,
  type InvitationCodeSecurity,
} from './invitation-code-security';
import {
  InvitationAlreadyPendingError,
  InvitationClaimNotFoundError,
  InvitationCodeRateLimitedError,
  InvitationCodeUnavailableError,
  InvitationIneligibleError,
} from './invitation-errors';
import {
  INVITATION_ATTEMPT_LIMITER,
  type InvitationAttemptLimiter,
} from './invitation-attempt-limiter';
import { INVITATION_CLOCK, type InvitationClock } from './invitation-clock';
import {
  INVITATION_STORE,
  type InvitationRecord,
  type InvitationClaimRecord,
  type InvitationStore,
} from './invitation-store';

export const INVITATION_EXPIRY_DAYS = 7;
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export interface OutgoingInvitationView {
  id: string;
  code: string;
  status: InvitationRecord['status'];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationInboxView {
  outgoing: OutgoingInvitationView | null;
  incoming: IncomingInvitationView[];
}

export interface IncomingInvitationView {
  id: string;
  senderName: string;
  status: InvitationRecord['status'];
  expiresAt: string;
  createdAt: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(INVITATION_STORE)
    private readonly invitationStore: InvitationStore,
    @Inject(SpaceAccessService)
    private readonly spaceAccessService: Pick<
      SpaceAccessService,
      'listActiveAccessibleSpaces'
    >,
    @Inject(INVITATION_CODE_SECURITY)
    private readonly codeSecurity: InvitationCodeSecurity,
    @Inject(INVITATION_CLOCK) private readonly clock: InvitationClock,
    @Inject(INVITATION_ATTEMPT_LIMITER)
    private readonly attemptLimiter: InvitationAttemptLimiter,
  ) {}

  async listForUser(userId: string): Promise<InvitationInboxView> {
    const now = this.clock.now();
    await this.invitationStore.expirePending(now);
    const invitation = await this.invitationStore.findPendingBySender(userId);
    const incoming = await this.invitationStore.findClaimsForUser(userId);

    return {
      outgoing: invitation ? this.toOutgoingView(invitation) : null,
      incoming: incoming.map((claim) => this.toIncomingView(claim)),
    };
  }

  async claimForUser(
    userId: string,
    code: string,
    networkSource: string,
  ): Promise<IncomingInvitationView> {
    const now = this.clock.now();
    if (!this.attemptLimiter.consume(userId, networkSource, now)) {
      throw new InvitationCodeRateLimitedError();
    }

    let invitation: InvitationRecord | null;
    try {
      invitation = await this.invitationStore.findByCodeHash(
        this.codeSecurity.hash(code),
      );
    } catch {
      throw new InvitationCodeUnavailableError();
    }

    if (
      !invitation ||
      invitation.status !== 'pending' ||
      invitation.expiresAt.getTime() <= now.getTime() ||
      invitation.senderUserId === userId
    ) {
      throw new InvitationCodeUnavailableError();
    }

    const activeSpaces =
      await this.spaceAccessService.listActiveAccessibleSpaces(userId);
    if (
      activeSpaces.some(
        (space) => space.kind === 'shared' && space.status === 'active',
      )
    ) {
      throw new InvitationCodeUnavailableError();
    }

    const existing = await this.invitationStore.findClaimForInvitationAndUser(
      invitation.id,
      userId,
    );
    if (existing) {
      return this.toIncomingView(existing);
    }

    return this.toIncomingView(
      await this.invitationStore.createClaim({
        invitationId: invitation.id,
        userId,
      }),
    );
  }

  async declineForUser(userId: string, claimId: string): Promise<void> {
    const deleted = await this.invitationStore.deleteClaimForUser(
      userId,
      claimId,
    );
    if (!deleted) {
      throw new InvitationClaimNotFoundError();
    }
  }

  async createForUser(userId: string): Promise<OutgoingInvitationView> {
    const activeSpaces =
      await this.spaceAccessService.listActiveAccessibleSpaces(userId);
    if (
      activeSpaces.some(
        (space) => space.kind === 'shared' && space.status === 'active',
      )
    ) {
      throw new InvitationIneligibleError();
    }

    const now = this.clock.now();
    await this.invitationStore.expirePending(now);
    const existing = await this.invitationStore.findPendingBySender(userId);
    if (existing) {
      throw new InvitationAlreadyPendingError();
    }

    const generated = this.codeSecurity.generate();
    const invitation = await this.invitationStore.create({
      senderUserId: userId,
      codeHash: generated.codeHash,
      codeCiphertext: generated.codeCiphertext,
      expiresAt: new Date(now.getTime() + INVITATION_EXPIRY_MS),
    });

    return this.toOutgoingView(invitation);
  }

  private toOutgoingView(invitation: InvitationRecord): OutgoingInvitationView {
    return {
      id: invitation.id,
      code: this.codeSecurity.reveal(invitation.codeCiphertext),
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
    };
  }

  private toIncomingView(claim: InvitationClaimRecord): IncomingInvitationView {
    return {
      id: claim.id,
      senderName: claim.senderName,
      status: claim.status,
      expiresAt: claim.expiresAt.toISOString(),
      createdAt: claim.createdAt.toISOString(),
    };
  }
}
