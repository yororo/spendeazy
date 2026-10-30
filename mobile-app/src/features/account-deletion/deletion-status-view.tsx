import { View } from 'react-native';
import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap } from '@/components/screen';
import type { createDeletionWorkflow } from './deletion-workflow';

type State = ReturnType<ReturnType<typeof createDeletionWorkflow>['snapshot']>;
export function DeletionStatusView({ state, onCheck, onRetry, onSignOut, onStorageRetry }: {
  state: State; onCheck(): void; onRetry(): void; onSignOut(): void; onStorageRetry(): void;
}) {
  const copy = state.phase === 'submitting' ? 'Sending your deletion request. Closing this screen cannot undo a request already sent.'
    : state.phase === 'pending' ? 'Your deletion request was accepted. Cleanup continues even if you close the app or sign out.'
    : state.phase === 'completed' ? 'Account deletion completed.'
    : state.phase === 'ended' ? state.accepted
      ? 'Access ended before completion could be checked. Your deletion request was accepted and cleanup continues.'
      : 'Access ended. We could not confirm whether your deletion request was accepted or completed.'
    : state.phase === 'storage-error' ? 'Deletion recovery could not be read. Retry before continuing.'
    : 'We could not confirm whether your deletion request was accepted.';
  return <Screen title="Account deletion"><StackGap>
    <View accessibilityLiveRegion="polite"><BodyText>{copy}</BodyText></View>
    {state.error ? <View accessibilityLiveRegion="polite"><BodyText>{state.error}</BodyText></View> : null}
    {state.phase === 'storage-error' ? <SecondaryButton label="Retry deletion recovery" onPress={onStorageRetry} /> : null}
    {state.phase === 'pending' || state.phase === 'uncertain' ? <>
      <SecondaryButton label="Check status" busy={state.busy} onPress={onCheck} />
      <SecondaryButton label="Retry deletion request" disabled={state.busy} onPress={onRetry} />
    </> : null}
    {state.phase !== 'storage-error' ? <SecondaryButton label={state.phase === 'completed' ? 'Continue to sign in' : 'Sign out'} disabled={state.busy} onPress={onSignOut} /> : null}
  </StackGap></Screen>;
}
