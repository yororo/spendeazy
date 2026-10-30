import * as SecureStore from 'expo-secure-store';

import {
  parseAppearancePreference,
  type AppearancePreference,
} from '@/navigation/appearance';
import { rememberedSpaceStorageKey } from '@/application/spaces/active-space';

const APPEARANCE_KEY = 'appearance';
let selectionWrites: Promise<unknown> = Promise.resolve();
let selectionGeneration = 0;
const selectionOwners = new Set<string>();

export async function clearRememberedSpaces(userId: string | null) {
  selectionGeneration++;
  if (userId) selectionOwners.add(userId);
  await selectionWrites;
  for (const owner of selectionOwners) {
    await SecureStore.deleteItemAsync(rememberedSpaceStorageKey(owner));
    selectionOwners.delete(owner);
  }
}

export async function readAppearancePreference(): Promise<AppearancePreference> {
  try {
    return parseAppearancePreference(await SecureStore.getItemAsync(APPEARANCE_KEY));
  } catch {
    return 'system';
  }
}

export async function writeAppearancePreference(
  preference: AppearancePreference,
): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(APPEARANCE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

export async function readRememberedSpaceId(userId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(rememberedSpaceStorageKey(userId));
  } catch {
    return null;
  }
}

export async function writeRememberedSpaceId(
  userId: string,
  spaceId: string,
): Promise<boolean> {
  const generation = selectionGeneration;
  selectionOwners.add(userId);
  try {
    const write = selectionWrites.catch(() => {}).then(async () => {
      if (generation === selectionGeneration) await SecureStore.setItemAsync(rememberedSpaceStorageKey(userId), spaceId);
    });
    selectionWrites = write;
    await write;
    return true;
  } catch {
    return false;
  }
}
