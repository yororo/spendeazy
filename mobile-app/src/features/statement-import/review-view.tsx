import { useRef, useState, type ElementRef } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { CategoryIconMark } from '@/components/category-mark';
import { CenteredDialog, ChoiceSheet } from '@/components/choice-sheet';
import { CanvasBackground, DesignSurface } from '@/components/design-surface';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ExpenseFields } from '@/features/expenses/expense-fields';
import { useAppTheme } from '@/navigation/app-theme';
import type { useStatementImportReview } from './use-statement-import-review';
import { validAssignment } from './review-rules';

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
  const boundary = c.phase === 'review-ready';
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.canvas }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
    <CanvasBackground />
    <FlatList ref={list} data={boundary ? [] : c.rows} extraData={review} keyExtractor={row => row.sourceRowId}
      keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 14 }}
      ListHeaderComponent={<StackGap>
        <ScreenHeader title="Import statement" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><SecondaryButton label={boundary ? 'Back to review' : 'Back · keep work'} onPress={boundary ? c.backToReview : onBack} /></View>
          <SecondaryButton label="Close" onPress={close} />
        </View>
        <View accessibilityLabel="Step 2 of 3, Update" style={{ flexDirection: 'row', gap: 8 }}>
          {['1 Select', '2 Update', '3 Confirm'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
            <View style={{ height: 3, backgroundColor: index === 1 ? palette.brandPrimary : palette.divider }} />
            <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: index === 1 ? palette.brandPrimary : palette.textSecondary }}>{label}</Text>
          </View>)}
        </View>
        <DesignSurface style={{ padding: 14, gap: 6 }}>
          <BodyText>{`${review.original.account.provider.toUpperCase()} · ${review.original.account.format}`}</BodyText>
          <SupportingText>{review.original.file.name}</SupportingText>
          <SupportingText>{`Destination: ${destination}`}</SupportingText>
        </DesignSurface>
        {review.original.warnings.map(warning => <Text key={warning.code} style={{ color: palette.stateWarning, fontSize: 14, fontFamily: fonts.regular }}>{warningMessage(warning.code)}</Text>)}
        {c.readOnly ? <SupportingText>This destination is read-only. Review remains available for inspection.</SupportingText> : null}
        {boundary ? <DesignSurface style={{ padding: 22, gap: 14 }}>
          <BodyText>Review ready</BodyText>
          <SupportingText>Your local review is validated. Confirmation is not available yet. Nothing has been saved.</SupportingText>
          <SupportingText>{`${review.handoff?.rows.filter(row => row.inclusion === 'included').length ?? 0} included Transactions · ${review.stagedRules.length} staged Rules`}</SupportingText>
          <PrimaryButton label="Back to review" onPress={c.backToReview} />
        </DesignSurface> : <>
          {review.catalog.status !== 'ready' ? <SupportingText>{review.catalog.status === 'failed' ? 'Categories and Rules could not be loaded. Your review is retained. Retry to assign or continue.' : 'Loading Categories and Rules…'}</SupportingText> : null}
          <SecondaryButton label={review.catalog.status === 'failed' ? 'Retry Categories and Rules' : 'Refresh Categories and Rules'} busy={review.catalog.status === 'loading'} onPress={c.refresh} />
          {review.catalog.status === 'ready' && categories.length === 0 ? <SupportingText>No active Categories. Activate a Category in this Space before assigning spending.</SupportingText> : null}
          <View style={{ paddingBottom: 14 }}>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 60, borderRadius: 26, backgroundColor: palette.surfaceModal, borderWidth: 1, borderColor: palette.fieldBorder }} />
            <DesignSurface style={{ padding: 22, gap: 14 }}>
              <BodyText>{review.inspectedSourceRowId ? 'Transaction review' : `Expense queue · ${c.counts.unmapped} Unmapped`}</BodyText>
              {source && selectedRow ? <>
                <SupportingText>{`Original evidence · ${source.originalDate} · ${source.originalAmount}`}</SupportingText>
                <BodyText>{source.description}</BodyText>
                <SupportingText>{source.classification.eligible ? `Eligible ${source.classification.kind}` : `Excluded: ${source.classification.reason}`}</SupportingText>
                {editor ? <>
                  <Text style={{ fontSize: 28, color: palette.textPrimary, fontFamily: fonts.semibold }}>{`PHP ${editor.values.amount || '—'}`}</Text>
                  <BodyText>{editor.values.description}</BodyText>
                  <SupportingText>{editor.values.expenseDate}</SupportingText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {category ? <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} /> : null}
                    <View style={{ flex: 1 }}><SecondaryButton label={category?.name ?? 'Choose Category'} disabled={disabled} onPress={() => setModal('categories')} /></View>
                  </View>
                  <View ref={editFocus}><SecondaryButton label="Correct amount, description or date" disabled={disabled} onPress={() => setModal('edit')} /></View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: fonts.medium, color: palette.textPrimary }}>Remember as a Category Rule</Text>
                    <Switch accessibilityLabel="Remember as a Category Rule" disabled={disabled} value={editor.remember} onValueChange={rememberValue => remember({ remember: rememberValue, pattern: editor.values.description, matchType: 'exact' })} />
                  </View>
                  {editor.remember ? <>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['exact', 'contains'] as const).map(mode => <View key={mode} style={{ flex: 1 }}><SecondaryButton label={mode === 'exact' ? 'Exactly' : 'Contains'} selected={editor.matchType === mode} disabled={disabled} onPress={() => remember({ matchType: mode })} /></View>)}
                    </View>
                    <TextField label="Rule pattern" value={editor.pattern} editable={!disabled} onChangeText={pattern => remember({ pattern })} />
                    <SupportingText>Staged only in this draft. No Rule is saved yet.</SupportingText>
                  </> : null}
                  {(review.errors ?? []).map(message => <ErrorText key={message} message={message} />)}
                  <PrimaryButton label="Save & next" disabled={disabled} onPress={c.save} />
                  <SecondaryButton label="Skip · abandon unapplied edits" disabled={c.readOnly} onPress={() => c.send({ type: 'skipped' })} />
                  <SecondaryButton label="Abandon pending edits" disabled={c.readOnly} onPress={() => c.send({ type: 'editorAbandoned' })} />
                  <SecondaryButton label="Exclude Transaction" disabled={c.readOnly} onPress={() => c.send({ type: 'excluded', sourceRowId: editor.sourceRowId })} />
                </> : selectedRow.inclusion === 'user-excluded' ? <SecondaryButton label="Restore Transaction" disabled={c.readOnly} onPress={() => c.send({ type: 'restored', sourceRowId: selectedRow.sourceRowId })} /> : <SupportingText>This activity remains excluded. Its original classification cannot be overridden here.</SupportingText>}
              </> : c.counts.unmapped ? <>
                <SupportingText>{`${c.counts.unmapped} skipped Transactions still need Categories.`}</SupportingText>
                <PrimaryButton label="Review skipped" onPress={() => c.send({ type: 'skippedReviewed' })} />
              </> : <SupportingText>{review.original.rows.some(row => row.classification.eligible) ? 'Queue complete. Review the ledger, then Continue.' : 'No eligible spending was extracted. The original activity remains in the ledger.'}</SupportingText>}
              {review.inspectedSourceRowId ? <SecondaryButton label="Return to queue" onPress={() => c.send({ type: 'queueReturned' })} /> : null}
            </DesignSurface>
          </View>
          {(review.validationIssues ?? []).map((issue, index) => <View key={index} style={{ gap: 6 }}>
            <ErrorText message={issue.message} />
            {issue.sourceRowId ? <SecondaryButton label={`Review Transaction ${review.original.rows.findIndex(row => row.sourceRowId === issue.sourceRowId) + 1}`} onPress={() => open(issue.sourceRowId!)} /> : null}
          </View>)}
          <BodyText>All Transactions</BodyText>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['all', 'unmapped', 'excluded'] as const).map(filter => <View key={filter} style={{ flex: 1 }}><SecondaryButton label={`${filter === 'all' ? 'All' : filter === 'unmapped' ? 'Unmapped' : 'Excluded'} (${c.counts[filter]})`} selected={review.ledgerFilter === filter} onPress={() => c.send({ type: 'filterChanged', filter })} /></View>)}
          </View>
        </>}
      </StackGap>}
      renderItem={({ item }) => {
        const original = review.original.rows.find(row => row.sourceRowId === item.sourceRowId)!;
        const mapped = review.catalog.snapshot?.categories.find(category => category.id === item.values.categoryId);
        return <Pressable accessibilityRole="button" accessibilityLabel={`${item.values.description || original.description}, ${item.inclusion !== 'included' ? 'Excluded' : validAssignment(review, item) ? mapped?.name : 'Unmapped'}. Open review.`}
          onPress={() => open(item.sourceRowId)} style={{ minHeight: 64, paddingVertical: 12, borderBottomWidth: 1, borderColor: palette.divider, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {mapped ? <CategoryIconMark iconKey={mapped.iconKey} colorKey={mapped.colorKey} size={18} /> : null}
          <View style={{ flex: 1, gap: 5 }}><BodyText>{item.values.description || original.description}</BodyText><SupportingText>{`${item.values.expenseDate || original.originalDate} · ${item.inclusion !== 'included' ? 'Excluded' : validAssignment(review, item) ? mapped?.name : 'Unmapped'}`}</SupportingText></View>
          <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: palette.textPrimary, flexShrink: 1 }}>{`PHP ${item.values.amount || original.originalAmount}`}</Text>
        </Pressable>;
      }}
      ListEmptyComponent={boundary ? undefined : <SupportingText>No Transactions in this filter.</SupportingText>}
      ListFooterComponent={boundary ? undefined : <View style={{ paddingTop: 16, gap: 14 }}><PrimaryButton label="Continue" disabled={disabled} onPress={c.continue} /><SupportingText>Review stays in memory. Closing the app loses it. Nothing is saved until confirmation.</SupportingText></View>} />
    <CenteredDialog title="Correct Transaction" visible={modal === 'edit' && !!editor} onDismiss={() => setModal(null)} restoreFocusRef={editFocus}>
      {editor ? <><ExpenseFields draft={{ ...editor.values }} issues={{}} categoryLabel={category?.name ?? 'Choose Category'} onChange={c.patch} onOpenCategories={() => setModal('categories')} /><PrimaryButton label="Done · keep pending edits" onPress={() => setModal(null)} /></> : null}
    </CenteredDialog>
    <ChoiceSheet title="Choose Category" visible={modal === 'categories'} onDismiss={() => setModal(null)} restoreFocusRef={editFocus}>
      {categories.map(item => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><CategoryIconMark iconKey={item.iconKey} colorKey={item.colorKey} /><View style={{ flex: 1 }}><SecondaryButton label={item.name} selected={editor?.values.categoryId === item.id} disabled={disabled} onPress={() => { c.patch({ categoryId: item.id }); setModal(null); }} /></View></View>)}
    </ChoiceSheet>
  </KeyboardAvoidingView>;
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
