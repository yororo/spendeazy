import { Inject, Injectable } from '@nestjs/common';

import { SpaceAccessService } from '../../spaces/application/space-access.service';
import {
  INVITATION_CODE_SECURITY,
  type InvitationCodeSecurity,
} from './invitation-code-security';
import {
  InvitationAlreadyPendingError,
  InvitationIneligibleError,
} from './invitation-errors';
import { INVITATION_CLOCK, type InvitationClock } from './invitation-clock';
import {
  INVITATION_STORE,
  type InvitationRecord,
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
    private readonly spaceAccessService: Pick<
      SpaceAccessService,
      'listActiveAccessibleSpaces'
    >,
    @Inject(INVITATION_CODE_SECURITY)
    private readonly codeSecurity: InvitationCodeSecurity,
    @Inject(INVITATION_CLOCK) private readonly clock: InvitationClock,
  ) {}

  async listForUser(userId: string): Promise<InvitationInboxView> {
    const now = this.clock.now();
    await this.invitationStore.expirePending(now);
    const invitation = await this.invitationStore.findPendingBySender(userId);

    return {
      outgoing: invitation ? this.toOutgoingView(invitation) : null,
      incoming: [],
    };
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
}
