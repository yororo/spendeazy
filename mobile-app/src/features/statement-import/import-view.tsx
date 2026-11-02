import { Image } from 'expo-image';
import { FileUp, History } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { DesignSurface } from '@/components/design-surface';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { useAppTheme } from '@/navigation/app-theme';
import type { ImportWarning } from './import-model';
import type { useStatementImport } from './use-statement-import';

const warningText: Record<ImportWarning['code'], string> = {
  'partial-extraction': 'Some pages or activity could not be read. Extracted Transactions may be incomplete.',
  'unresolved-classification': 'Some Transactions have an uncertain direction or date and cannot become Expenses.',
  'reconciliation-mismatch': 'Extracted activity does not match the statement controls.',
  'missing-control': 'Some statement controls are missing or unreadable. Reconciliation is limited.',
};
const failureText = {
  'picker-failed': 'The file picker could not open this PDF. Try selecting again.',
  'prepare-failed': 'This file could not be prepared. Select a readable PDF. A development safety guard may also have stopped processing.',
  unreadable: 'This PDF could not be read, or processing reached a development safety guard. Select another PDF or retry.',
  unsupported: 'The provider or account format could not be identified unambiguously. Select a BDO Amex, EastWest Visa or GCash E-Wallet PDF.',
  'no-usable-rows': 'No usable Transactions were found. Image-only statements and unsupported layouts cannot be interpreted.',
  'cleanup-failed': 'Temporary-file cleanup needs to be retried before another selection.',
};

