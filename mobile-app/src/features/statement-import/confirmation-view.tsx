import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react-native';
import { BackHandler, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CenteredDialog } from '@/components/choice-sheet';
import { CategoryIconMark } from '@/components/category-mark';
import { CanvasBackground, DesignSurface } from '@/components/design-surface';
import { BodyText, SupportingText } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SpaceStatus } from '@/components/space-status';
import { CATEGORY_COLOR_VALUES } from '@/features/categories/category-catalog';
import { useAppTheme } from '@/navigation/app-theme';
import { decimalAmount } from './values';
import type { useImportConfirmation } from './use-import-confirmation';
import { ProviderIdentity } from './provider-identity';

function withThousandsSeparators(value: string | number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function readableDate(value: string) {
  const [year, month, day] = value.split('-');
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  return `${months[Number(month) - 1]} ${Number(day)}, ${year}`;
}

export function ImportConfirmationView({ controller: c, readOnly, onDiscard }: {
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
  const statementDate = statement.dates.statementDate ? readableDate(statement.dates.statementDate)
    : statement.dates.historyPeriod ? `${readableDate(statement.dates.historyPeriod.from)} to ${readableDate(statement.dates.historyPeriod.to)}` : null;
  const segments = summary.categories.map((item, index) => {
    const fraction = summary.total === 0n ? 0 : Number(item.total * 1000000n / summary.total) / 1000000;
    const preceding = summary.categories.slice(0, index).reduce((sum, category) => sum + category.total, 0n);
    const start = summary.total === 0n ? 0 : Number(preceding * 1000000n / summary.total) / 1000000;
    return { ...item, fraction, start };
  });
  const warning = !!c.preview?.warnings.length;
  const formatAmount = (value: bigint) => withThousandsSeparators(decimalAmount(value));
  const total = formatAmount(summary.total);
  const centerTotal = fontScale <= 1.2 && total.length <= 11;
  return <View style={{ flex: 1, backgroundColor: palette.canvas }}>
    <CanvasBackground />
    <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 22 }}>
      <ScreenHeader title="Import statement" />
      <View accessibilityLabel="Step 3 of 3, Confirm" style={{ flexDirection: 'row', gap: 8 }}>
        {['Select', 'Update', 'Confirm'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
          <View style={{ height: 3, backgroundColor: index === 2 ? palette.brandPrimary : palette.divider }} />
          <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: index === 2 ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
        </View>)}
      </View>
      <DesignSurface style={{ padding: 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View accessible accessibilityLabel={`${statement.account.provider.toUpperCase()}, ${statement.account.format}${statementDate ? `. Statement date: ${statementDate}` : ''}`} style={{ flex: 1, gap: 4 }}>
            <ProviderIdentity account={statement.account} showName={false} />
            {statementDate ? <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{statementDate}</Text> : null}
          </View>
          <SpaceStatus readOnly />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[['Found', summary.found], ['Import', summary.included], ['Excluded', summary.excluded]].map(([label, count]) => <View key={label} accessible accessibilityLabel={`${label}: ${withThousandsSeparators(count)}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 18 }}>{withThousandsSeparators(count)}</Text>
            <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{String(label)}</Text>
          </View>)}
        </View>
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
          <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 34 }}>{`PHP ${total}`}</Text>
          <SupportingText>Reviewed import total</SupportingText>
        </View> : null}
      </View>
      <View style={{ gap: 16 }}>
        {summary.categories.map(({ category, total }) => <View key={category.id} accessible accessibilityLabel={`${category.name}, PHP ${formatAmount(total)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} />
          <View style={{ flex: 1 }}><BodyText>{category.name}</BodyText></View><BodyText>{`PHP ${formatAmount(total)}`}</BodyText>
        </View>)}
      </View>
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        {c.phase === 'previewing' ? <SupportingText>Checking the final review…</SupportingText> : null}
        {c.preview?.warnings.map(w => <Text key={w.id} style={{ color: palette.stateWarning, fontFamily: fonts.regular, fontSize: 15 }}>{`${w.message}${w.sourceRowIds.length ? ` (${withThousandsSeparators(w.sourceRowIds.length)} rows)` : ''}`}</Text>)}
        {c.message ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TriangleAlert size={22} color={palette.stateNegative} accessible={false} />
            <Text style={{ color: palette.stateNegative, fontFamily: fonts.semibold, fontSize: 15 }}>Import blocked</Text>
          </View>
          <Text style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: 15 }}>{c.message}</Text>
        </View> : null}
        {readOnly ? <SupportingText>This destination is read-only. Your review remains available to inspect.</SupportingText> : null}
        {!c.canSend ? <SupportingText>Saving is unavailable.</SupportingText> : null}
      </View>
      {c.phase === 'failed' ? <SecondaryButton label="Retry final check" onPress={c.retryPreview} /> : null}
      <SecondaryButton label="Back to review" disabled={c.locked} onPress={c.back} />
      <SecondaryButton label="Close" disabled={c.locked} onPress={() => setClosing(true)} />
      <PrimaryButton label={c.phase === 'uncertain' ? 'Retry same import' : warning ? 'Import anyway' : `Import`} busy={c.phase === 'saving'}
        disabled={!c.canSend || readOnly || !['ready', 'uncertain'].includes(c.phase)} onPress={() => c.submit(warning)} />
    </ScrollView>
    <CenteredDialog visible={closing} title="Discard Statement Import?" onDismiss={() => setClosing(false)}>
      <SupportingText>This clears the living review and all staged Rules.</SupportingText>
      <SecondaryButton label="Keep editing" onPress={() => setClosing(false)} />
      <PrimaryButton label="Discard" tone="destructive" onPress={() => { setClosing(false); onDiscard(); }} />
    </CenteredDialog>
  </View>;
}
