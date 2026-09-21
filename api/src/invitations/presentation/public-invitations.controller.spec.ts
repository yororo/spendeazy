import type { InvitationsService } from '../application/invitations.service';
import { PublicInvitationsController } from './public-invitations.controller';

describe('PublicInvitationsController', () => {
  it('keeps preview and decline as separate service calls', async () => {
    const preview = {
      id: '42',
      senderName: 'Sender',
      recipientEmail: 'person@example.com',
      status: 'pending' as const,
      expiresAt: '2026-09-28T00:00:00.000Z',
      canDecline: true,
    };
    const service = {
      getPublic: jest.fn().mockResolvedValue(preview),
      declinePublic: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PublicInvitationsController(
      service as unknown as InvitationsService,
    );

    await expect(controller.get({ token: 'token' })).resolves.toBe(preview);
    await controller.decline({ token: 'token' }, { confirm: true });

    expect(service.getPublic).toHaveBeenCalledWith('token');
    expect(service.declinePublic).toHaveBeenCalledWith('token');
  });
});