export function StatementImportView({ controller: c, recentHistory, onHistory, onBack }: {
  controller: ReturnType<typeof useStatementImport>; recentHistory: ReactNode; onHistory(): void; onBack(): void;
}) {
  const { palette, fonts } = useAppTheme();
  const { state } = c;
  const running = 'operation' in state;
  const result = 'result' in state ? state.result : null;
  const discard = () => Alert.alert('Discard Statement Import?', 'This clears the living import work. You can then select again or switch Spaces.', [
    { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: c.discard },
  ]);
  return <Screen title="Import statement" onBack={onBack} headerAccessory={<CompactAction variant="icon" label="Import history" icon={<History size={20} color={palette.textPrimary} />} onPress={onHistory} />}>
    <SupportingText>{`Destination: ${c.destination}`}</SupportingText>
    {c.readOnly ? <SupportingText>This Space is unavailable for new imports or is read-only. Retained extraction results remain available for inspection.</SupportingText> : null}
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel="Step 1 of 3, Select file">
      {['1  Select file', '2  Update', '3  Confirm'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: index === 0 ? palette.brandPrimary : palette.divider }} />
        <Text style={{ fontFamily: index === 0 ? fonts.semibold : fonts.regular, fontSize: 12, color: index === 0 ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
      </View>)}
    </View>
    <DesignSurface style={{ paddingHorizontal: 20, paddingVertical: 40, gap: 22 }}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'center', width: 90, height: 110, borderRadius: 18, backgroundColor: palette.surfaceModal, alignItems: 'center', justifyContent: 'center', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3, transform: [{ rotate: '-6deg' }] }}><FileUp size={44} color={palette.brandPrimary} /></View>
      <View accessible accessibilityLabel="Supported providers: BDO AMEX, EastWest VISA, GCash E-Wallet" style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <Image source={require('../../../assets/providers/bdo.svg')} contentFit="contain" accessible={false} style={{ height: 18, aspectRatio: 415.4375 / 145.15625 }} />
        <Image source={require('../../../assets/providers/eastwest.webp')} contentFit="contain" accessible={false} style={{ height: 18, aspectRatio: 330 / 66 }} />
        <Image source={require('../../../assets/providers/gcash.svg')} contentFit="contain" accessible={false} style={{ height: 18, aspectRatio: 72 / 61 }} />
      </View>
      {c.canSelect ? <PrimaryButton label={state.phase === 'idle' ? 'Select PDF' : 'Select PDF again'} onPress={c.select} /> : null}
      {c.cleanup !== 'ready' ? <SupportingText>{c.cleanup === 'starting' ? 'Checking temporary-file cleanup…' : 'Temporary-file cleanup failed. Retry before selecting a PDF.'}</SupportingText> : null}
      {c.cleanup === 'failed' ? <SecondaryButton label="Retry cleanup" onPress={c.retryCleanup} /> : null}
      {running ? <View accessibilityLiveRegion="polite">{state.phase === 'extracting'
        ? <ExtractionProgress completedPages={state.completedPages} totalPages={state.totalPages} />
        : state.phase === 'preparing'
          ? <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel="Preparing PDF"
            accessibilityState={{ busy: true }} color={palette.brandPrimary} size="small" />
          : <BodyText>{state.phase === 'picking' ? 'Select a PDF from your files.' : state.phase === 'interpreting' ? 'Interpreting statement…' : 'This PDF needs a password.'}</BodyText>}</View> : null}
      {state.phase === 'password-required' ? <StackGap>
        <SupportingText>{state.reason === 'incorrect' ? 'That password did not unlock this PDF. Try again.' : 'Enter the statement password to unlock it on this device.'}</SupportingText>
        <PasswordEntry onUnlock={c.unlock} />
      </StackGap> : null}
      {running ? <SecondaryButton label="Cancel extraction" onPress={c.cancel} /> : null}
      {state.phase === 'failed' ? <Text accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular }}>{failureText[state.error]}</Text> : null}
      {state.phase === 'suspended' && !result ? <SupportingText>Processing was interrupted. Reselect the PDF to restart in this Space, or discard this work.</SupportingText> : null}
      {result ? <StackGap>
        <BodyText>Extraction ready</BodyText>
        <SupportingText>{`${result.file.name} · ${result.rows.length} Transactions · ${result.rows.filter(row => row.classification.eligible).length} eligible spending candidates`}</SupportingText>
        {result.warnings.map(warning => <Text key={warning.code} style={{ color: palette.stateWarning, fontFamily: fonts.regular, fontSize: 15 }}>{warningText[warning.code]}</Text>)}
      </StackGap> : null}
      {!running && state.phase !== 'idle' ? <SecondaryButton label="Discard" onPress={discard} /> : null}
    </DesignSurface>
    <BodyText>Recent statements</BodyText>
    {recentHistory}
  </Screen>;
}

function ExtractionProgress({ completedPages, totalPages }: { completedPages: number; totalPages: number | null }) {
  const { palette } = useAppTheme();
  const percent = totalPages ? Math.round((completedPages / totalPages) * 100) : 0;
  const value = totalPages ? {
    min: 0,
    max: 100,
    now: percent,
    text: `${completedPages} of ${totalPages} pages read`,
  } : undefined;
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Reading PDF"
    accessibilityState={{ busy: true }} accessibilityValue={value}
    style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.meterTrack }}>
    <View style={{ width: `${percent}%`, height: '100%', borderRadius: 3, backgroundColor: palette.brandPrimary }} />
  </View>;
}

function PasswordEntry({ onUnlock }: { onUnlock(password: string): void }) {
  const { palette, fonts } = useAppTheme();
  const [password, setPassword] = useState('');
  return <StackGap>
    <TextInput accessibilityLabel="Statement password" autoFocus secureTextEntry autoCapitalize="none" autoCorrect={false}
      value={password} onChangeText={setPassword} style={{ minHeight: 52, padding: 12, borderRadius: 16, color: palette.textPrimary, backgroundColor: palette.surfaceModal, borderWidth: 1, borderColor: palette.fieldBorder, fontFamily: fonts.regular }} />
    <PrimaryButton label="Unlock PDF" disabled={!password} onPress={() => { onUnlock(password); setPassword(''); }} />
  </StackGap>;
}
