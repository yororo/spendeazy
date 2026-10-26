import { useState } from 'react';

import { SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { spaceIdentityLabel } from '@/application/spaces/active-space';
import { useSpaces } from '@/application/spaces/provider';

export function SpaceStatus() {
  const { spaces, active, loading, error, memoryError, refresh, selectSpace, hasUnsavedWork, discardUnsavedExpense } = useSpaces();
  const [open, setOpen] = useState(false);
  const [pendingSpaceId, setPendingSpaceId] = useState<string | null>(null);

  if (loading && !active) return <BodyText>Loading Spaces.</BodyText>;
  if (error) {
    return (
      <StackGap>
        <BodyText>{error}</BodyText>
        <SecondaryButton label="Retry" onPress={() => void refresh()} />
      </StackGap>
    );
  }
  if (!active) {
    return (
      <StackGap>
        <BodyText>Personal Space is unavailable.</BodyText>
        <SecondaryButton label="Retry" onPress={() => void refresh()} />
      </StackGap>
    );
  }

  return (
    <StackGap>
      <SupportingText>Active Space</SupportingText>
      <BodyText>{spaceIdentityLabel(active)}</BodyText>
      {active.status === 'archived' ? (
        <SupportingText>This Shared Space is archived. Expenses, Activity, and import history are read-only.</SupportingText>
      ) : null}
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
              if (space.id === active.id) {
                setOpen(false);
              } else if (hasUnsavedWork) {
                setPendingSpaceId(space.id);
              } else {
                void selectSpace(space);
                setOpen(false);
              }
            }}
          />
        ))}
      </ChoiceSheet>
      <ChoiceSheet
        title="Unsaved Expense"
        visible={pendingSpaceId !== null}
        onDismiss={() => setPendingSpaceId(null)}>
        <BodyText>Save this Expense first, or discard it before switching Spaces. Its Category selection clears when you switch.</BodyText>
        <SecondaryButton label="Keep working on Expense" onPress={() => setPendingSpaceId(null)} />
        <SecondaryButton label="Discard Expense and switch" onPress={() => {
          const nextSpaceId = pendingSpaceId;
          setPendingSpaceId(null);
          setOpen(false);
          discardUnsavedExpense();
          if (nextSpaceId) {
            const nextSpace = spaces.find((space) => space.id === nextSpaceId);
            if (nextSpace) void selectSpace(nextSpace);
          }
        }} />
      </ChoiceSheet>
    </StackGap>
  );
}
