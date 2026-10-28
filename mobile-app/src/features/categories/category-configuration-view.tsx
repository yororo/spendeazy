import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
  const [rulePattern, setRulePattern] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<CategoryRule['matchType']>('exact');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmUseLatest, setConfirmUseLatest] = useState(false);
  const draft = state.draft;
  const editable = state.availability === 'editable' && !state.saving && state.phase === 'ready' && state.conflict === null;

  const sectionLabel = (label: string) => (
    <Text style={{ color: palette.textSecondary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>
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
      <StackGap>
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
        <TextField
          label="Category name"
          value={draft.name}
          onChangeText={(name) => onChange({ name })}
          error={state.issues.name}
          placeholder="e.g. Dining Out"
          autoCapitalize="words"
          editable={editable}
        />

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
                    width: 44,
                    height: 44,
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
                    width: 34,
                    height: 34,
                    borderRadius: 17,
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

        <View style={{ gap: space.fieldLabelGap }}>
          {sectionLabel('Status')}
          <SupportingText>{draft.isActive ? 'Active Categories are available for Expenses and Rule matching.' : 'Inactive Categories keep their history and configuration.'}</SupportingText>
          <SecondaryButton
            label={draft.isActive ? 'Deactivate Category' : 'Reactivate Category'}
            disabled={!editable}
            selected={!draft.isActive}
            onPress={() => {
              if (draft.isActive) setConfirmDeactivate(true);
              else onChange({ isActive: true });
            }}
          />
        </View>

        <View style={{ gap: space.fieldLabelGap }}>
          {sectionLabel('Budget')}
          {draft.budget ? (
            <>
              <TextField
                label="Monthly or yearly amount (PHP)"
                value={draft.budget.amount}
                onChangeText={(amount) => onChange({ budget: { ...draft.budget!, amount } })}
                error={state.issues.budget}
                placeholder="0.00"
                keyboardType="decimal-pad"
                editable={editable}
              />
              <View style={{ flexDirection: 'row', gap: space.cardGap }}>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    label="Monthly"
                    selected={draft.budget.recurrence === 'monthly'}
                    disabled={!editable}
                    onPress={() => onChange({ budget: { ...draft.budget!, recurrence: 'monthly' } })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    label="Yearly"
                    selected={draft.budget.recurrence === 'yearly'}
                    disabled={!editable}
                    onPress={() => onChange({ budget: { ...draft.budget!, recurrence: 'yearly' } })}
                  />
                </View>
              </View>
              <SecondaryButton label="Remove Budget" disabled={!editable} onPress={() => onChange({ budget: null })} />
            </>
          ) : (
            <>
              <SupportingText>No Budget is set.</SupportingText>
              <SecondaryButton
                label="Add Budget"
                disabled={!editable}
                onPress={() => onChange({ budget: { amount: '', currency: 'PHP', recurrence: 'monthly' } })}
              />
            </>
          )}
        </View>

        <View style={{ gap: space.fieldLabelGap }}>
          {sectionLabel('Category Rules')}
          <SupportingText>Exact matches the full description. Contains matches text anywhere in it.</SupportingText>
          {draft.rules.map((rule, index) => (
            <View key={`${rule.id ?? 'new'}-${index}`} style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              borderWidth: 1, borderColor: palette.fieldBorder, borderRadius: radius.control,
              backgroundColor: palette.surfaceModal, padding: 12,
            }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: typeScale.body }}>{rule.pattern}</Text>
                <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.sectionTitle }}>{rule.matchType === 'exact' ? 'Exact' : 'Contains'}</Text>
              </View>
              <SecondaryButton label={`Remove Rule ${index + 1}`} onPress={() => onRemoveRule(index)} disabled={!editable} />
            </View>
          ))}
          {state.issues.rules ? issueText(state.issues.rules) : null}
          <TextField
            label="Rule text"
            value={rulePattern}
            onChangeText={setRulePattern}
            placeholder="e.g. Corner Bakery"
            editable={editable}
          />
          <View style={{ flexDirection: 'row', gap: space.cardGap }}>
            <View style={{ flex: 1 }}>
              <CompactAction variant="segmented" label="Exact" selected={ruleMatchType === 'exact'} disabled={!editable} onPress={() => setRuleMatchType('exact')} />
            </View>
            <View style={{ flex: 1 }}>
              <CompactAction variant="segmented" label="Contains" selected={ruleMatchType === 'contains'} disabled={!editable} onPress={() => setRuleMatchType('contains')} />
            </View>
          </View>
          <SecondaryButton
            label="Add Rule"
            disabled={!editable || rulePattern.trim().length === 0}
            onPress={() => {
              onAddRule(rulePattern.trim(), ruleMatchType);
              setRulePattern('');
            }}
          />
        </View>

        <PrimaryButton
          label={state.isNew ? 'Create Category' : 'Save Category'}
          onPress={onSave}
          disabled={!state.canSave}
          busy={state.saving}
        />
        <SecondaryButton label="Back" onPress={onBack} />
      </StackGap>

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
