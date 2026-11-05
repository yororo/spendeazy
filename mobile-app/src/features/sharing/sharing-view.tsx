import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ellipsis, Info, KeyRound, Link, LogIn, TriangleAlert, X } from 'lucide-react-native';
import { Keyboard, Pressable, type ScrollView, Text, View } from 'react-native';

import type { InvitationInbox } from '@/api/invitations-api-client';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { DesignSurface } from '@/components/design-surface';
import { Popover } from '@/components/popover';
import { SpaceStatus } from '@/components/space-status';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import type { useSharing } from './use-sharing';
import { SharedSpaceCard } from './shared-space-card';
import { controlSize, radius } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

const confirmationCopy = {
  rotate: {
    title: 'Replace Invite Code?',
    message: 'The old code stops working immediately, and invitation previews saved with it are removed.',
    confirmLabel: 'Replace code',
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
  const manageAnchor = useRef<React.ComponentRef<typeof View>>(null);
  const [toast, setToast] = useState<string | null>(state.notice);
  const [seenNotice, setSeenNotice] = useState<string | null>(state.notice);
  if (seenNotice !== state.notice) {
    setSeenNotice(state.notice);
    setToast(state.notice);
  }
  useEffect(() => {
    if (!state.notice) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [state.notice]);
  const [manageCode, setManageCode] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const CodeButton = inbox?.incoming.length ? SecondaryButton : PrimaryButton;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
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
    <View style={{ flex: 1 }}>
    <Screen scrollRef={scrollRef} title="Sharing" onBack={onBack} backDisabled={disabled} refreshing={state.loading} onRefresh={disabled ? undefined : () => { setPreviewFailed(false); void controller.load(); }} headerAccessory={<SpaceStatus />}>
      <StackGap>
        {active?.kind === 'shared' ? <SharedSpaceCard space={active} /> : null}
        {hasActiveSharedSpace && !inbox?.incoming.length ? (
          <SupportingText>{activeSharedSpace ? 'You already belong to an active Shared Space. Archive it before joining another.' : 'You already belong to an active Shared Space. Switch to it to manage your membership.'}</SupportingText>
        ) : null}

        {inbox?.incoming.length ? (
          <StackGap>
            <SupportingText>Invitations</SupportingText>
            {inbox.incoming.map((invitation) => (
              <SharingSection key={invitation.id} title={invitation.senderName} headerAccessory={hasActiveSharedSpace ? undefined : <InvitationInfo />}>
                <SupportingText>{`Expires ${formatDate(invitation.expiresAt)}`}</SupportingText>
                {hasActiveSharedSpace ? (
                  <SupportingText>{activeSharedSpace
                    ? 'Archive your active Shared Space before joining another.'
                    : 'Archive your active Shared Space before joining another. Switch to it to manage membership.'}</SupportingText>
                ) : null}
                <PrimaryButton label="Join" icon={LogIn} busy={state.busy === 'accept' && joiningId === invitation.id} disabled={disabled || hasActiveSharedSpace} onPress={() => { setPreviewFailed(false); setJoiningId(invitation.id); void controller.accept(invitation.id); }} />
                <SecondaryButton label="Decline" icon={X} disabled={disabled} onPress={() => { setPreviewFailed(false); void controller.decline(invitation.id); }} />
              </SharingSection>
            ))}
          </StackGap>
        ) : null}

        {!hasActiveSharedSpace ? <>
          <SharingSection title="Invite someone">
            {outgoing?.status === 'pending' ? (
              <StackGap>
                <View style={{ padding: 16, borderRadius: 16, backgroundColor: palette.editorField, borderWidth: 1, borderColor: palette.fieldBorder, gap: 10 }}>
                  <KeyRound accessible={false} size={20} color={palette.brandPrimary} />
                  <Text selectable accessibilityLabel={`Invite Code: ${outgoing.code}`} style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 23, letterSpacing: 1 }}>{outgoing.code}</Text>
                </View>
                <SupportingText>{`Expires ${formatDate(outgoing.expiresAt)}`}</SupportingText>
                <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <CodeButton label="Copy code" disabled={disabled} busy={state.busy === 'copy'} onPress={() => { setPreviewFailed(false); void controller.copyCode(); }} />
                  </View>
                  <View ref={manageAnchor} collapsable={false} style={{ width: controlSize.minimumTarget }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Manage code" accessibilityState={{ disabled, expanded: manageCode }} disabled={disabled} onPress={() => setManageCode(true)} style={{ flex: 1, minHeight: controlSize.primaryAction, borderRadius: radius.control, borderWidth: 1, borderColor: palette.fieldBorder, backgroundColor: palette.editorField, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
                      <Ellipsis accessible={false} color={palette.textPrimary} />
                    </Pressable>
                  </View>
                </View>
                <Popover title="Manage code" visible={manageCode} anchorRef={manageAnchor} showHeader={false} onDismiss={() => setManageCode(false)}>
                  <CompactAction variant="quiet" label="Replace code" onPress={() => { setManageCode(false); setConfirmation('rotate'); }} />
                  <CompactAction variant="quiet" label="Revoke code" onPress={() => { setManageCode(false); setConfirmation('revoke'); }} />
                </Popover>
              </StackGap>
            ) : (
              <CodeButton label="Create code" busy={state.busy === 'create'} disabled={disabled} onPress={() => { setPreviewFailed(false); void controller.create(); }} />
            )}
          </SharingSection>

          <SharingSection title="Join space">
            <StackGap>
              <TextField
                label="Invite Code"
                value={code}
                error={previewFailed ? state.error : null}
                onChangeText={(value) => onCodeChange(value.toUpperCase())}
                placeholder="Paste code"
                autoCapitalize="characters"
                variant="underlined"
                icon={<Link size={20} color={palette.textSecondary} />}
              />
              <CodeButton label="Preview invite" busy={state.busy === 'claim'} disabled={disabled || code.trim().length === 0} onPress={async () => {
                const success = await controller.claim(code);
                setPreviewFailed(!success);
                if (success) {
                onCodeChange('');
                Keyboard.dismiss();
                requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0 }));
              }
              }} />
            </StackGap>
          </SharingSection>

        </> : null}

        {active?.id ? (
          <SecondaryButton label="Import history" disabled={disabled} onPress={onOpenImportHistory} />
        ) : null}
        {activeSharedSpace ? (
          <SharingSection title="Archive Shared Space">
            <TriangleAlert accessible={false} size={24} color={palette.stateWarning} />
            <SecondaryButton label="Archive" disabled={disabled} onPress={() => setConfirmation('leave')} />
          </SharingSection>
        ) : null}

        {state.error && !previewFailed ? <Text selectable accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: 16 }}>{state.error}</Text> : null}
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
    {toast ? (
      <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 48, alignItems: 'center' }}>
        <Text accessibilityLiveRegion="polite" style={{ backgroundColor: palette.textPrimary, color: palette.surfaceModal, borderRadius: radius.control, padding: 12, overflow: 'hidden', fontFamily: fonts.medium }}>
          {toast}
        </Text>
      </View>
    ) : null}
    </View>
  );
}

function InvitationInfo() {
  const { palette } = useAppTheme();
  const anchor = useRef<React.ComponentRef<typeof View>>(null);
  const [visible, setVisible] = useState(false);
  return (
    <View ref={anchor} collapsable={false}>
      <CompactAction label="About joining" variant="icon" icon={<Info size={18} color={palette.textSecondary} />} onPress={() => setVisible(true)} />
      <Popover title="About joining" visible={visible} anchorRef={anchor} onDismiss={() => setVisible(false)}>
        <BodyText>Both members can edit the Shared Space. Your Personal Space stays private.</BodyText>
      </Popover>
    </View>
  );
}

function SharingSection({ title, children, headerAccessory }: { title: string; children: ReactNode; headerAccessory?: ReactNode }) {
  const { palette, fonts } = useAppTheme();
  return <DesignSurface style={{ padding: 20, gap: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text accessibilityRole="header" style={{ flex: 1, color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 15 }}>{title}</Text>
      {headerAccessory}
    </View>
    {children}
  </DesignSurface>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
