import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { CategoryIconMark } from '@/components/category-mark';
import { CanvasBackground, DesignSurface } from '@/components/design-surface';
import { BodyText, SupportingText } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { CATEGORY_COLOR_VALUES } from '@/features/categories/category-catalog';
import { useAppTheme } from '@/navigation/app-theme';
import { decimalAmount } from './values';
import type { useImportConfirmation } from './use-import-confirmation';

export function ImportConfirmationView({ controller: c, destination, readOnly, onDiscard }: {
  controller: ReturnType<typeof useImportConfirmation>; destination: string; readOnly: boolean; onDiscard(): void;
}) {
  const { palette, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { if (!c.locked) c.back(); return true; });
    return () => handler.remove();
  }, [c]);
  const h = c.handoff; const summary = c.summary;
  if (!h || !summary) return null;
  const statement = h.original;
  const segments = summary.categories.map((item, index) => {
    const fraction = summary.total === 0n ? 0 : Number(item.total * 1000000n / summary.total) / 1000000;
    const preceding = summary.categories.slice(0, index).reduce((sum, category) => sum + category.total, 0n);
    const start = summary.total === 0n ? 0 : Number(preceding * 1000000n / summary.total) / 1000000;
    return { ...item, fraction, start };
  });
  const warning = !!c.preview?.warnings.length;
  const total = decimalAmount(summary.total);
  const centerTotal = fontScale <= 1.2 && total.length <= 11;
  return <View style={{ flex: 1, backgroundColor: palette.canvas }}>
    <CanvasBackground />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 22 }}>
      <ScreenHeader title="Import statement" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><SecondaryButton label="Back to review" disabled={c.locked} onPress={c.back} /></View>
        <SecondaryButton label="Close" disabled={c.locked} onPress={() => setClosing(true)} />
      </View>
      <View accessibilityLabel="Step 3 of 3, Confirm" style={{ flexDirection: 'row', gap: 8 }}>
        {['1 Select', '2 Update', '3 Confirm'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
          <View style={{ height: 3, backgroundColor: index === 2 ? palette.brandPrimary : palette.divider }} />
          <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: index === 2 ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
        </View>)}
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <BodyText>{`${statement.account.provider.toUpperCase()} · ${statement.account.format}`}</BodyText>
        <SupportingText>{statement.dates.statementDate ?? `${statement.dates.historyPeriod?.from} – ${statement.dates.historyPeriod?.to}`}</SupportingText>
        <SupportingText>{`Destination: ${destination} · PHP`}</SupportingText>
      </View>
      <DesignSurface style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        {[['Found', summary.found], ['Import', summary.included], ['Excluded', summary.excluded]].map(([label, count]) => <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 23 }}>{count}</Text><SupportingText>{String(label)}</SupportingText>
        </View>)}
      </DesignSurface>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <View style={{ width: 224, height: 224 }}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={224} height={224} viewBox="0 0 224 224">
            <Circle cx={112} cy={112} r={96} stroke={palette.divider} strokeWidth={14} fill="none" />
            {segments.map(s => <Circle key={s.category.id} cx={112} cy={112} r={96} fill="none" stroke={CATEGORY_COLOR_VALUES[s.category.colorKey]} strokeWidth={14}
              strokeDasharray={`${s.fraction * 603.186} 603.186`} strokeDashoffset={-s.start * 603.186} rotation={-90} origin="112,112" />)}
          </Svg>
          </View>
          {centerTotal ? <View style={{ position: 'absolute', top: 0, left: 22, right: 22, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <SupportingText>PHP</SupportingText>
            <Text accessibilityLabel={`Reviewed import total, PHP ${total}`} style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 28 }}>{total}</Text>
            <SupportingText>to import</SupportingText>
          </View> : null}
        </View>
        {!centerTotal ? <View style={{ alignItems: 'center', gap: 6 }}>
          <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 34 }}>{`PHP ${decimalAmount(summary.total)}`}</Text>
          <SupportingText>Reviewed import total</SupportingText>
        </View> : null}
      </View>
      <View style={{ gap: 16 }}>
        {summary.categories.map(({ category, total }) => <View key={category.id} accessible accessibilityLabel={`${category.name}, PHP ${decimalAmount(total)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} />
          <View style={{ flex: 1 }}><BodyText>{category.name}</BodyText></View><BodyText>{`PHP ${decimalAmount(total)}`}</BodyText>
        </View>)}
      </View>
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        {c.phase === 'previewing' ? <SupportingText>Checking the final review…</SupportingText> : null}
        {c.preview?.warnings.map(w => <Text key={w.id} style={{ color: palette.stateWarning, fontFamily: fonts.regular, fontSize: 15 }}>{`${w.message}${w.sourceRowIds.length ? ` (${w.sourceRowIds.length} rows)` : ''}`}</Text>)}
        {warning ? <SupportingText>Review these warnings. Import anyway explicitly acknowledges every warning shown above.</SupportingText> : null}
        {c.message ? <BodyText>{c.message}</BodyText> : null}
        {readOnly ? <SupportingText>This destination is read-only. Your review remains available to inspect.</SupportingText> : null}
        {!c.canSend ? <SupportingText>Saving is unavailable until submission recovery is connected. You can inspect warnings and return to review.</SupportingText> : null}
      </View>
      {c.phase === 'failed' ? <SecondaryButton label="Retry final check" onPress={c.retryPreview} /> : null}
      <PrimaryButton label={c.phase === 'uncertain' ? 'Retry same import' : warning ? 'Import anyway' : `Import to ${destination}`} busy={c.phase === 'saving'}
        disabled={!c.canSend || readOnly || !['ready', 'uncertain'].includes(c.phase)} onPress={() => c.submit(warning)} />
      <SecondaryButton label="Back to review" disabled={c.locked} onPress={c.back} />
    </ScrollView>
    <CenteredDialog visible={closing} title="Discard Statement Import?" onDismiss={() => setClosing(false)}>
      <SupportingText>This clears the living review and all staged Rules.</SupportingText>
      <SecondaryButton label="Keep editing" onPress={() => setClosing(false)} />
      <PrimaryButton label="Discard" tone="destructive" onPress={() => { setClosing(false); onDiscard(); }} />
    </CenteredDialog>
  </View>;
}
