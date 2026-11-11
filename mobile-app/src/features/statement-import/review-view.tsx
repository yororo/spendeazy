import { useCallback, useEffect, useRef, useState, type ElementRef, type ReactNode } from 'react';
import { Bookmark, CalendarDays, Check, ChevronDown, ChevronRight, Info, CircleMinus, Pencil, CircleQuestionMark, TriangleAlert, X } from 'lucide-react-native';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, Switch, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { Popover } from '@/components/popover';
import { CategoryIconMark } from '@/components/category-mark';
import { ConfettiBurst } from '@/components/confetti-burst';
import { CenteredDialog, ChoiceSheet } from '@/components/choice-sheet';
import { CanvasBackground } from '@/components/design-surface';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { space, typeScale } from '@/constants/theme';
import { ExpenseFields } from '@/features/expenses/expense-fields';
import { useAppTheme } from '@/navigation/app-theme';
import type { useStatementImportReview } from './use-statement-import-review';
import { editorDirty, validAssignment } from './review-rules';
import { ProviderIdentity } from './provider-identity';

function withThousandsSeparators(value: string | number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function readableDate(value: string) {
  const [year, month, day] = value.split('-');
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  return `${months[Number(month) - 1]} ${Number(day)}, ${year}`;
}

export function StatementImportReviewView({ controller: c, onBack, onDiscard }: {
  controller: ReturnType<typeof useStatementImportReview>; destination: string; onBack(): void; onDiscard(): void;
}) {
  const { palette, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [modal, setModal] = useState<'edit' | 'categories' | 'category-popover' | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const categoryTrigger = useRef<ElementRef<typeof View>>(null);
  const evidenceTrigger = useRef<ElementRef<typeof View>>(null);
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const editFocus = useRef<ElementRef<typeof View>>(null);
  const list = useRef<FlatList>(null);
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const transactionsProgress = useSharedValue(0);
  const transactionsChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${transactionsProgress.value * 90}deg` }],
  }));
  const discarding = useRef(false);
  const cardX = useSharedValue(0);
  const cardIn = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardIn.value * (1 - Math.min(1, Math.abs(cardX.value) / width)),
    transform: [{ translateX: cardX.value }, { rotate: `${(cardX.value / width) * 6}deg` }, { scale: 0.97 + 0.03 * cardIn.value }],
  }));
  const [celebrating, setCelebrating] = useState(false);
  const hadCard = useRef(false);
  const queueComplete = !!c.review && !c.review.inspectedSourceRowId && !c.review.editor && c.counts.unmapped === 0
    && c.review.original.rows.some(row => row.classification.eligible);
  useEffect(() => {
    if (!queueComplete) hadCard.current = true;
    else if (hadCard.current) {
      hadCard.current = false;
      setCelebrating(true);
    }
  }, [queueComplete]);
  const endCelebration = useCallback(() => setCelebrating(false), []);
  const review = c.review;
  if (!review) return null;
  const editor = review.editor;
  const selectedId = review.inspectedSourceRowId ?? editor?.sourceRowId;
  const source = review.original.rows.find(row => row.sourceRowId === selectedId);
  const selectedRow = selectedId ? review.rows[selectedId] : null;
  const categories = review.catalog.snapshot?.categories.filter(category => category.isActive) ?? [];
  const hasActiveCategory = categories.some(item => item.id === editor?.values.categoryId);
  const category = review.catalog.snapshot?.categories.find(category => category.id === editor?.values.categoryId);
  const disabled = c.readOnly || review.catalog.status !== 'ready';
  const includedCount = c.counts.all - c.counts.excluded;
  const categorizedCount = includedCount - c.counts.unmapped;
  const categorizationProgress = includedCount > 0 ? categorizedCount / includedCount : 0;
  const remember = (patch: Partial<NonNullable<typeof editor>>) => {
    if (editor) c.send({ type: 'editorChanged', editor: { ...editor, ...patch } });
  };
  const close = () => Alert.alert('Discard Statement Import?', 'This clears the living review and all staged Rules.', [
    { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
  const open = (sourceRowId: string) => {
    c.send({ type: 'rowOpened', sourceRowId });
    setShowEvidence(false);
    setModal(null);
  };
  const dismissEditor = () => {
    const dismiss = () => {
      if (editorDirty(review, editor)) c.send({ type: 'editorAbandoned' });
      setModal(null);
      if (review.inspectedSourceRowId) c.send({ type: 'queueReturned' });
    };
    if (editorDirty(review, editor)) Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard changes', style: 'destructive', onPress: dismiss },
    ]);
    else dismiss();
  };
  const commitSave = () => {
    discarding.current = false;
    if (c.save()) {
      setModal(null);
      cardX.set(0);
      cardIn.set(0);
      cardIn.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
    } else cardX.set(withSpring(0));
  };
  const saveAndNext = () => {
    if (reducedMotion) {
      if (c.save()) setModal(null);
      return;
    }
    if (discarding.current) return;
    discarding.current = true;
    cardX.set(withTiming(-width, { duration: 220, easing: Easing.in(Easing.cubic) }, finished => {
      if (finished) scheduleOnRN(commitSave);
    }));
  };
  const categoryChoices = (
      <View>
        {categories.map(item => {
          const selected = editor?.values.categoryId === item.id;
          return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.name} accessibilityState={{ selected, disabled }} disabled={disabled}
            onPress={() => { c.patch({ categoryId: item.id }); setModal(null); }}
            style={{ minHeight: 52, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: selected ? palette.selectedSpace : 'transparent', opacity: disabled ? 0.55 : 1 }}>
            <CategoryIconMark iconKey={item.iconKey} colorKey={item.colorKey} size={20} />
            <Text style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 15, color: selected ? palette.brandPrimary : palette.textPrimary }}>{item.name}</Text>
            {selected ? <Check size={18} color={palette.brandPrimary} /> : null}
          </Pressable>;
        })}
        {categories.length === 0 ? <SupportingText>No active Categories available.</SupportingText> : null}
      </View>
  );
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.canvas }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
    <CanvasBackground />
    <FlatList ref={list} data={transactionsExpanded ? c.rows : []} extraData={review} keyExtractor={row => row.sourceRowId}
      keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 14 }}
      ListHeaderComponent={<StackGap>
        <ScreenHeader title="Import" onBack={onBack} accessory={
          <CompactAction label="Discard" accessibilityLabel="Discard import" variant="quiet" wrapLabel icon={<X size={20} color={palette.textPrimary} />} onPress={close} />
        } />
        <View accessibilityLabel="Step 2 of 3, Update" style={{ flexDirection: 'row', gap: 8 }}>
          {['✓ Select file', 'Update', 'Confirm'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: index <= 1 ? palette.brandPrimary : palette.divider }} />
            <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: index === 1 ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
          </View>)}
        </View>
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: palette.editorField, gap: 4 }}>
          <ProviderIdentity account={review.original.account} networkPlacement="trailing" />
          <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{review.original.file.name}</Text>
          <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{`${withThousandsSeparators(review.original.rows.length)} transactions`}</Text>
        </View>
        {review.original.warnings.map(warning => <View key={warning.code} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <TriangleAlert size={18} color={palette.stateWarning} accessible={false} />
          <Text style={{ flex: 1, color: palette.stateWarning, fontSize: 14, fontFamily: fonts.regular }}>{warningMessage(warning.code)}</Text>
        </View>)}
        {c.readOnly ? <SupportingText>This destination is read-only. Review remains available for inspection.</SupportingText> : null}
        <>
          {review.catalog.status !== 'ready' ? <SupportingText>{review.catalog.status === 'failed' ? 'Categories and Rules could not be loaded. Your review is retained. Retry to assign or continue.' : 'Loading Categories and Rules…'}</SupportingText> : null}
          {review.catalog.status !== 'ready' ? <SecondaryButton label="Retry" busy={review.catalog.status === 'loading'} onPress={c.refresh} /> : null}
          {review.catalog.status === 'ready' && categories.length === 0 ? <SupportingText>No active Categories. Activate a Category in this Space before assigning spending.</SupportingText> : null}
          {!review.inspectedSourceRowId ? <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text accessibilityRole="header" style={{ fontSize: 15, fontFamily: fonts.semibold, color: palette.textPrimary }}>Categorize</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View accessible accessibilityRole="progressbar" accessibilityLabel="Categorization progress"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(categorizationProgress * 100), text: includedCount > 0 ? `${withThousandsSeparators(categorizedCount)} of ${withThousandsSeparators(includedCount)} included transactions categorized` : 'No included transactions to categorize' }}
                style={{ width: 112, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.meterTrack }}>
                <View style={{ width: `${categorizationProgress * 100}%`, height: '100%', borderRadius: 3, backgroundColor: palette.brandPrimary }} />
              </View>
              <Text accessibilityLabel={`${withThousandsSeparators(categorizedCount)} of ${withThousandsSeparators(includedCount)} included transactions categorized`}
                style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{`${withThousandsSeparators(categorizedCount)}/${withThousandsSeparators(includedCount)}`}</Text>
            </View>
          </View>
          <View style={{ paddingBottom: queueComplete ? 0 : 12 }}>
            {celebrating ? <ConfettiBurst colors={[palette.brandPrimary, palette.stateWarning, palette.stateNegative, palette.importCategoryBorder]} onDone={endCelebration} /> : null}
            {queueComplete ? null : [{ inset: 8, bottom: 0, fill: palette.importCardBack }, { inset: 4, bottom: 6, fill: palette.importCardMiddle }].map(layer => <View key={layer.inset} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: layer.inset, right: layer.inset, top: 12, bottom: layer.bottom, borderRadius: 24, backgroundColor: layer.fill, borderWidth: 1, borderColor: palette.selectedSpaceBorder }} />)}
            <Animated.View style={[{ padding: 18, gap: 16, borderRadius: 24, borderWidth: 1, borderColor: palette.selectedSpaceBorder, backgroundColor: palette.importCard }, cardStyle]}>
              {source && selectedRow ? <>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <CalendarDays size={16} color={palette.textPrimary} accessible={false} />
                      <Text style={{ flexShrink: 1, fontSize: 14, fontFamily: fonts.regular, color: palette.textPrimary }}>{readableDate(editor?.values.expenseDate || source.originalDate)}</Text>
                    </View>
                    {editor ? <View ref={editFocus}><QueueAction label="Edit" disabled={disabled} onPress={() => setModal('edit')} icon={<Pencil size={14} color={palette.textSecondary} />} /></View> : null}
                  </View>
                  <Text style={{ fontSize: 18, fontFamily: fonts.semibold, color: palette.textPrimary, textAlign: 'center' }}>{editor?.values.description || source.description}</Text>
                  <Text style={{ marginVertical: 4, fontSize: 18, fontFamily: fonts.medium, color: palette.textPrimary, textAlign: 'center' }}>{`₱${withThousandsSeparators(editor?.values.amount || source.originalAmount)}`}</Text>
                </View>
                {editor ? <>
                  <View style={{ gap: 7 }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: palette.textSecondary }}>Category</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Category: ${category?.name ?? 'Choose Category'}`} ref={categoryTrigger} accessibilityState={{ disabled, expanded: modal === 'category-popover' }} disabled={disabled} onPress={() => setModal('category-popover')} style={{ minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.importCategoryBorder, backgroundColor: palette.importCategory, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.55 : 1 }}>
                      {category ? <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} size={18} /> : <CircleQuestionMark size={18} color={palette.brandPrimary} />}
                      <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.medium, color: palette.textPrimary }}>{category?.name ?? 'Choose Category'}</Text>
                      <ChevronDown size={18} color={palette.brandPrimary} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Bookmark size={17} color={palette.brandPrimary} />
                    <Text style={{ flex: 1, fontSize: 13, fontFamily: fonts.medium, color: palette.textPrimary }}>Remember for next time</Text>
                    <View style={{ minHeight: 48, justifyContent: 'center' }}><Switch accessibilityLabel="Remember as a Category Rule" trackColor={{ true: palette.brandPrimary }} disabled={disabled} value={editor.remember} onValueChange={rememberValue => remember({ remember: rememberValue, pattern: editor.values.description, matchType: 'exact' })} /></View>
                  </View>
                  {editor.remember ? <>
                    <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: palette.importRuleTrack }}>
                      {(['exact', 'contains'] as const).map(mode => <View key={mode} style={{ flex: 1 }}><CompactAction label={mode === 'exact' ? 'Exactly' : 'Contains'} variant="segmented" selected={editor.matchType === mode} disabled={disabled} onPress={() => remember({ matchType: mode })} /></View>)}
                    </View>
                    <TextField label="Rule pattern" value={editor.pattern} editable={!disabled} onChangeText={pattern => remember({ pattern })} />
                  </> : null}
                  {(review.errors ?? []).map(message => <ErrorText key={message} message={message} />)}
                  <PrimaryButton label="Save & next" disabled={disabled || !hasActiveCategory} onPress={saveAndNext} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <QueueAction label="Exclude" outlined accessibilityLabel="Exclude Transaction and abandon unapplied edits" icon={<CircleMinus size={14} color={palette.textSecondary} />} disabled={c.readOnly} onPress={() => c.send({ type: 'excluded', sourceRowId: editor.sourceRowId })} />
                    <QueueAction label="Skip for now →" accessibilityLabel="Skip for now and abandon unapplied edits" disabled={c.readOnly} onPress={() => c.send({ type: 'skipped' })} brand />
                  </View>
                </> : selectedRow.inclusion === 'user-excluded' ? <SecondaryButton label="Restore Transaction" disabled={c.readOnly} onPress={() => c.send({ type: 'restored', sourceRowId: selectedRow.sourceRowId })} /> : <SupportingText>{`Excluded: ${source.classification.eligible ? 'Not included' : exclusionReason(source.classification.reason)}. Its original classification cannot be overridden here.`}</SupportingText>}
              </> : c.counts.unmapped ? <>
                <SupportingText>{`${withThousandsSeparators(c.counts.unmapped)} skipped Transactions still need Categories.`}</SupportingText>
                <PrimaryButton label="Review skipped" onPress={() => c.send({ type: 'skippedReviewed' })} />
              </> : <SupportingText>{review.original.rows.some(row => row.classification.eligible) ? 'Queue complete. Review the ledger, then Continue.' : 'No eligible spending was extracted. The original activity remains in the ledger.'}</SupportingText>}
              {review.inspectedSourceRowId ? <SecondaryButton label="Return to queue" onPress={() => c.send({ type: 'queueReturned' })} /> : null}
            </Animated.View>
          </View>
          </> : null}
          {(review.validationIssues ?? []).map((issue, index) => <View key={index} style={{ gap: 6 }}>
            <ErrorText message={issue.message} />
            {issue.sourceRowId ? <SecondaryButton label={`Review Transaction ${withThousandsSeparators(review.original.rows.findIndex(row => row.sourceRowId === issue.sourceRowId) + 1)}`} onPress={() => open(issue.sourceRowId!)} /> : null}
          </View>)}
          <Pressable accessibilityRole="button" accessibilityLabel={`Transactions, ${withThousandsSeparators(includedCount)} included, ${withThousandsSeparators(c.counts.excluded)} excluded`}
            accessibilityState={{ expanded: transactionsExpanded }} onPress={() => {
              const expanded = !transactionsExpanded;
              setTransactionsExpanded(expanded);
              transactionsProgress.set(reducedMotion ? (expanded ? 1 : 0) : withSpring(expanded ? 1 : 0, { damping: 22, stiffness: 130 }));
            }}
            style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text accessibilityRole="header" style={{ fontSize: 15, fontFamily: fonts.semibold, color: palette.textPrimary }}>Transactions</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{`${withThousandsSeparators(includedCount)} included · ${withThousandsSeparators(c.counts.excluded)} excluded`}</Text>
            </View>
            <Animated.View style={transactionsChevronStyle}>
              <ChevronRight size={18} color={palette.textSecondary} />
            </Animated.View>
          </Pressable>
          {transactionsExpanded ? <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['unmapped', 'excluded', 'all'] as const).map(filter => <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: review.ledgerFilter === filter }} onPress={() => c.send({ type: 'filterChanged', filter })}
              style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
              <View style={{ paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, backgroundColor: review.ledgerFilter === filter ? palette.textPrimary : palette.editorField }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.medium, textAlign: 'center', color: review.ledgerFilter === filter ? palette.canvas : palette.textSecondary }}>{`${filter === 'all' ? 'All' : filter === 'unmapped' ? 'Unmapped' : 'Excluded'} ${withThousandsSeparators(c.counts[filter])}`}</Text>
              </View>
            </Pressable>)}
          </View> : null}
        </>
      </StackGap>}
      renderItem={({ item }) => {
        const original = review.original.rows.find(row => row.sourceRowId === item.sourceRowId)!;
        const mapped = review.catalog.snapshot?.categories.find(category => category.id === item.values.categoryId);
        const excluded = item.inclusion !== 'included';
        const unmapped = !excluded && !validAssignment(review, item);
        const categoryLabel = excluded ? (item.inclusion === 'locked-excluded' ? exclusionReason(original.classification.eligible ? 'unknown-direction' : original.classification.reason) : 'Excluded') : unmapped ? 'Unmapped' : mapped?.name;
        const manuallyUpdated = item.assignment?.origin === 'manual' || item.inclusion === 'user-excluded';
        return <Pressable accessibilityRole="button" accessibilityLabel={`${item.values.description || original.description}, ${categoryLabel}.${manuallyUpdated ? ' Manually updated.' : ''} Open review.`}
          onPress={() => open(item.sourceRowId)} style={{ minHeight: 64, paddingVertical: 12, paddingHorizontal: 8, borderRadius: item.sourceRowId === selectedId ? 12 : 0, backgroundColor: item.sourceRowId === selectedId ? palette.selectedSpace : 'transparent', borderBottomWidth: 1, borderColor: palette.divider, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {mapped ? <CategoryIconMark iconKey={mapped.iconKey} colorKey={mapped.colorKey} size={18} /> : <CircleQuestionMark size={18} color={palette.textSecondary} />}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: palette.textPrimary }}>{item.values.description || original.description}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.rowGap }}>
              <Text style={{ flexShrink: 1, fontSize: 11, fontFamily: fonts.regular, color: unmapped ? palette.stateWarning : palette.textSecondary }}>{`${readableDate(item.values.expenseDate || original.originalDate)} · ${categoryLabel}`}</Text>
              {manuallyUpdated ? <Pencil size={typeScale.metadata} color={palette.textSecondary} accessible={false} /> : null}
            </View>
          </View>
          <View style={{ flexShrink: 1, alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.medium, color: palette.textPrimary }}>{`₱${withThousandsSeparators(item.values.amount || original.originalAmount)}`}</Text>
            {item.sourceRowId === selectedId ? <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.brandPrimary }}>Reviewing</Text> : null}
          </View>
        </Pressable>;
      }}
      ListEmptyComponent={transactionsExpanded ? <SupportingText>No Transactions in this filter.</SupportingText> : undefined}
      ListFooterComponent={<View style={{ paddingTop: 16, gap: 14 }}><PrimaryButton label="Continue" disabled={disabled || c.counts.unmapped > 0} onPress={c.continue} /></View>} />
    <CenteredDialog title={selectedRow && selectedRow.inclusion !== 'included' ? 'Excluded' : 'Edit transaction'} showClose headerAccessory={<View style={{ flexDirection: 'row' }}><Pressable ref={evidenceTrigger} accessibilityRole="button" accessibilityLabel="Original evidence" accessibilityState={{ expanded: showEvidence }} onPress={() => setShowEvidence(true)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Info size={20} color={palette.textSecondary} /></Pressable>{selectedRow?.inclusion === 'included' ? <CompactAction label="Exclude transaction" variant="icon" disabled={c.readOnly} icon={<CircleMinus size={20} color={palette.textSecondary} />} onPress={() => {
      if (c.readOnly || !selectedRow || selectedRow.inclusion !== 'included') return;
      c.send({ type: 'excluded', sourceRowId: selectedRow.sourceRowId });
      setShowEvidence(false);
      setModal(null);
    }} /> : null}</View>} visible={review.inspectedSourceRowId ? modal !== 'categories' : modal === 'edit' && !!editor} onDismiss={dismissEditor} restoreFocusRef={editFocus}>
      <Popover title="Original evidence" visible={showEvidence} onDismiss={() => setShowEvidence(false)} anchorRef={evidenceTrigger} showHeader={false}>
        {source ? <View style={{ gap: 4 }}><SupportingText>{`Original evidence · ${readableDate(source.originalDate)} · ${withThousandsSeparators(source.originalAmount)}`}</SupportingText><BodyText>{source.description}</BodyText><SupportingText>{source.classification.eligible ? `Eligible ${source.classification.kind}` : `Excluded: ${exclusionReason(source.classification.reason)}`}</SupportingText></View> : null}
      </Popover>
      {editor ? <>
        <ExpenseFields nativeDatePicker compact disabled={disabled} draft={{ ...editor.values }} issues={{}} categoryLabel={category?.name ?? 'Choose Category'} onChange={c.patch} onOpenCategories={() => setModal('categories')} />

        {review.inspectedSourceRowId ? <>
          {(review.errors ?? []).map(message => <ErrorText key={message} message={message} />)}
          <PrimaryButton label="Save" disabled={disabled} onPress={c.save} />
        </> : null}
        {!review.inspectedSourceRowId ? <PrimaryButton label="Save" disabled={disabled} onPress={() => { if (c.save()) setModal(null); }} /> : null}
      </> : source && selectedRow ? <>
        <BodyText>{source.description}</BodyText>
        <SupportingText>{`${readableDate(source.originalDate)} · ₱${withThousandsSeparators(source.originalAmount)}`}</SupportingText>
        {selectedRow.inclusion === 'user-excluded' ? <SecondaryButton label="Restore" disabled={c.readOnly} onPress={() => c.send({ type: 'restored', sourceRowId: selectedRow.sourceRowId })} /> : <SupportingText>{exclusionReason(source.classification.eligible ? 'unknown-direction' : source.classification.reason)}</SupportingText>}

      </> : null}
    </CenteredDialog>
    <Popover title="Choose Category" visible={modal === 'category-popover'} onDismiss={() => setModal(null)} anchorRef={categoryTrigger} showHeader={false}>
      {categoryChoices}
    </Popover>
    <ChoiceSheet title="Choose Category" visible={modal === 'categories'} onDismiss={() => setModal(null)} restoreFocusRef={editFocus} maxHeight="65%" showClose>
      {categoryChoices}
    </ChoiceSheet>
  </KeyboardAvoidingView>;
}
function QueueAction({ label, accessibilityLabel = label, onPress, disabled = false, brand = false, outlined = false, icon }: {
  label: string; accessibilityLabel?: string; onPress(): void; disabled?: boolean; brand?: boolean; outlined?: boolean; icon?: ReactNode;
}) {
  const { palette, fonts } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, minWidth: 48, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: disabled ? 0.55 : 1 }}>
    <View pointerEvents="none" style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, ...(outlined ? { minHeight: 32, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: palette.fieldBorder, backgroundColor: palette.surfaceModal } : {}) }}>
      {icon}
      {label ? <Text style={{ flexShrink: 1, fontSize: 12, fontFamily: brand || outlined ? fonts.medium : fonts.regular, color: brand ? palette.brandPrimary : palette.textSecondary }}>{label}</Text> : null}
    </View>
  </Pressable>;
}
function ErrorText({ message }: { message: string }) {
  const { palette, fonts } = useAppTheme();
  return <Text accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontSize: 14, fontFamily: fonts.regular }}>{message}</Text>;
}
function warningMessage(code: string) {
  const messages: Record<string, string> = {
    'partial-extraction': 'Some pages or activity could not be read. Extracted Transactions may be incomplete.',
    'unresolved-classification': 'Some Transactions have uncertain direction or dates and remain excluded.',
    'reconciliation-mismatch': 'Extracted activity does not match the original statement controls.',
    'missing-control': 'Some original statement controls are missing or unreadable.',
  };
  return messages[code] ?? code;
}
function exclusionReason(reason: string) {
  const labels: Record<string, string> = {
    payment: 'Payment', refund: 'Refund', credit: 'Credit', 'cash-in': 'Cash in',
    'unknown-direction': 'Direction unclear', 'invalid-date': 'Invalid date', 'invalid-amount': 'Invalid amount',
  };
  return labels[reason] ?? 'Unclassified';
}
