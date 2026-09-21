import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { InvitationsService } from '../application/invitations.service';
import { InvitationsController } from './invitations.controller';

describe('InvitationsController', () => {
  it('passes the authenticated user through when listing invitations', async () => {
    const inbox = { outgoing: null, incoming: [] };
    const service = { listForUser: jest.fn().mockResolvedValue(inbox) };
    const controller = new InvitationsController(
      service as unknown as InvitationsService,
    );

    await expect(controller.list(authenticatedRequest())).resolves.toBe(inbox);
    expect(service.listForUser).toHaveBeenCalledWith('7');
  });

  it('creates an invitation with the transport email', async () => {
    const invitation = { id: '42', recipientEmail: 'person@example.com' };
    const service = { create: jest.fn().mockResolvedValue(invitation) };
    const controller = new InvitationsController(
      service as unknown as InvitationsService,
    );

    await expect(
      controller.create(authenticatedRequest(), {
        email: ' person@example.com ',
      }),
    ).resolves.toBe(invitation);
    expect(service.create).toHaveBeenCalledWith('7', ' person@example.com ');
  });

  it('requires the confirmation body before declining an incoming invitation', async () => {
    const service = { declineForUser: jest.fn().mockResolvedValue(undefined) };
    const controller = new InvitationsController(
      service as unknown as InvitationsService,
    );

    await controller.decline(
      authenticatedRequest(),
      { invitationId: '42' },
      { confirm: true },
    );
    expect(service.declineForUser).toHaveBeenCalledWith('7', '42');
  });
});

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}
