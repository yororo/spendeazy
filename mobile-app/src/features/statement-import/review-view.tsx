import { useRef, useState, type ElementRef, type ReactNode } from 'react';
import { ArrowLeft, Bookmark, ChevronDown, FileText, Landmark, Pencil, Shapes, X } from 'lucide-react-native';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CategoryIconMark } from '@/components/category-mark';
import { CenteredDialog, ChoiceSheet } from '@/components/choice-sheet';
import { CanvasBackground } from '@/components/design-surface';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ExpenseFields } from '@/features/expenses/expense-fields';
import { useAppTheme } from '@/navigation/app-theme';
import type { useStatementImportReview } from './use-statement-import-review';
import { editorDirty, validAssignment } from './review-rules';

export function StatementImportReviewView({ controller: c, destination, onBack, onDiscard }: {
  controller: ReturnType<typeof useStatementImportReview>; destination: string; onBack(): void; onDiscard(): void;
}) {
  const { palette, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [modal, setModal] = useState<'edit' | 'categories' | null>(null);
  const editFocus = useRef<ElementRef<typeof View>>(null);
  const list = useRef<FlatList>(null);
  const review = c.review;
  if (!review) return null;
  const editor = review.editor;
  const selectedId = review.inspectedSourceRowId ?? editor?.sourceRowId;
  const source = review.original.rows.find(row => row.sourceRowId === selectedId);
  const selectedRow = selectedId ? review.rows[selectedId] : null;
  const categories = review.catalog.snapshot?.categories.filter(category => category.isActive) ?? [];
  const category = review.catalog.snapshot?.categories.find(category => category.id === editor?.values.categoryId);
  const disabled = c.readOnly || review.catalog.status !== 'ready';
  const remember = (patch: Partial<NonNullable<typeof editor>>) => {
    if (editor) c.send({ type: 'editorChanged', editor: { ...editor, ...patch } });
  };
  const close = () => Alert.alert('Discard Statement Import?', 'This clears the living review and all staged Rules.', [
    { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
  const open = (sourceRowId: string) => {
    c.send({ type: 'rowOpened', sourceRowId });
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.canvas }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
    <CanvasBackground />
    <FlatList ref={list} data={c.rows} extraData={review} keyExtractor={row => row.sourceRowId}
      keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 14 }}
      ListHeaderComponent={<StackGap>
        <ScreenHeader title="Import" accessory={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CompactAction label="Back · keep work" variant="icon" icon={<ArrowLeft size={22} color={palette.textPrimary} />} onPress={onBack} />
          <CompactAction label="Close" variant="icon" icon={<X size={20} color={palette.textPrimary} />} onPress={close} />
        </View>} />
        <View accessibilityLabel="Step 2 of 3, Update" style={{ flexDirection: 'row', gap: 8 }}>
          {['✓ Select file', '2 Update', '3 Confirm'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: index <= 1 ? palette.brandPrimary : palette.divider }} />
            <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: index === 1 ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
          </View>)}
        </View>
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: palette.editorField, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Landmark size={18} color={palette.brandPrimary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: palette.textPrimary }}>{`${review.original.account.provider.toUpperCase()} · ${review.original.account.format}`}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{`${review.original.rows.length} transactions · ${review.original.file.name}`}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{`Destination: ${destination}`}</Text>
          </View>
          <FileText size={18} color={palette.textSecondary} />
        </View>
        {review.original.warnings.map(warning => <Text key={warning.code} style={{ color: palette.stateWarning, fontSize: 14, fontFamily: fonts.regular }}>{warningMessage(warning.code)}</Text>)}
        {c.readOnly ? <SupportingText>This destination is read-only. Review remains available for inspection.</SupportingText> : null}
        <>
          {review.catalog.status !== 'ready' ? <SupportingText>{review.catalog.status === 'failed' ? 'Categories and Rules could not be loaded. Your review is retained. Retry to assign or continue.' : 'Loading Categories and Rules…'}</SupportingText> : null}
          {review.catalog.status !== 'ready' ? <SecondaryButton label="Retry Categories and Rules" busy={review.catalog.status === 'loading'} onPress={c.refresh} /> : null}
          {review.catalog.status === 'ready' && categories.length === 0 ? <SupportingText>No active Categories. Activate a Category in this Space before assigning spending.</SupportingText> : null}
          <View style={{ paddingBottom: 12 }}>
            {[{ inset: 8, bottom: 0, fill: palette.importCardBack }, { inset: 4, bottom: 6, fill: palette.importCardMiddle }].map(layer => <View key={layer.inset} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: layer.inset, right: layer.inset, top: 12, bottom: layer.bottom, borderRadius: 24, backgroundColor: layer.fill, borderWidth: 1, borderColor: palette.selectedSpaceBorder }} />)}
            <View style={{ padding: 18, gap: 16, borderRadius: 24, borderWidth: 1, borderColor: palette.selectedSpaceBorder, backgroundColor: palette.importCard }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.semibold, color: palette.brandPrimary }}>{review.inspectedSourceRowId ? 'Transaction review' : 'Categorize'}</Text>
                <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: palette.brandPrimary }}>{`${c.counts.unmapped} left`}</Text>
              </View>
              {source && selectedRow ? <>
                <View style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flexGrow: 1, flexShrink: 1, fontSize: 18, fontFamily: fonts.semibold, color: palette.textPrimary }}>{editor?.values.description || source.description}</Text>
                    <Text style={{ fontSize: 22, fontFamily: fonts.semibold, color: palette.textPrimary }}>{`PHP ${editor?.values.amount || source.originalAmount}`}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{editor?.values.expenseDate || source.originalDate}</Text>
                    {editor ? <View ref={editFocus}><QueueAction label="Correct details" disabled={disabled} onPress={() => setModal('edit')} icon={<Pencil size={14} color={palette.textSecondary} />} /></View> : null}
                  </View>
                </View>
                {editor ? <>
                  <View style={{ gap: 7 }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: palette.textSecondary }}>Category</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Category: ${category?.name ?? 'Choose Category'}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => setModal('categories')} style={{ minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.importCategoryBorder, backgroundColor: palette.importCategory, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.55 : 1 }}>
                      {category ? <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} size={18} /> : <Shapes size={18} color={palette.brandPrimary} />}
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
                    <SupportingText>Staged only in this draft. No Rule is saved yet.</SupportingText>
                  </> : null}
                  {(review.errors ?? []).map(message => <ErrorText key={message} message={message} />)}
                  <PrimaryButton label="Save & next" disabled={disabled} onPress={c.save} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <QueueAction label="Exclude" accessibilityLabel="Exclude Transaction and abandon unapplied edits" disabled={c.readOnly} onPress={() => c.send({ type: 'excluded', sourceRowId: editor.sourceRowId })} />
                    <QueueAction label="Skip for now →" accessibilityLabel="Skip for now and abandon unapplied edits" disabled={c.readOnly} onPress={() => c.send({ type: 'skipped' })} brand />
                  </View>
                </> : selectedRow.inclusion === 'user-excluded' ? <SecondaryButton label="Restore Transaction" disabled={c.readOnly} onPress={() => c.send({ type: 'restored', sourceRowId: selectedRow.sourceRowId })} /> : <SupportingText>{`Excluded: ${source.classification.eligible ? 'Not included' : source.classification.reason}. Its original classification cannot be overridden here.`}</SupportingText>}
              </> : c.counts.unmapped ? <>
                <SupportingText>{`${c.counts.unmapped} skipped Transactions still need Categories.`}</SupportingText>
                <PrimaryButton label="Review skipped" onPress={() => c.send({ type: 'skippedReviewed' })} />
              </> : <SupportingText>{review.original.rows.some(row => row.classification.eligible) ? 'Queue complete. Review the ledger, then Continue.' : 'No eligible spending was extracted. The original activity remains in the ledger.'}</SupportingText>}
              {review.inspectedSourceRowId ? <SecondaryButton label="Return to queue" onPress={() => c.send({ type: 'queueReturned' })} /> : null}
            </View>
          </View>
          {(review.validationIssues ?? []).map((issue, index) => <View key={index} style={{ gap: 6 }}>
            <ErrorText message={issue.message} />
            {issue.sourceRowId ? <SecondaryButton label={`Review Transaction ${review.original.rows.findIndex(row => row.sourceRowId === issue.sourceRowId) + 1}`} onPress={() => open(issue.sourceRowId!)} /> : null}
          </View>)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text accessibilityRole="header" style={{ fontSize: 15, fontFamily: fonts.semibold, color: palette.textPrimary }}>Transactions</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.textSecondary }}>{`${c.counts.all - c.counts.excluded} included · ${c.counts.excluded} excluded`}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['all', 'unmapped', 'excluded'] as const).map(filter => <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: review.ledgerFilter === filter }} onPress={() => c.send({ type: 'filterChanged', filter })}
              style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
              <View style={{ paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, backgroundColor: review.ledgerFilter === filter ? palette.textPrimary : palette.editorField }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.medium, textAlign: 'center', color: review.ledgerFilter === filter ? palette.canvas : palette.textSecondary }}>{`${filter === 'all' ? 'All' : filter === 'unmapped' ? 'Unmapped' : 'Excluded'} ${c.counts[filter]}`}</Text>
              </View>
            </Pressable>)}
          </View>
        </>
      </StackGap>}
      renderItem={({ item }) => {
        const original = review.original.rows.find(row => row.sourceRowId === item.sourceRowId)!;
        const mapped = review.catalog.snapshot?.categories.find(category => category.id === item.values.categoryId);
        return <Pressable accessibilityRole="button" accessibilityLabel={`${item.values.description || original.description}, ${item.inclusion !== 'included' ? 'Excluded' : validAssignment(review, item) ? mapped?.name : 'Unmapped'}. Open review.`}
          onPress={() => open(item.sourceRowId)} style={{ minHeight: 64, paddingVertical: 12, paddingHorizontal: 8, borderRadius: item.sourceRowId === selectedId ? 12 : 0, backgroundColor: item.sourceRowId === selectedId ? palette.selectedSpace : 'transparent', borderBottomWidth: 1, borderColor: palette.divider, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {mapped ? <CategoryIconMark iconKey={mapped.iconKey} colorKey={mapped.colorKey} size={18} /> : <Shapes size={18} color={palette.textSecondary} />}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: palette.textPrimary }}>{item.values.description || original.description}</Text>
            <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: item.inclusion === 'included' && !validAssignment(review, item) ? palette.stateWarning : palette.textSecondary }}>{`${item.values.expenseDate || original.originalDate} · ${item.inclusion !== 'included' ? 'Excluded' : validAssignment(review, item) ? mapped?.name : 'Unmapped'}`}</Text>
          </View>
          <View style={{ flexShrink: 1, alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.medium, color: palette.textPrimary }}>{`PHP ${item.values.amount || original.originalAmount}`}</Text>
            {item.sourceRowId === selectedId ? <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: palette.brandPrimary }}>Reviewing</Text> : null}
          </View>
        </Pressable>;
      }}
      ListEmptyComponent={<SupportingText>No Transactions in this filter.</SupportingText>}
      ListFooterComponent={<View style={{ paddingTop: 16, gap: 14 }}><PrimaryButton label="Continue" disabled={disabled} onPress={c.continue} /><QueueAction label="Refresh Categories and Rules" disabled={review.catalog.status === 'loading'} onPress={c.refresh} /><SupportingText>Review stays in memory. Closing the app loses it. Nothing is saved until confirmation.</SupportingText></View>} />
    <CenteredDialog title="Correct Transaction" visible={modal === 'edit' && !!editor} onDismiss={() => setModal(null)} restoreFocusRef={editFocus}>
      {editor ? <>
        <ExpenseFields draft={{ ...editor.values }} issues={{}} categoryLabel={category?.name ?? 'Choose Category'} onChange={c.patch} onOpenCategories={() => setModal('categories')} />
        {source ? <View style={{ gap: 4 }}><SupportingText>{`Original evidence · ${source.originalDate} · ${source.originalAmount}`}</SupportingText><BodyText>{source.description}</BodyText><SupportingText>{source.classification.eligible ? `Eligible ${source.classification.kind}` : `Excluded: ${source.classification.reason}`}</SupportingText></View> : null}
        {editorDirty(review, editor) ? <SecondaryButton label="Abandon pending edits" disabled={c.readOnly} onPress={() => { c.send({ type: 'editorAbandoned' }); setModal(null); }} /> : null}
        <PrimaryButton label="Done · keep pending edits" onPress={() => setModal(null)} />
      </> : null}
    </CenteredDialog>
    <ChoiceSheet title="Choose Category" visible={modal === 'categories'} onDismiss={() => setModal(null)} restoreFocusRef={editFocus}>
      {categories.map(item => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><CategoryIconMark iconKey={item.iconKey} colorKey={item.colorKey} /><View style={{ flex: 1 }}><SecondaryButton label={item.name} selected={editor?.values.categoryId === item.id} disabled={disabled} onPress={() => { c.patch({ categoryId: item.id }); setModal(null); }} /></View></View>)}
    </ChoiceSheet>
  </KeyboardAvoidingView>;
}
function QueueAction({ label, accessibilityLabel = label, onPress, disabled = false, brand = false, icon }: {
  label: string; accessibilityLabel?: string; onPress(): void; disabled?: boolean; brand?: boolean; icon?: ReactNode;
}) {
  const { palette, fonts } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, minWidth: 48, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: disabled ? 0.55 : 1 }}>
    {icon}
    <Text style={{ flexShrink: 1, fontSize: 12, fontFamily: brand ? fonts.medium : fonts.regular, color: brand ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
  </Pressable>;
}
function ErrorText({ message }: { message: string }) {
  const { palette, fonts } = useAppTheme();
  return <Text accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontSize: 14, fontFamily: fonts.regular }}>{message}</Text>;
}
function warningMessage(code: string) {
  const messages: Record<string, string> = {
    'partial-extraction': 'Some pages or activity could not be read. Extracted Transactions may be incomplete.',
    'uncertain-completeness': 'Extraction cannot establish that all statement activity is present.',
    'unresolved-classification': 'Some Transactions have uncertain direction or dates and remain excluded.',
    'reconciliation-mismatch': 'Extracted activity does not match the original statement controls.',
    'missing-control': 'Some original statement controls are missing or unreadable.',
  };
  return messages[code] ?? code;
}
