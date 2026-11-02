import { useEffect, useRef, useState, type ElementRef } from 'react';
import { CircleCheck, CircleHelp, CircleX, LoaderCircle, X } from 'lucide-react-native';
import { AccessibilityInfo, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { DesignSurface } from '@/components/design-surface';
import { Screen, SupportingText } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { controlSize, space } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { displayMoneyAmount } from '@/navigation/money-amount';
import { ProviderIdentity } from './provider-identity';
import type { useImportConfirmation } from './use-import-confirmation';

/** Recovery has no dependency on a living PDF/review. */
export function ImportRecoveryView({ controller: c, destination, writable, historyAvailable, onClose, onHistory, onAcknowledged }: {
  controller: ReturnType<typeof useImportConfirmation>; destination: string; writable: boolean; historyAvailable: boolean;
  onClose(): void; onHistory(): void; onAcknowledged(): void;
}) {
  const { palette, fonts } = useAppTheme();
  const [closing, setClosing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const closeRef = useRef<ElementRef<typeof View>>(null);
  const terminal = c.phase === 'committed' || c.phase === 'not_committed';
  const busy = c.phase === 'saving' || c.phase === 'checking';
  const title = busy ? 'Checking' : c.phase === 'committed' ? 'Imported' : c.phase === 'not_committed' ? 'Not imported' : 'Unconfirmed';
  const StatusIcon = busy ? LoaderCircle : c.phase === 'committed' ? CircleCheck : c.phase === 'not_committed' ? CircleX : CircleHelp;
  const statusColor = c.phase === 'committed' ? palette.statePositive : c.phase === 'not_committed' ? palette.stateNegative : palette.textSecondary;
  const account = c.receipt?.account;
  useEffect(() => { if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(title); }, [title]);
  const close = () => { if (!terminal) setClosing(true); else onClose(); };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  });
  async function acknowledge(history: boolean) {
    if (clearing) return;
    setClearing(true);
    try { if (await c.acknowledge()) { if (history) onHistory(); else onAcknowledged(); } }
    finally { setClearing(false); }
  }
  return <Screen title="Import statement" headerAccessory={
    <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel="Close import" onPress={close}
      style={({ pressed }) => ({ minWidth: controlSize.minimumTarget, minHeight: controlSize.minimumTarget, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
      <X size={22} color={palette.textPrimary} accessible={false} />
    </Pressable>
  }>
    <DesignSurface style={{ padding: space.sheetGap, gap: space.sheetGap }}>
      <View accessibilityLiveRegion="polite" style={{ gap: space.sheetGap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <StatusIcon size={27} color={statusColor} accessible={false} />
          <Text accessibilityRole="header" style={{ flexShrink: 1, textAlign: 'center', color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 27 }}>{title}</Text>
        </View>
        {account ? <View accessible accessibilityLabel={`${account.provider === 'bdo' ? 'BDO' : account.provider === 'eastwest' ? 'EastWest' : 'GCash'}, ${account.format === 'e-wallet' ? 'E-wallet' : account.format.toUpperCase()}`} style={{ alignItems: 'center' }}>
          <ProviderIdentity account={account} showName={false} logoHeight={28} />
        </View> : null}
        {c.message ? <SupportingText>{c.message}</SupportingText> : null}
        {c.result ? <View style={{ alignItems: 'center', gap: 4 }}>
          <Text selectable accessibilityLabel={`Imported total, ${c.result.originalExpenseTotal} Philippine pesos`} style={{ alignSelf: 'stretch', textAlign: 'center', color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 42, letterSpacing: -2, fontVariant: ['tabular-nums'] }}>{`PHP ${displayMoneyAmount(c.result.originalExpenseTotal)}`}</Text>
          <Text style={{ textAlign: 'center', color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 15 }}>{`${displayMoneyAmount(c.result.originalExpenseCount)} ${c.result.originalExpenseCount === '1' ? 'Expense' : 'Expenses'}`}</Text>
        </View> : null}
        <View style={{ alignSelf: 'center' }}><SpaceStatus readOnly spaceId={c.receipt?.spaceId} /></View>
        {c.phase === 'not_committed' ? <SupportingText>{c.handoff ? 'Your review and staged Rules are ready to continue.' : 'Review data is unavailable after restart. Select the statement to start a new review.'}</SupportingText> : null}
      </View>
      {!terminal ? <PrimaryButton label="Check status" busy={busy} onPress={c.checkStatus} /> : null}
      {!terminal && c.canRetry && writable ? <SecondaryButton label="Retry" disabled={busy} onPress={() => c.submit()} /> : null}
      {!terminal ? <SupportingText>Saving may still complete. Keep checking this operation before starting another import.</SupportingText> : null}
      {!terminal && historyAvailable ? <CompactAction variant="quiet" label="History" onPress={onHistory} /> : null}
      {terminal ? <PrimaryButton busy={clearing} label={c.phase === 'committed' ? 'Done' : c.handoff ? 'Review' : 'New review'} onPress={() => { void acknowledge(false); }} /> : null}
      {c.phase === 'committed' && historyAvailable ? <CompactAction variant="quiet" label="History" disabled={clearing} onPress={() => { void acknowledge(true); }} /> : null}
    </DesignSurface>
    <CenteredDialog visible={closing} title="Saving may still complete" restoreFocusRef={closeRef} onDismiss={() => setClosing(false)}>
      <SupportingText>{`Check import history in ${destination}. Use the retry button in the bottom navigation to return to this import.`}</SupportingText>
      <SecondaryButton label="Keep checking" onPress={() => setClosing(false)} />
      <PrimaryButton label="Close message" onPress={() => { setClosing(false); onClose(); }} />
    </CenteredDialog>
  </Screen>;
}
