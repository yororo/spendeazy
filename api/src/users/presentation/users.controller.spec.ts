import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { UsersService } from '../application/users.service';
import type { UserRecord } from '../application/user-store';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('sets the created status and self Location while serializing the provisioned user', async () => {
    const user = userRecord();
    const usersService = {
      provisionUser: jest.fn().mockResolvedValue({ user, created: true }),
    };
    const controller = new UsersController(
      usersService as unknown as UsersService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.provisionUser(authenticatedRequest(), {}, response),
    ).resolves.toEqual({
      id: '42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: '2026-08-29T00:00:00.123Z',
      updatedAt: '2026-08-29T00:00:00.456Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith('Location', '/api/v1/users/me');
  });
});

function authenticatedRequest(): AuthenticatedRequest {
  return {
    authenticatedSession: {
      userId: 'user_42',
      sessionId: 'session_42',
      claims: {},
    },
  } as AuthenticatedRequest;
}

function userRecord(): UserRecord {
  return {
    id: '42',
    clerkUserId: 'user_42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}
