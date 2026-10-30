import { useClerk, useUser } from '@clerk/expo';
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { createUserApiClient } from '@/api/user-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { useSpaces } from '@/application/spaces/provider';
import { createProfileWorkflow } from './profile-workflow';
import { chooseNativeProfileImage } from './native-profile-image';
import { createClerkProfileAdapter } from './clerk-profile-adapter';

export function useProfileEditor() {
  const clerk = useClerk();
  const { user: displayedUser } = useUser();
  const authorized = useAuthorizedClient();
  const { refresh } = useSpaces();
  const workflow = useMemo(() => {
    const user = clerk.user;
    const current = () =>
      !!user && clerk.user?.id === user.id && authorized.isCurrent();
    const api = createUserApiClient(authorized);
    const provider = user ? createClerkProfileAdapter(user, current) : null;
    return createProfileWorkflow(
      { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
      {
        current,
        choosePhoto: () => chooseNativeProfileImage(current),
        updateName: async (names) => {
          await provider!.updateName(names);
        },
        updatePhoto: async (photo) => {
          await provider!.updatePhoto(photo);
        },
        synchronize: async () => {
          if (!current()) return;
          await provider!.reload();
          if (!current()) return;
          await api.synchronizeProfile();
          if (current()) await refresh();
        },
      },
    );
  }, [clerk, authorized, refresh]);
  const state = useSyncExternalStore(
    workflow.subscribe,
    workflow.snapshot,
    workflow.snapshot,
  );
  useLayoutEffect(() => {
    workflow.activate();
    return workflow.dispose;
  }, [workflow]);
  return {
    state,
    change: workflow.change,
    save: workflow.save,
    choosePhoto: workflow.choosePhoto,
    photoUrl: state.photo ?? displayedUser?.imageUrl ?? null,
    email: displayedUser?.primaryEmailAddress?.emailAddress ?? '',
  };
}
