import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createInvitationsApiClient, type InvitationInbox } from '@/api/invitations-api-client';
import { createSpacesApiClient } from '@/api/spaces-api-client';
import { ExpenseApiError, requestFailureMessage } from '@/api/request-failure';
import { useAuthorizedClient } from '@/application/authorized-client';
import { useSpaces } from '@/application/spaces/provider';

type SharingState = {
  inbox: InvitationInbox | null;
  loading: boolean;
  busy: string | null;
  error: string | null;
  notice: string | null;
};

const initialState: SharingState = { inbox: null, loading: true, busy: null, error: null, notice: null };

export function useSharing() {
  const authorized = useAuthorizedClient();
  const { active, spaces, refresh: refreshSpaces, selectSpaceId } = useSpaces();
  const api = useMemo(() => createInvitationsApiClient(authorized), [authorized]);
  const spacesApi = useMemo(() => createSpacesApiClient(authorized), [authorized]);
  const [state, setState] = useState(initialState);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const inbox = await api.list();
      setState((current) => ({ ...current, inbox, loading: false }));
    } catch (cause) {
      setState((current) => ({ ...current, loading: false, error: invitationErrorMessage(cause) }));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const perform = useCallback(async (
    name: string,
    action: () => Promise<string | void>,
  ) => {
    setState((current) => ({ ...current, busy: name, error: null, notice: null }));
    try {
      const notice = await action();
      setState((current) => ({ ...current, busy: null, notice: notice ?? null }));
      return true;
    } catch (cause) {
      setState((current) => ({ ...current, busy: null, error: invitationErrorMessage(cause) }));
      return false;
    }
  }, []);

  return {
    state,
    active,
    hasActiveSharedSpace: spaces.some((space) => space.kind === 'shared' && space.status === 'active'),
    activeSharedSpace: active?.kind === 'shared' && active.status === 'active',
    load,
    async create() {
      return perform('create', async () => {
        const outgoing = await api.create();
        setState((current) => ({ ...current, inbox: current.inbox ? { ...current.inbox, outgoing } : { outgoing, incoming: [] } }));
        return 'Invite Code created. Share it directly with the other person.';
      });
    },
    async rotate() {
      return perform('rotate', async () => {
        const outgoing = await api.rotate();
        setState((current) => ({ ...current, inbox: current.inbox ? { ...current.inbox, outgoing } : { outgoing, incoming: [] } }));
        return 'Invite Code rotated. The previous code and claims made with it are no longer available.';
      });
    },
    async revoke() {
      return perform('revoke', async () => {
        await api.revoke();
        setState((current) => ({ ...current, inbox: current.inbox ? { ...current.inbox, outgoing: null } : current.inbox }));
        return 'Invite Code revoked.';
      });
    },
    async copyCode() {
      const code = state.inbox?.outgoing?.code;
      if (!code) return false;
      return perform('copy', async () => {
        await Clipboard.setStringAsync(code, { android: { isSensitive: true } });
        return 'Invite Code copied.';
      });
    },
    async claim(code: string) {
      return perform('claim', async () => {
        const incoming = await api.claim(code.trim());
        setState((current) => ({ ...current, inbox: current.inbox ? { ...current.inbox, incoming: [incoming, ...current.inbox.incoming.filter((item) => item.id !== incoming.id)] } : { outgoing: null, incoming: [incoming] } }));
        return `Invitation from ${incoming.senderName} saved. Review it below and choose Join or Decline.`;
      });
    },
    async decline(claimId: string) {
      return perform('decline', async () => {
        await api.decline(claimId);
        setState((current) => ({ ...current, inbox: current.inbox ? { ...current.inbox, incoming: current.inbox.incoming.filter((item) => item.id !== claimId) } : current.inbox }));
        return 'Invitation declined.';
      });
    },
    async accept(claimId: string) {
      return perform('accept', async () => {
        const joined = await api.accept(claimId);
        await refreshSpaces();
        await selectSpaceId(joined.id);
        const inbox = await api.list();
        setState((current) => ({ ...current, inbox }));
        return `Joined ${joined.members.map((member) => member.name).join(' and ')}. The new Shared Space is active.`;
      });
    },
    async leave() {
      if (!active?.id) return false;
      return perform('leave', async () => {
        await spacesApi.leaveSharedSpace(active.id);
        await refreshSpaces();
        return 'Shared Space archived for both members. Expense, Activity, and import history remain read-only.';
      });
    },
  };
}

function invitationErrorMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError) {
    if (cause.code === 'INVITATION_CODE_UNAVAILABLE') {
      return 'This Invite Code is invalid, expired, revoked, or already used. Ask the sender for a current code.';
    }
    if (cause.code === 'INVITATION_INELIGIBLE') {
      return 'You already belong to an active Shared Space. Switch to it or leave before joining another.';
    }
  }
  return requestFailureMessage(cause);
}
