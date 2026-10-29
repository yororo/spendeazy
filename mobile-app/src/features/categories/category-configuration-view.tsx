import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Bookmark, ChevronDown, Plus, Trash2 } from 'lucide-react-native';
import { CategoryIconMark } from '@/components/category-mark';
import { CompactAction, PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { CATEGORY_COLOR_KEYS, CATEGORY_ICON_KEYS, type CategoryColorKey, type CategoryConfiguration, type CategoryIconKey, type CategoryRule, type CategoryRuleCollection } from '@/api/categories-api-client';
import { radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { CATEGORY_COLOR_VALUES, CATEGORY_ICON_COMPONENTS } from './category-catalog';
import type { CategoryConfigurationField } from './category-configuration-draft';

export type CategoryConfigurationFormState = {
  availability: 'missing-space' | 'space-changed' | 'read-only' | 'archived' | 'editable';
  isNew: boolean;
  phase: 'loading' | 'ready' | 'error';
  draft: {
    name: string;
    iconKey: CategoryIconKey;
    colorKey: CategoryColorKey;
    isActive: boolean;
    budget: { amount: string; currency: 'PHP'; recurrence: 'monthly' | 'yearly' } | null;
    rules: CategoryRule[];
  } | null;
  saving: boolean;
  canSave: boolean;
  conflict: 'category' | 'space-rules' | null;
  latestConfiguration: CategoryConfiguration | null;
  latestRules: CategoryRuleCollection | null;
  checkingLatest: boolean;
  error: string | null;
  issues: Partial<Record<CategoryConfigurationField, string>>;
};

export function CategoryConfigurationView({
  state,
  onChange,
  onAddRule,
  onRemoveRule,
  onSave,
  onRetry,
  onContinueWithDraft,
  onUseLatestConfiguration,
  onBack,
}: {
  state: CategoryConfigurationFormState;
  onChange: (patch: Partial<NonNullable<CategoryConfigurationFormState['draft']>>) => void;
  onAddRule: (pattern: string, matchType: CategoryRule['matchType']) => void;
  onRemoveRule: (index: number) => void;
  onSave: () => void;
  onRetry: () => void;
  onContinueWithDraft: () => void;
  onUseLatestConfiguration: () => void;
  onBack: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [identityVisible, setIdentityVisible] = useState(false);
  const [matchTypeVisible, setMatchTypeVisible] = useState(false);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<CategoryRule['matchType']>('exact');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmUseLatest, setConfirmUseLatest] = useState(false);
  const draft = state.draft;
  const editable = state.availability === 'editable' && !state.saving && state.phase === 'ready' && state.conflict === null;

  const sectionLabel = (label: string) => (
    <Text style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1 }}>
      {label}
    </Text>
  );
  const issueText = (message: string) => (
    <Text accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.body }}>
      {message}
    </Text>
  );

  if (state.availability === 'missing-space') {
    return <Screen title="Category"><BodyText>Choose a Space before managing Categories.</BodyText></Screen>;
  }
  if (state.availability === 'space-changed') {
    return (
      <Screen title="Category">
        <StackGap>
          <BodyText>The active Space changed. Return to Budget and open this Category again to continue.</BodyText>
          <SecondaryButton label="Back" onPress={onBack} />
        </StackGap>
      </Screen>
    );
  }
  if ((state.availability === 'archived' || state.availability === 'read-only') && state.isNew) {
    const title = state.isNew ? 'New Category' : 'Category';
    return (
      <Screen title={title}>
        <StackGap>
          <BodyText>
            {state.availability === 'archived'
              ? 'This Shared Space is archived. Category configuration is read-only.'
              : 'This Space is read-only. Category configuration cannot be changed.'}
          </BodyText>
          <SecondaryButton label="Back" onPress={onBack} />
        </StackGap>
      </Screen>
    );
  }

  if (state.phase === 'error') {
    return (
      <Screen title={state.isNew ? 'New Category' : 'Edit Category'}>
        <StackGap>
          <BodyText>{state.error ?? 'Could not load Category configuration.'}</BodyText>
          <SecondaryButton label="Try again" onPress={onRetry} />
          <SecondaryButton label="Back" onPress={onBack} />
        </StackGap>
      </Screen>
    );
  }
  if (state.phase === 'loading' || !draft) {
    return <Screen title={state.isNew ? 'New Category' : 'Edit Category'}><BodyText>Loading Category configuration.</BodyText></Screen>;
  }

  return (
    <Screen title={state.isNew ? 'New Category' : 'Edit Category'}>
      <View style={{ flexGrow: 1, gap: space.cardGap }}>
        {state.availability === 'archived' ? <BodyText>This Shared Space is archived. Configuration is read-only.</BodyText> : null}
        {state.availability === 'read-only' ? <BodyText>This Space is read-only. Configuration cannot be changed.</BodyText> : null}
        {state.conflict !== null ? (
          <View style={{ gap: space.fieldLabelGap }}>
            <BodyText>
              {state.conflict === 'category'
                ? 'Your draft is safe. This Category changed elsewhere, so review the latest saved configuration before continuing.'
                : 'Your draft is safe. Space Category Rules changed elsewhere, so review the latest Rule set before continuing.'}
            </BodyText>
            {state.conflict === 'category' && state.latestConfiguration ? (
              <View style={{ gap: space.fieldLabelGap, borderWidth: 1, borderColor: palette.fieldBorder, borderRadius: radius.control, backgroundColor: palette.surfaceModal, padding: 12 }}>
                {sectionLabel('Latest saved configuration')}
                <SupportingText>{`${state.latestConfiguration.category.name} · ${state.latestConfiguration.category.isActive ? 'Active' : 'Inactive'}`}</SupportingText>
                <SupportingText>{`Icon: ${state.latestConfiguration.category.iconKey} · Color: ${state.latestConfiguration.category.colorKey}`}</SupportingText>
                <SupportingText>
                  {`Budget: ${state.latestConfiguration.budget
                    ? `${state.latestConfiguration.budget.amount} PHP · ${state.latestConfiguration.budget.recurrence}`
                    : 'none'}`}
                </SupportingText>
                <SupportingText>
                  {`Rules: ${state.latestConfiguration.rules.length
                    ? state.latestConfiguration.rules.map((rule) => `${rule.matchType}: ${rule.pattern}`).join(' · ')
                    : 'none'}`}
                </SupportingText>
                <SupportingText>Keeping your draft will use the latest revision checks. You can review it again before saving.</SupportingText>
                <PrimaryButton label="Continue with my draft" disabled={state.checkingLatest} onPress={onContinueWithDraft} />
                <SecondaryButton label="Use latest configuration" disabled={state.checkingLatest} onPress={() => setConfirmUseLatest(true)} />
              </View>
            ) : state.conflict === 'space-rules' && state.latestRules ? (
              <View style={{ gap: space.fieldLabelGap, borderWidth: 1, borderColor: palette.fieldBorder, borderRadius: radius.control, backgroundColor: palette.surfaceModal, padding: 12 }}>
                {sectionLabel('Latest Space Category Rules')}
                <SupportingText>{`Revision ${state.latestRules.revision}`}</SupportingText>
                {state.latestRules.rules.length ? state.latestRules.rules.map((rule, index) => (
                  <SupportingText key={`${rule.id ?? 'rule'}-${index}`}>
                    {`Category ${rule.categoryId ?? 'unknown'} · ${rule.matchType}: ${rule.pattern}`}
                  </SupportingText>
                )) : <SupportingText>No Category Rules are set.</SupportingText>}
                <SupportingText>Review the shared Rules. Continuing keeps your new Category draft and refreshes its Space Rule revision check.</SupportingText>
                <PrimaryButton label="Continue with my draft" disabled={state.checkingLatest} onPress={onContinueWithDraft} />
              </View>
            ) : (
              <>
                {state.error ? <BodyText>{state.error}</BodyText> : null}
                <SecondaryButton label={state.checkingLatest ? 'Loading latest configuration' : 'Reload latest configuration'} disabled={state.checkingLatest} onPress={onRetry} />
              </>
            )}
          </View>
        ) : state.error ? <BodyText>{state.error}</BodyText> : null}
        <View style={{ gap: 10 }}>
          {sectionLabel('CATEGORY')}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CompactAction variant="icon" label="Choose Category icon and color" disabled={!editable} onPress={() => setIdentityVisible(true)} icon={<CategoryIconMark iconKey={draft.iconKey} colorKey={draft.colorKey} />} />
            <View style={{ flex: 1 }}>
              <TextField label="Category name" showLabel={false} value={draft.name} onChangeText={(name) => onChange({ name })} error={state.issues.name} placeholder="e.g. Dining Out" autoCapitalize="words" editable={editable} />
            </View>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {sectionLabel('BUDGET')}
          {draft.budget ? <>
            <TextField label="Budget amount (PHP)" showLabel={false} variant="budget" suffix="PHP" value={draft.budget.amount} onChangeText={(amount) => onChange({ budget: { ...draft.budget!, amount } })} error={state.issues.budget} placeholder="0.00" keyboardType="decimal-pad" editable={editable} />
            <View style={{ flexDirection: 'row', gap: 4, padding: 5, borderRadius: radius.control, backgroundColor: palette.segmentedTrack }}>
              {(['monthly', 'yearly'] as const).map((recurrence) => <View key={recurrence} style={{ flex: 1 }}>
                <CompactAction variant="segmented" label={recurrence === 'monthly' ? 'Monthly' : 'Yearly'} selected={draft.budget?.recurrence === recurrence} disabled={!editable} onPress={() => onChange({ budget: { ...draft.budget!, recurrence } })} />
              </View>)}
            </View>
            <CompactAction variant="quiet" label="Remove Budget" disabled={!editable} onPress={() => onChange({ budget: null })} />
          </> : <>
            <SupportingText>No Budget is set.</SupportingText>
            <CompactAction label="Add Budget" disabled={!editable} onPress={() => onChange({ budget: { amount: '', currency: 'PHP', recurrence: 'monthly' } })} />
          </>}
        </View>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Bookmark size={16} color={palette.brandPrimary} accessible={false} />
            <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>Matching Rules</Text>
          </View>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>Exact matches the full description. Contains matches text anywhere in it.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
            <CompactAction label={ruleMatchType === 'exact' ? 'Exact' : 'Contains'} disabled={!editable} icon={<ChevronDown size={14} color={palette.textSecondary} />} onPress={() => setMatchTypeVisible(true)} />
            <View style={{ flex: 1, minWidth: 100 }}>
              <TextField label="Rule text" showLabel={false} value={rulePattern} onChangeText={setRulePattern} placeholder="Matching text…" editable={editable} />
            </View>
            <CompactAction variant="icon" label="Add Rule" icon={<Plus size={18} color={palette.brandPrimary} />} disabled={!editable || rulePattern.trim().length === 0} onPress={() => { onAddRule(rulePattern.trim(), ruleMatchType); setRulePattern(''); }} />
          </View>
          {state.issues.rules ? issueText(state.issues.rules) : null}
          {(['exact', 'contains'] as const).map((matchType) => <View key={matchType} style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1 }}>{matchType === 'exact' ? 'EXACT' : 'CONTAINS'}</Text>
            {draft.rules.some((rule) => rule.matchType === matchType) ? draft.rules.map((rule, index) => rule.matchType === matchType ? <View key={rule.id ?? 'new-' + index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: palette.fieldBorder, paddingLeft: 10 }}>
              <Text style={{ flex: 1, color: palette.textPrimary, fontFamily: fonts.regular, fontSize: 14 }}>{rule.pattern}</Text>
              <CompactAction variant="icon" label={'Remove Rule ' + (index + 1) + ': ' + rule.pattern} icon={<Trash2 size={16} color={palette.textSecondary} />} onPress={() => onRemoveRule(index)} disabled={!editable} />
            </View> : null) : <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>No entries yet</Text>}
          </View>)}
        </View>
        <View style={{ gap: space.fieldLabelGap }}>
          {sectionLabel('STATUS')}
          <SupportingText>{draft.isActive ? 'Active Categories are available for Expenses and Rule matching.' : 'Inactive Categories keep their history and configuration.'}</SupportingText>
          <CompactAction
            label={draft.isActive ? 'Deactivate Category' : 'Reactivate Category'}
            disabled={!editable}
            selected={!draft.isActive}
            onPress={() => {
              if (draft.isActive) setConfirmDeactivate(true);
              else onChange({ isActive: true });
            }}
          />
        </View>

        <ChoiceSheet title="Category icon and color" visible={identityVisible} onDismiss={() => setIdentityVisible(false)} showClose>
          <View style={{ gap: space.fieldLabelGap }}>
            {sectionLabel('Icon')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORY_ICON_KEYS.map((iconKey) => {
                const Icon = CATEGORY_ICON_COMPONENTS[iconKey];
                const selected = draft.iconKey === iconKey;
                return (
                  <Pressable
                    key={iconKey}
                    accessibilityRole="button"
                    accessibilityLabel={`Category icon ${iconKey}`}
                    accessibilityState={{ selected, disabled: !editable }}
                    disabled={!editable}
                    onPress={() => onChange({ iconKey })}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.control,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? palette.brandPrimary : palette.fieldBorder,
                      backgroundColor: palette.surfaceModal,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: editable ? 1 : 0.55,
                    }}>
                    <Icon size={20} color={palette.textPrimary} strokeWidth={1.8} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: space.fieldLabelGap }}>
            {sectionLabel('Color')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORY_COLOR_KEYS.map((colorKey) => {
                const selected = draft.colorKey === colorKey;
                return (
                  <Pressable
                    key={colorKey}
                    accessibilityRole="button"
                    accessibilityLabel={`Category color ${colorKey}`}
                    accessibilityState={{ selected, disabled: !editable }}
                    disabled={!editable}
                    onPress={() => onChange({ colorKey })}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? palette.textPrimary : palette.fieldBorder,
                      backgroundColor: CATEGORY_COLOR_VALUES[colorKey],
                      opacity: editable ? 1 : 0.55,
                    }}
                  />
                );
              })}
            </View>
          </View>

          <CompactAction label="Done" onPress={() => setIdentityVisible(false)} />
        </ChoiceSheet>
        <ChoiceSheet title="Rule match type" visible={matchTypeVisible} onDismiss={() => setMatchTypeVisible(false)} showClose>
          {(['exact', 'contains'] as const).map((matchType) => <CompactAction key={matchType} label={matchType === 'exact' ? 'Exact' : 'Contains'} selected={ruleMatchType === matchType} disabled={!editable} onPress={() => { setRuleMatchType(matchType); setMatchTypeVisible(false); }} />)}
        </ChoiceSheet>
        <View style={{ marginTop: 'auto', gap: 4, paddingTop: 10 }}>
          <PrimaryButton
            label={state.isNew ? 'Create Category' : 'Save Category'}
            onPress={onSave}
            disabled={!state.canSave}
            busy={state.saving}
          />
          <CompactAction variant="quiet" label="Back" onPress={onBack} />
        </View>
      </View>

      <ChoiceSheet title="Deactivate Category?" visible={confirmDeactivate} onDismiss={() => setConfirmDeactivate(false)}>
        <BodyText>Existing Expenses, Budget and Rules stay with this Category. It will no longer be available for new Expenses or Rule matching.</BodyText>
        <SecondaryButton label="Keep active" onPress={() => setConfirmDeactivate(false)} />
        <PrimaryButton label="Deactivate Category" onPress={() => {
          setConfirmDeactivate(false);
          onChange({ isActive: false });
        }} />
      </ChoiceSheet>
      <ChoiceSheet title="Use latest configuration?" visible={confirmUseLatest} onDismiss={() => setConfirmUseLatest(false)}>
        <BodyText>This replaces your unsaved draft with the latest saved Category, Budget and Rules.</BodyText>
        <SecondaryButton label="Keep my draft" onPress={() => setConfirmUseLatest(false)} />
        <PrimaryButton label="Replace with latest" onPress={() => {
          setConfirmUseLatest(false);
          onUseLatestConfiguration();
        }} />
      </ChoiceSheet>
    </Screen>
  );

}
