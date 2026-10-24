import { useState } from 'react';

import { SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { spaceIdentityLabel } from '@/application/spaces/active-space';
import { useSpaces } from '@/application/spaces/provider';

export function SpaceStatus() {
  const { spaces, active, loading, error, memoryError, refresh, selectSpace } = useSpaces();
  const [open, setOpen] = useState(false);

  if (loading && !active) return <BodyText>Loading Spaces.</BodyText>;
  if (error) {
    return (
      <StackGap>
        <BodyText>{error}</BodyText>
        <SecondaryButton label="Retry" onPress={refresh} />
      </StackGap>
    );
  }
  if (!active) {
    return (
      <StackGap>
        <BodyText>Personal Space is unavailable.</BodyText>
        <SecondaryButton label="Retry" onPress={refresh} />
      </StackGap>
    );
  }

  return (
    <StackGap>
      <SupportingText>Active Space</SupportingText>
      <BodyText>{spaceIdentityLabel(active)}</BodyText>
      {memoryError ? <SupportingText>{memoryError}</SupportingText> : null}
      {spaces.length > 1 ? (
        <SecondaryButton label="Switch Space" onPress={() => setOpen(true)} />
      ) : null}
      <ChoiceSheet title="Spaces" visible={open} onDismiss={() => setOpen(false)}>
        {spaces.map((space) => (
          <SecondaryButton
            key={space.id}
            label={spaceIdentityLabel(space)}
            selected={space.id === active.id}
            onPress={() => {
              void selectSpace(space);
              setOpen(false);
            }}
          />
        ))}
      </ChoiceSheet>
    </StackGap>
  );
}
