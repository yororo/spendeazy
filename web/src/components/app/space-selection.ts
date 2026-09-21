import type { AccessibleSpace } from "@/shared/api";

const SPACE_STORAGE_PREFIX = "spendeazy.active-space";

type SpaceStorageScope = "tab" | "device";

interface RememberedSpaceIds {
  readonly tab: string | null;
  readonly device: string | null;
}

function getSpaceStorageKey(
  scope: SpaceStorageScope,
  userId: string,
): string {
  return `${SPACE_STORAGE_PREFIX}.${scope}.${encodeURIComponent(userId)}`;
}

function readRememberedSpaceIds(userId: string | undefined): RememberedSpaceIds {
  if (!userId) return { tab: null, device: null };

  return {
    tab: readStorage("tab", userId),
    device: readStorage("device", userId),
  };
}

function persistSpaceSelection(userId: string | undefined, spaceId: string): void {
  if (!userId) return;

  writeStorage("tab", userId, spaceId);
  writeStorage("device", userId, spaceId);
}

function getActiveSpaces(
  spaces: readonly AccessibleSpace[],
): readonly AccessibleSpace[] {
  return spaces.filter((space) => space.status === "active");
}

function getPersonalSpace(
  spaces: readonly AccessibleSpace[],
): AccessibleSpace | undefined {
  return getActiveSpaces(spaces).find((space) => space.kind === "personal");
}

function resolveSpaceSelection(
  spaces: readonly AccessibleSpace[],
  requestedSpaceId: string | null,
  rememberedSpaceId: string | null,
): string | undefined {
  const activeSpaces = getActiveSpaces(spaces);
  const personalSpace = getPersonalSpace(activeSpaces);
  const candidateSpaceId = requestedSpaceId ?? rememberedSpaceId;
  const selectedSpace = candidateSpaceId
    ? activeSpaces.find((space) => space.id === candidateSpaceId)
    : undefined;

  return selectedSpace?.id ?? personalSpace?.id;
}

function getRequestedSpaceId(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.has("spaceId") ? (params.get("spaceId") ?? "") : null;
}

function buildCanonicalSpaceSearch(
  search: string,
  spaceId: string,
  personalSpaceId?: string,
): string {
  const params = new URLSearchParams(search);
  if (personalSpaceId !== undefined && spaceId === personalSpaceId) {
    params.delete("spaceId");
  } else {
    params.set("spaceId", spaceId);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function readStorage(
  scope: SpaceStorageScope,
  userId: string,
): string | null {
  const storage = getStorage(scope);
  if (!storage) return null;

  try {
    return storage.getItem(getSpaceStorageKey(scope, userId));
  } catch {
    return null;
  }
}

function writeStorage(
  scope: SpaceStorageScope,
  userId: string,
  spaceId: string,
): void {
  const storage = getStorage(scope);
  if (!storage) return;

  try {
    storage.setItem(getSpaceStorageKey(scope, userId), spaceId);
  } catch {
    // Storage can be unavailable or full; the URL remains the tab-local source.
  }
}

function getStorage(scope: SpaceStorageScope): Storage | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    return scope === "tab" ? window.sessionStorage : window.localStorage;
  } catch {
    return undefined;
  }
}

export {
  buildCanonicalSpaceSearch,
  getActiveSpaces,
  getPersonalSpace,
  getRequestedSpaceId,
  getSpaceStorageKey,
  persistSpaceSelection,
  readRememberedSpaceIds,
  resolveSpaceSelection,
};
export type { RememberedSpaceIds, SpaceStorageScope };
