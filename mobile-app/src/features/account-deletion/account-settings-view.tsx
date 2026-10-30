import { useRef, useState, type ElementRef } from 'react';
import { View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { BodyText, Screen, StackGap } from '@/components/screen';

export function AccountSettingsView({ onBack, onRequest, error }: { onBack(): void; onRequest(): void; error: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<ElementRef<typeof View>>(null);
  const trigger = useRef<ElementRef<typeof View>>(null);
  return <Screen title="Account settings">
    <StackGap>
      <SecondaryButton label="Back to Profile" onPress={onBack} />
      <BodyText>Account deletion is permanent. Review what happens before requesting it.</BodyText>
      <SecondaryButton ref={trigger} label="Delete account" onPress={() => setConfirming(true)} />
      {error ? <View accessibilityLiveRegion="polite"><BodyText>{error}</BodyText></View> : null}
    </StackGap>
    <CenteredDialog title="Delete your account?" visible={confirming} initialFocusRef={cancel} restoreFocusRef={trigger} onDismiss={() => setConfirming(false)}>
      <BodyText>Your Personal Space and all its financial data will be permanently removed. Your sign-in identity and all its sessions will be removed.</BodyText>
      <BodyText>Your active Shared Space will be archived. The other member keeps access to its history, with your contributions labeled Deleted user. Existing Shared archives remain available to their other members.</BodyText>
      <BodyText>Once sent, closing the app or signing out cannot cancel this request. Private data on offline devices clears when those devices reconnect and confirm access ended.</BodyText>
      <SecondaryButton ref={cancel} label="Cancel" onPress={() => setConfirming(false)} />
      <PrimaryButton tone="destructive" label="Request account deletion" onPress={() => { setConfirming(false); onRequest(); }} />
    </CenteredDialog>
  </Screen>;
}
