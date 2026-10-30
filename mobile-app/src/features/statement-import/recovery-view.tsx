import { useEffect, useRef, useState, type ElementRef } from 'react';
import { AccessibilityInfo, BackHandler, Platform, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { DesignSurface } from '@/components/design-surface';
import { BodyText, Screen, SupportingText } from '@/components/screen';
import type { useImportConfirmation } from './use-import-confirmation';

/** Recovery has no dependency on a living PDF/review. */
export function ImportRecoveryView({ controller: c, destination, writable, historyAvailable, onClose, onHistory, onAcknowledged }: {
  controller: ReturnType<typeof useImportConfirmation>; destination: string; writable: boolean; historyAvailable: boolean;
  onClose(): void; onHistory(): void; onAcknowledged(): void;
}) {
  const [closing, setClosing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const closeRef = useRef<ElementRef<typeof View>>(null);
  const terminal = c.phase === 'committed' || c.phase === 'not_committed';
  const busy = c.phase === 'saving' || c.phase === 'checking';
  const title = busy ? 'Checking the original import…' : c.phase === 'committed' ? 'Statement imported' : c.phase === 'not_committed' ? 'The statement was not imported' : 'Saving hasn’t been confirmed';
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
  return <Screen title="Import statement">
    <SecondaryButton ref={closeRef} label="Close" onPress={close} />
    <SupportingText>{`Destination: ${destination} · Space ${c.receipt?.spaceId}`}</SupportingText>
    <DesignSurface style={{ padding: 20, gap: 16 }}>
      <View accessibilityLiveRegion="polite" style={{ gap: 16 }}>
        <BodyText>{title}</BodyText>
        {c.message ? <SupportingText>{c.message}</SupportingText> : null}
        {c.result ? <BodyText>{`${c.result.originalExpenseCount} Expenses · PHP ${c.result.originalExpenseTotal}`}</BodyText> : null}
        {c.phase === 'not_committed' ? <SupportingText>{c.handoff ? 'Your living review and staged Rules are available after acknowledgment.' : 'Review data is unavailable after restart. Acknowledge this result, then select the statement for a new review.'}</SupportingText> : null}
      </View>
      {!terminal ? <PrimaryButton label="Check status" busy={busy} onPress={c.checkStatus} /> : null}
      {!terminal && c.canRetry && writable ? <SecondaryButton label="Retry same import" disabled={busy} onPress={() => c.submit()} /> : null}
      {!terminal ? <SupportingText>Saving may still complete. Keep checking this operation before starting another import.</SupportingText> : null}
      {!terminal && historyAvailable ? <SecondaryButton label="Open original Space history" onPress={onHistory} /> : null}
      {terminal ? <PrimaryButton busy={clearing} label={c.phase === 'committed' ? 'Acknowledge import' : c.handoff ? 'Return to review' : 'Start a new review'} onPress={() => { void acknowledge(false); }} /> : null}
      {c.phase === 'committed' && historyAvailable ? <SecondaryButton label="Acknowledge and open original Space history" disabled={clearing} onPress={() => { void acknowledge(true); }} /> : null}
    </DesignSurface>
    <CenteredDialog visible={closing} title="Saving may still complete" restoreFocusRef={closeRef} onDismiss={() => setClosing(false)}>
      <SupportingText>{`Check import history in ${destination} (Space ${c.receipt?.spaceId}). Closing this message keeps the operation available through Check import status.`}</SupportingText>
      <SecondaryButton label="Keep checking" onPress={() => setClosing(false)} />
      <PrimaryButton label="Close message" onPress={() => { setClosing(false); onClose(); }} />
    </CenteredDialog>
  </Screen>;
}
