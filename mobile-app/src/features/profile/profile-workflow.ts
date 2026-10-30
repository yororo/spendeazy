export type ProfileNames = { firstName: string; lastName: string };
export type ProfileEditorState = ProfileNames & {
  photo: string | null;
  phase: 'ready' | 'choosing' | 'saving' | 'sync-needed' | 'saved';
  error: string | null;
};
type ProfileEvent =
  | { type: 'namesChanged' | 'namesSaved'; names: Partial<ProfileNames> }
  | { type: 'photoChoiceStarted' | 'saveStarted' | 'photoSaved' | 'disposed' }
  | { type: 'photoChoiceFinished'; photo: string | null }
  | { type: 'rejected' | 'synchronized' | 'syncFailed'; error: string | null }
  | { type: 'activated'; names: ProfileNames };

function profileReducer(
  state: ProfileEditorState,
  event: ProfileEvent,
): ProfileEditorState {
  switch (event.type) {
    case 'namesChanged':
      return { ...state, ...event.names, phase: 'ready', error: null };
    case 'namesSaved':
      return { ...state, ...event.names };
    case 'photoChoiceStarted':
      return { ...state, phase: 'choosing', error: null };
    case 'photoChoiceFinished':
      return { ...state, phase: 'ready', photo: event.photo ?? state.photo };
    case 'saveStarted':
      return { ...state, phase: 'saving', error: null };
    case 'photoSaved':
      return { ...state, photo: null };
    case 'rejected':
      return { ...state, phase: 'ready', error: event.error };
    case 'synchronized':
      return {
        ...state,
        phase: event.error ? 'ready' : 'saved',
        error: event.error,
      };
    case 'syncFailed':
      return { ...state, phase: 'sync-needed', error: event.error };
    case 'activated':
      return { ...event.names, photo: null, phase: 'ready', error: null };
    case 'disposed':
      return {
        firstName: '',
        lastName: '',
        photo: null,
        phase: 'ready',
        error: null,
      };
  }
}

type Ports = {
  current: () => boolean;
  choosePhoto: () => Promise<string | null>;
  updateName: (names: ProfileNames) => Promise<void>;
  updatePhoto: (photo: string) => Promise<void>;
  synchronize: () => Promise<void>;
};

export function profileNameError(names: ProfileNames): string | null {
  if (!names.firstName.trim()) return 'Enter your first name.';
  if (
    [names.firstName.trim(), names.lastName.trim()].filter(Boolean).join(' ')
      .length > 200
  )
    return 'Use a name of 200 characters or fewer.';
  return null;
}

/** Provider successes become the baseline immediately; API recovery never replays them. */
export function createProfileWorkflow(initial: ProfileNames, ports: Ports) {
  let baseline = { ...initial };
  let state: ProfileEditorState = {
    ...initial,
    photo: null,
    phase: 'ready',
    error: null,
  };
  let generation = 0;
  let disposed = false;
  let changedSinceSync = false;
  const listeners = new Set<() => void>();
  const current = (version: number) =>
    !disposed && version === generation && ports.current();
  const dispatch = (event: ProfileEvent) => {
    state = profileReducer(state, event);
    for (const listener of listeners) listener();
  };
  async function synchronize(version: number, providerError: string | null) {
    try {
      await ports.synchronize();
      if (current(version)) {
        changedSinceSync = false;
        dispatch({ type: 'synchronized', error: providerError });
      }
    } catch {
      if (current(version))
        dispatch({
          type: 'syncFailed',
          error: changedSinceSync
            ? 'Your profile changed, but Spendeazy could not refresh it. Retry synchronization.'
            : 'Spendeazy could not refresh your profile. Retry synchronization. Your edits are still here.',
        });
    }
  }
  return {
    activate() {
      if (!disposed) return;
      disposed = false;
      baseline = { ...initial };
      dispatch({ type: 'activated', names: initial });
    },
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    change(names: Partial<ProfileNames>) {
      if (
        !ports.current() ||
        disposed ||
        !['ready', 'saved'].includes(state.phase)
      )
        return;
      dispatch({ type: 'namesChanged', names });
    },
    async choosePhoto() {
      if (
        !ports.current() ||
        disposed ||
        !['ready', 'saved'].includes(state.phase)
      )
        return;
      const version = ++generation;
      dispatch({ type: 'photoChoiceStarted' });
      try {
        const photo = await ports.choosePhoto();
        if (current(version)) dispatch({ type: 'photoChoiceFinished', photo });
      } catch {
        if (current(version))
          dispatch({
            type: 'rejected',
            error:
              'Could not choose a photo. Check photo access and try again.',
          });
      }
    },
    async save() {
      if (
        !ports.current() ||
        disposed ||
        ['saving', 'choosing'].includes(state.phase)
      )
        return;
      const version = ++generation;
      if (state.phase === 'sync-needed') {
        dispatch({ type: 'saveStarted' });
        // Failed provider edits remain in state and are offered after synchronization.
        const unfinished =
          state.photo !== null ||
          state.firstName.trim() !== baseline.firstName ||
          state.lastName.trim() !== baseline.lastName;
        await synchronize(
          version,
          unfinished
            ? 'Some edits still need saving. Retry Save profile.'
            : null,
        );
        return;
      }
      const validation = profileNameError(state);
      if (validation) {
        dispatch({ type: 'rejected', error: validation });
        return;
      }
      const names = {
        firstName: state.firstName.trim(),
        lastName: state.lastName.trim(),
      };
      const photo = state.photo;
      dispatch({ type: 'saveStarted' });
      const failures: string[] = [];
      if (
        names.firstName !== baseline.firstName ||
        names.lastName !== baseline.lastName
      ) {
        try {
          await ports.updateName(names);
          if (!current(version)) return;
          baseline = names;
          changedSinceSync = true;
          dispatch({ type: 'namesSaved', names });
        } catch {
          if (!current(version)) return;
          failures.push('Your name could not be saved.');
        }
      }
      if (photo) {
        if (!current(version)) return;
        try {
          await ports.updatePhoto(photo);
          if (!current(version)) return;
          changedSinceSync = true;
          dispatch({ type: 'photoSaved' });
        } catch {
          if (!current(version)) return;
          failures.push('Your photo could not be saved.');
        }
      }
      if (current(version))
        await synchronize(
          version,
          failures.length
            ? `${failures.join(' ')} Your edits are still here. Retry Save profile.`
            : null,
        );
    },
    dispose() {
      disposed = true;
      generation++;
      state = profileReducer(state, { type: 'disposed' });
    },
  };
}
