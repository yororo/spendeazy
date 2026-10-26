import { useEffect, useMemo, useReducer, useState } from 'react';
import { createCategoriesApiClient, type CategoryConfiguration, type CategoryConfigurationDraft, type CategoryRule, type CategoryRuleCollection } from '@/api/categories-api-client';
import { ApiError, requestFailureMessage } from '@/api/request-failure';
import { useAuthorizedClient } from '@/application/authorized-client';
import { useSpaces } from '@/application/spaces/provider';
import {
  defaultCategoryConfigurationDraft,
  makeCategoryConfigurationSave,
  prepareCategoryConfiguration,
  type CategoryConfigurationField,
} from './category-configuration-draft';

type LoadPhase = 'loading' | 'ready' | 'error';
type ConflictKind = 'category' | 'space-rules';
type StoredState = {
  key: string;
  phase: LoadPhase;
  draft: CategoryConfigurationDraft | null;
  expectedRevision: string | null;
  expectedRulesRevision: string | null;
  saving: boolean;
  conflict: ConflictKind | null;
  latestConfiguration: CategoryConfiguration | null;
  latestRules: CategoryRuleCollection | null;
  checkingLatest: boolean;
  error: string | null;
  issues: Partial<Record<CategoryConfigurationField, string>>;
};

const blankState = (key: string): StoredState => ({
  key,
  phase: 'loading',
  draft: null,
  expectedRevision: null,
  expectedRulesRevision: null,
  saving: false,
  conflict: null,
  latestConfiguration: null,
  latestRules: null,
  checkingLatest: false,
  error: null,
  issues: {},
});

type CategoryConfigurationAction =
  | { type: 'reset'; key: string }
  | { type: 'load-succeeded'; key: string; draft: CategoryConfigurationDraft; expectedRevision: string | null; expectedRulesRevision: string }
  | { type: 'load-failed'; key: string; error: string }
  | { type: 'draft-changed'; key: string; patch: Partial<CategoryConfigurationDraft> }
  | { type: 'validation-failed'; key: string; issues: Partial<Record<CategoryConfigurationField, string>> }
  | { type: 'save-started'; key: string }
  | { type: 'save-succeeded'; key: string; configuration: CategoryConfiguration }
  | { type: 'save-failed'; key: string; error: string }
  | { type: 'conflict-started'; key: string; conflict: ConflictKind; error: string }
  | { type: 'latest-category-loaded'; key: string; configuration: CategoryConfiguration }
  | { type: 'latest-rules-loaded'; key: string; rules: CategoryRuleCollection }
  | { type: 'latest-load-failed'; key: string; error: string }
  | { type: 'latest-refresh-started'; key: string }
  | { type: 'continue-with-draft'; key: string }
  | { type: 'use-latest-configuration'; key: string };

function categoryConfigurationReducer(
  state: StoredState,
  action: CategoryConfigurationAction,
): StoredState {
  if (action.type === 'reset') return blankState(action.key);
  if (state.key !== action.key) return state;

  switch (action.type) {
    case 'load-succeeded':
      return {
        ...blankState(action.key),
        phase: 'ready',
        draft: action.draft,
        expectedRevision: action.expectedRevision,
        expectedRulesRevision: action.expectedRulesRevision,
      };
    case 'load-failed':
      return { ...blankState(action.key), phase: 'error', error: action.error };
    case 'draft-changed':
      if (state.phase !== 'ready' || state.saving || state.conflict !== null || !state.draft) return state;
      return { ...state, draft: { ...state.draft, ...action.patch }, error: null, issues: {} };
    case 'validation-failed':
      return { ...state, issues: action.issues };
    case 'save-started':
      return { ...state, saving: true, error: null, issues: {} };
    case 'save-succeeded':
      return {
        ...state,
        draft: draftFromConfiguration(action.configuration),
        expectedRevision: action.configuration.category.revision,
        expectedRulesRevision: action.configuration.rulesRevision,
        saving: false,
        error: null,
      };
    case 'save-failed':
      return { ...state, saving: false, error: action.error };
    case 'conflict-started':
      return {
        ...state,
        saving: false,
        conflict: action.conflict,
        latestConfiguration: null,
        latestRules: null,
        checkingLatest: true,
        error: action.error,
      };
    case 'latest-category-loaded':
      return { ...state, latestConfiguration: action.configuration, latestRules: null, checkingLatest: false };
    case 'latest-rules-loaded':
      return { ...state, latestConfiguration: null, latestRules: action.rules, checkingLatest: false };
    case 'latest-load-failed':
      return { ...state, latestConfiguration: null, latestRules: null, checkingLatest: false, error: action.error };
    case 'latest-refresh-started':
      return { ...state, checkingLatest: true, error: null };
    case 'continue-with-draft': {
      if (state.conflict === 'category' && state.latestConfiguration) {
        return {
          ...state,
          expectedRevision: state.latestConfiguration.category.revision,
          expectedRulesRevision: state.latestConfiguration.rulesRevision,
          conflict: null,
          latestConfiguration: null,
          checkingLatest: false,
          error: null,
        };
      }
      if (state.conflict === 'space-rules' && state.latestRules) {
        return {
          ...state,
          expectedRulesRevision: state.latestRules.revision,
          conflict: null,
          latestRules: null,
          checkingLatest: false,
          error: null,
        };
      }
      return state;
    }
    case 'use-latest-configuration':
      if (state.conflict !== 'category' || !state.latestConfiguration) return state;
      return {
        ...state,
        draft: draftFromConfiguration(state.latestConfiguration),
        expectedRevision: state.latestConfiguration.category.revision,
        expectedRulesRevision: state.latestConfiguration.rulesRevision,
        conflict: null,
        latestConfiguration: null,
        checkingLatest: false,
        error: null,
        issues: {},
      };
  }
}

