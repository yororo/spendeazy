import { useState } from 'react';

import type { InvitationInbox } from '@/api/invitations-api-client';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { SpaceStatus } from '@/components/space-status';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import type { useSharing } from './use-sharing';

const confirmationCopy = {
  rotate: {
    title: 'Rotate Invite Code?',
    message: 'The old code stops working immediately, and invitation previews saved with it are removed.',
    confirmLabel: 'Rotate code',
  },
  revoke: {
    title: 'Revoke Invite Code?',
    message: 'The code stops working immediately, and invitation previews saved with it are removed.',
    confirmLabel: 'Revoke code',
  },
  leave: {
    title: 'Archive Shared Space?',
    message: 'Both members will lose edit access. Expenses, Activity, and Statement Import history will remain available to both as read-only history. This cannot be undone.',
    confirmLabel: 'Archive for both members',
  },
} as const;

export function SharingView({
  controller,
  code,
  onCodeChange,
  onBack,
  onOpenImportHistory,
}: {
  controller: ReturnType<typeof useSharing>;
  code: string;
  onCodeChange: (value: string) => void;
  onBack: () => void;
  onOpenImportHistory: () => void;
}) {
  const { state, active, hasActiveSharedSpace, activeSharedSpace } = controller;
  const [confirmation, setConfirmation] = useState<'rotate' | 'revoke' | 'leave' | null>(null);
  const inbox: InvitationInbox | null = state.inbox;
  const outgoing = inbox?.outgoing ?? null;
  const disabled = state.busy !== null;
  const actions = {
    rotate: controller.rotate,
    revoke: controller.revoke,
    leave: controller.leave,
  };

  async function confirmAction() {
    const action = confirmation;
    if (!action) return;
    setConfirmation(null);
    await actions[action]();
  }

  return (
    <Screen title="Sharing" refreshing={state.loading} onRefresh={() => void controller.load()} headerAccessory={<SpaceStatus />}>
      <StackGap>
        <SupportingText>Invite someone with a code you share directly. Codes last seven days. Spendeazy does not email invitations or send notifications.</SupportingText>

        {hasActiveSharedSpace ? (
          <SupportingText>You already belong to an active Shared Space. Leave it before joining another.</SupportingText>
        ) : null}

        <SupportingText>Invite Code</SupportingText>
        {outgoing?.status === 'pending' ? (
          <StackGap>
            <BodyText>{outgoing.code}</BodyText>
            <SupportingText>{`Expires ${formatDate(outgoing.expiresAt)}`}</SupportingText>
            <PrimaryButton label="Copy Invite Code" busy={state.busy === 'copy'} onPress={() => void controller.copyCode()} />
            <SecondaryButton label="Rotate Invite Code" disabled={disabled} onPress={() => setConfirmation('rotate')} />
            <SecondaryButton label="Revoke Invite Code" disabled={disabled} onPress={() => setConfirmation('revoke')} />
          </StackGap>
        ) : (
          <StackGap>
            <SupportingText>Create a code for another person to enter on their device.</SupportingText>
            <PrimaryButton label="Create Invite Code" busy={state.busy === 'create'} disabled={hasActiveSharedSpace} onPress={() => void controller.create()} />
          </StackGap>
        )}

        <SupportingText>Join a Shared Space</SupportingText>
        <StackGap>
          <TextField
            label="Invite Code"
            value={code}
            onChangeText={(value) => onCodeChange(value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
          />
          <PrimaryButton label="Save code and preview" busy={state.busy === 'claim'} disabled={hasActiveSharedSpace || code.trim().length === 0} onPress={() => void controller.claim(code)} />
        </StackGap>

        {inbox?.incoming.length ? (
          <StackGap>
            <SupportingText>Invitations</SupportingText>
            {inbox.incoming.map((invitation) => (
              <StackGap key={invitation.id}>
                <BodyText>{`Invitation from ${invitation.senderName}`}</BodyText>
                <SupportingText>{`Expires ${formatDate(invitation.expiresAt)}`}</SupportingText>
                <SupportingText>Joining gives both members equal edit access. Your Personal Space remains private.</SupportingText>
                <PrimaryButton label={`Join ${invitation.senderName}'s Shared Space`} busy={state.busy === 'accept'} disabled={hasActiveSharedSpace} onPress={() => void controller.accept(invitation.id)} />
                <SecondaryButton label="Decline invitation" disabled={disabled} onPress={() => void controller.decline(invitation.id)} />
              </StackGap>
            ))}
          </StackGap>
        ) : null}

        {active?.id ? (
          <SecondaryButton label="Statement Import history" disabled={disabled} onPress={onOpenImportHistory} />
        ) : null}
        {activeSharedSpace ? (
          <StackGap>
            <SupportingText>Leaving ends sharing for both members. The Shared Space and its Expenses, Activity, and Statement Import history remain permanently as read-only history.</SupportingText>
            <SecondaryButton label="Leave and archive Shared Space" disabled={disabled} onPress={() => setConfirmation('leave')} />
          </StackGap>
        ) : null}

        {state.error ? <BodyText>{state.error}</BodyText> : null}
        {state.notice ? <SupportingText>{state.notice}</SupportingText> : null}
        <SecondaryButton label="Back" disabled={disabled} onPress={onBack} />
      </StackGap>

      <ChoiceSheet
        title={confirmation ? confirmationCopy[confirmation].title : ''}
        visible={confirmation !== null}
        onDismiss={() => setConfirmation(null)}>
        {confirmation ? <BodyText>{confirmationCopy[confirmation].message}</BodyText> : null}
        <PrimaryButton label={confirmation ? confirmationCopy[confirmation].confirmLabel : 'Confirm'} busy={disabled} onPress={() => void confirmAction()} />
        <SecondaryButton label="Cancel" disabled={disabled} onPress={() => setConfirmation(null)} />
      </ChoiceSheet>
    </Screen>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}
