import { useState, type ReactNode } from 'react';
import { KeyRound, Link, TriangleAlert } from 'lucide-react-native';
import { Text, View } from 'react-native';

import type { InvitationInbox } from '@/api/invitations-api-client';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { DesignSurface } from '@/components/design-surface';
import { SpaceStatus } from '@/components/space-status';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import type { useSharing } from './use-sharing';
import { SharedSpaceCard } from './shared-space-card';
import { useAppTheme } from '@/navigation/app-theme';

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
  const { palette, fonts } = useAppTheme();
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
    <Screen title="Sharing" onBack={onBack} backDisabled={disabled} refreshing={state.loading} onRefresh={() => void controller.load()} headerAccessory={<SpaceStatus />}>
      <StackGap>
        {active?.kind === 'shared' ? <SharedSpaceCard space={active} /> : null}
        {hasActiveSharedSpace ? (
          <SupportingText>You already belong to an active Shared Space. Leave it before joining another.</SupportingText>
        ) : null}

        <SharingSection title="Invite Code">
          {outgoing?.status === 'pending' ? (
            <StackGap>
              <View style={{ padding: 16, borderRadius: 16, backgroundColor: palette.editorField, borderWidth: 1, borderColor: palette.fieldBorder, gap: 10 }}>
                <KeyRound accessible={false} size={20} color={palette.brandPrimary} />
                <Text selectable accessibilityLabel={`Invite Code: ${outgoing.code}`} style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 23, letterSpacing: 1 }}>{outgoing.code}</Text>
              </View>
              <SupportingText>{`Expires ${formatDate(outgoing.expiresAt)}`}</SupportingText>
              <PrimaryButton label="Copy Invite Code" busy={state.busy === 'copy'} onPress={() => void controller.copyCode()} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                <CompactAction variant="quiet" label="Rotate" disabled={disabled} onPress={() => setConfirmation('rotate')} />
                <CompactAction variant="quiet" label="Revoke" disabled={disabled} onPress={() => setConfirmation('revoke')} />
              </View>
            </StackGap>
          ) : (
            <PrimaryButton label="Create code" busy={state.busy === 'create'} disabled={hasActiveSharedSpace} onPress={() => void controller.create()} />
          )}
        </SharingSection>

        <SharingSection title="Join a Shared Space">
          <StackGap>
            <TextField
              label="Invite Code"
              value={code}
              onChangeText={(value) => onCodeChange(value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              variant="underlined"
              icon={<Link size={20} color={palette.textSecondary} />}
            />
            <PrimaryButton label="Preview" busy={state.busy === 'claim'} disabled={hasActiveSharedSpace || code.trim().length === 0} onPress={() => void controller.claim(code)} />
          </StackGap>
        </SharingSection>

        {inbox?.incoming.length ? (
          <StackGap>
            <SupportingText>Invitations</SupportingText>
            {inbox.incoming.map((invitation) => (
              <SharingSection key={invitation.id} title={`Invitation from ${invitation.senderName}`}>
                <SupportingText>{`Expires ${formatDate(invitation.expiresAt)}`}</SupportingText>
                <SupportingText>Joining gives both members equal edit access. Your Personal Space remains private.</SupportingText>
                <PrimaryButton label="Join" busy={state.busy === 'accept'} disabled={hasActiveSharedSpace} onPress={() => void controller.accept(invitation.id)} />
                <SecondaryButton label="Decline" disabled={disabled} onPress={() => void controller.decline(invitation.id)} />
              </SharingSection>
            ))}
          </StackGap>
        ) : null}

        {active?.id ? (
          <SecondaryButton label="Import history" disabled={disabled} onPress={onOpenImportHistory} />
        ) : null}
        {activeSharedSpace ? (
          <SharingSection title="Archive Shared Space">
            <TriangleAlert accessible={false} size={24} color={palette.stateWarning} />
            <SecondaryButton label="Leave Space" disabled={disabled} onPress={() => setConfirmation('leave')} />
          </SharingSection>
        ) : null}

        {state.error ? <Text selectable accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: 16 }}>{state.error}</Text> : null}
        {state.notice ? <SupportingText>{state.notice}</SupportingText> : null}
      </StackGap>

      <CenteredDialog
        title={confirmation ? confirmationCopy[confirmation].title : ''}
        visible={confirmation !== null}
        onDismiss={() => setConfirmation(null)}>
        {confirmation ? <BodyText>{confirmationCopy[confirmation].message}</BodyText> : null}
        <PrimaryButton label={confirmation ? confirmationCopy[confirmation].confirmLabel : 'Confirm'} tone={confirmation === 'leave' || confirmation === 'revoke' ? 'destructive' : 'brand'} busy={disabled} onPress={() => void confirmAction()} />
        <SecondaryButton label="Cancel" disabled={disabled} onPress={() => setConfirmation(null)} />
      </CenteredDialog>
    </Screen>
  );
}

function SharingSection({ title, children }: { title: string; children: ReactNode }) {
  const { palette, fonts } = useAppTheme();
  return <DesignSurface style={{ padding: 20, gap: 14 }}>
    <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 15 }}>{title}</Text>
    {children}
  </DesignSurface>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}