export function useCategoryConfiguration(spaceId: string | null, categoryId: string | null) {
  const authorized = useAuthorizedClient();
  const { active } = useSpaces();
  const key = useMemo(
    () => `${authorized.scope.generation}:${authorized.scope.userId ?? ''}:${spaceId ?? ''}:${categoryId ?? 'new'}`,
    [authorized.scope.generation, authorized.scope.userId, categoryId, spaceId],
  );
  const [stored, dispatch] = useReducer(categoryConfigurationReducer, key, blankState);
  const state = stored.key === key ? stored : blankState(key);
  const [retryId, setRetryId] = useState(0);
  const availability: 'missing-space' | 'space-changed' | 'read-only' | 'archived' | 'editable' = !spaceId
    ? 'missing-space'
    : active?.id !== spaceId || authorized.scope.spaceId !== spaceId
      ? 'space-changed'
      : active.status === 'archived'
        ? 'archived'
        : active.accessLevel === 'write'
          ? 'editable'
          : 'read-only';
  const canSave = availability === 'editable' && state.phase === 'ready' &&
    state.draft !== null && state.expectedRulesRevision !== null && !state.saving &&
    state.conflict === null &&
    authorized.isCurrent();

  useEffect(() => {
    let current = true;
    const isCurrent = () => current && authorized.isCurrent();
    dispatch({ type: 'reset', key });
    if (!spaceId) return () => { current = false; };
    const client = createCategoriesApiClient(authorized);
    void (async () => {
      try {
        if (categoryId) {
          const configuration = await client.getCategoryConfiguration(spaceId, categoryId);
          if (!isCurrent()) return;
          dispatch({
            type: 'load-succeeded',
            key,
            draft: draftFromConfiguration(configuration),
            expectedRevision: configuration.category.revision,
            expectedRulesRevision: configuration.rulesRevision,
          });
        } else {
          const expectedRulesRevision = await client.getRulesRevision(spaceId);
          if (!isCurrent()) return;
          dispatch({
            type: 'load-succeeded',
            key,
            draft: defaultCategoryConfigurationDraft(),
            expectedRevision: null,
            expectedRulesRevision,
          });
        }
      } catch (cause) {
        if (!isCurrent()) return;
        dispatch({ type: 'load-failed', key, error: requestFailureMessage(cause) });
      }
    })();
    return () => { current = false; };
  }, [authorized, categoryId, key, retryId, spaceId]);

  function update(patch: Partial<CategoryConfigurationDraft>) {
    if (state.phase !== 'ready' || state.saving || state.conflict !== null || !state.draft) return;
    dispatch({ type: 'draft-changed', key, patch });
  }

  function addRule(pattern: string, matchType: CategoryRule['matchType']) {
    if (!state.draft) return;
    update({ rules: [...state.draft.rules, { pattern, matchType }] });
  }

  function removeRule(index: number) {
    if (!state.draft) return;
    update({ rules: state.draft.rules.filter((_, itemIndex) => itemIndex !== index) });
  }

  async function save(): Promise<boolean> {
    if (!canSave || !spaceId || !state.draft || state.expectedRulesRevision === null) return false;
    const prepared = prepareCategoryConfiguration(state.draft);
    if (!prepared.ok) {
      const issues = Object.fromEntries(prepared.issues.map(({ field, message }) => [field, message]));
      dispatch({ type: 'validation-failed', key, issues });
      return false;
    }
    dispatch({ type: 'save-started', key });
    const client = createCategoriesApiClient(authorized);
    try {
      const input = makeCategoryConfigurationSave(
        prepared.draft,
        state.expectedRevision,
        state.expectedRulesRevision,
      );
      const result = categoryId
        ? await client.saveCategoryConfiguration(spaceId, categoryId, input)
        : await client.createCategoryConfiguration(spaceId, input);
      if (!authorized.isCurrent() || active?.id !== spaceId) return false;
      dispatch({ type: 'save-succeeded', key, configuration: result });
      return true;
    } catch (cause) {
      if (!authorized.isCurrent() || active?.id !== spaceId) return false;
      if (cause instanceof ApiError && cause.code === 'STALE_EDIT') {
        const conflictKind: ConflictKind = categoryId ? 'category' : 'space-rules';
        dispatch({
          type: 'conflict-started',
          key,
          conflict: conflictKind,
          error: requestFailureMessage(cause),
        });
        try {
          if (categoryId) {
            const latestConfiguration = await client.getCategoryConfiguration(spaceId, categoryId);
            if (!authorized.isCurrent() || active?.id !== spaceId) return false;
            dispatch({ type: 'latest-category-loaded', key, configuration: latestConfiguration });
          } else {
            const latestRules = await client.getCategoryRules(spaceId);
            if (!authorized.isCurrent() || active?.id !== spaceId) return false;
            dispatch({ type: 'latest-rules-loaded', key, rules: latestRules });
          }
        } catch (latestCause) {
          if (!authorized.isCurrent() || active?.id !== spaceId) return false;
          dispatch({
            type: 'latest-load-failed',
            key,
            error: `${requestFailureMessage(cause)} ${requestFailureMessage(latestCause)}`,
          });
        }
        return false;
      }
      dispatch({ type: 'save-failed', key, error: requestFailureMessage(cause) });
      return false;
    }
  }

  async function refreshLatest(): Promise<boolean> {
    if (!spaceId || state.conflict === null || state.checkingLatest) return false;
    dispatch({ type: 'latest-refresh-started', key });
    try {
      const client = createCategoriesApiClient(authorized);
      if (state.conflict === 'category') {
        if (!categoryId) return false;
        const latestConfiguration = await client.getCategoryConfiguration(spaceId, categoryId);
        if (!authorized.isCurrent() || active?.id !== spaceId) return false;
        dispatch({ type: 'latest-category-loaded', key, configuration: latestConfiguration });
      } else {
        const latestRules = await client.getCategoryRules(spaceId);
        if (!authorized.isCurrent() || active?.id !== spaceId) return false;
        dispatch({ type: 'latest-rules-loaded', key, rules: latestRules });
      }
      return true;
    } catch (cause) {
      if (!authorized.isCurrent() || active?.id !== spaceId) return false;
      dispatch({ type: 'latest-load-failed', key, error: requestFailureMessage(cause) });
      return false;
    }
  }

  function continueWithDraft() {
    dispatch({ type: 'continue-with-draft', key });
  }

  function useLatestConfiguration() {
    dispatch({ type: 'use-latest-configuration', key });
  }

  return {
    state: {
      availability,
      isNew: categoryId === null,
      phase: state.phase,
      draft: state.draft,
      saving: state.saving,
      canSave,
      conflict: state.conflict,
      latestConfiguration: state.latestConfiguration,
      latestRules: state.latestRules,
      checkingLatest: state.checkingLatest,
      error: state.error,
      issues: state.issues,
    },
    update,
    addRule,
    removeRule,
    save,
    continueWithDraft,
    useLatestConfiguration,
    retry: () => {
      if (state.conflict !== null) {
        void refreshLatest();
        return;
      }
      dispatch({ type: 'reset', key });
      setRetryId((value) => value + 1);
    },
  };
}

function draftFromConfiguration(configuration: CategoryConfiguration): CategoryConfigurationDraft {
  return {
    name: configuration.category.name,
    iconKey: configuration.category.iconKey,
    colorKey: configuration.category.colorKey,
    isActive: configuration.category.isActive,
    budget: configuration.budget ? { ...configuration.budget } : null,
    rules: configuration.rules.map((rule) => ({ ...rule })),
  };
}
