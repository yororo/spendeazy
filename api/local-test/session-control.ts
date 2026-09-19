import { Body, Controller, Inject, Module, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import {
  requireAuthenticatedClerkUserId,
  type AuthenticatedRequest,
} from '../src/authentication/authentication';
import { UnauthenticatedError } from '../src/authentication/authentication-errors';
import {
  LOCAL_TEST_SESSION_SCENARIOS,
  type LocalTestSessionScenario,
  type SyntheticSession,
  type SyntheticSessionAuthority,
} from './synthetic-authentication';

export const LOCAL_TEST_SESSION_AUTHORITY = Symbol(
  'LOCAL_TEST_SESSION_AUTHORITY',
);

export class LocalTestSessionRequestDto {
  @IsIn(LOCAL_TEST_SESSION_SCENARIOS)
  scenario!: LocalTestSessionScenario;
}

export interface LocalTestSessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface LocalTestSessionResponse {
  readonly token: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly user: LocalTestSessionUser;
}

export interface LocalTestExpiredSessionResponse {
  readonly expiredSession: LocalTestSessionResponse;
  readonly refreshedSession: LocalTestSessionResponse;
}

export interface LocalTestRevokedSessionResponse {
  readonly revokedSessionId: string;
  readonly resumeSession: LocalTestSessionResponse;
}

@ApiExcludeController()
@Controller('users/me/local-test/sessions')
export class LocalTestSessionController {
  constructor(
    @Inject(LOCAL_TEST_SESSION_AUTHORITY)
    private readonly authority: SyntheticSessionAuthority,
  ) {}

  @Post()
  issueSession(
    @Req()
    request: AuthenticatedRequest,
    @Body() input: LocalTestSessionRequestDto,
  ): LocalTestSessionResponse {
    requireAuthenticatedClerkUserId(request);
    return toSessionResponse(this.authority.issueForScenario(input.scenario));
  }

  @Post('expire')
  expireSession(
    @Req()
    request: AuthenticatedRequest,
  ): LocalTestExpiredSessionResponse {
    const userId = requireAuthenticatedClerkUserId(request);
    const sessions = this.authority.issueExpired(userId);

    return {
      expiredSession: toSessionResponse(sessions.expired),
      refreshedSession: toSessionResponse(sessions.refreshed),
    };
  }

  @Post('revoke')
  revokeSession(
    @Req()
    request: AuthenticatedRequest,
  ): LocalTestRevokedSessionResponse {
    const userId = requireAuthenticatedClerkUserId(request);
    const sessionId = request.authenticatedSession?.sessionId;
    if (!sessionId) throw new UnauthenticatedError();

    const resumeSession = this.authority.issue(userId);
    this.authority.revoke(sessionId);

    return {
      revokedSessionId: sessionId,
      resumeSession: toSessionResponse(resumeSession),
    };
  }
}

@Module({})
export class LocalTestSessionModule {
  static register(authority: SyntheticSessionAuthority) {
    return {
      module: LocalTestSessionModule,
      controllers: [LocalTestSessionController],
      providers: [
        {
          provide: LOCAL_TEST_SESSION_AUTHORITY,
          useValue: authority,
        },
      ],
    };
  }
}

function toSessionResponse(
  session: SyntheticSession,
): LocalTestSessionResponse {
  return {
    token: session.token,
    sessionId: session.sessionId,
    userId: session.userId,
    user: {
      id: session.userId,
      name: session.profile.fullName ?? 'Local Test User',
      email: session.profile.primaryVerifiedEmail ?? '',
    },
  };
}
