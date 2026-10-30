import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { selectProfileImage } from './profile-image';

const pendingCopies = new Set<string>();
let pendingPicker: Promise<string | null> | null = null;

export async function cleanupProfileImages(): Promise<void> {
  await pendingPicker?.catch(() => {});
  removeCopies();
  // Dedicated SDK cache; sweep remnants left by process termination too.
  const directory = new Directory(Paths.cache, 'ImagePicker');
  if (directory.exists) directory.delete();
  // The installed iOS picker can also generate UUID-named images at cache root.
  // Match its generated names only; never traverse a library/content location.
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.(?:jpe?g|png|heic|avif|webp)$/iu.test(entry.name)) entry.delete();
  }
}

function removeCopies() {
  for (const uri of pendingCopies) {
    const file = new File(uri);
    if (file.exists) file.delete();
    pendingCopies.delete(uri);
  }
}

export async function chooseNativeProfileImage(
  current: () => boolean,
): Promise<string | null> {
  await cleanupProfileImages();
  if (!current()) return null;
  const operation = selectProfileImage(
    () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: false,
        base64: true,
        quality: 0.8,
      }),
    async (uri) => {
      // Never remove an original library/content URI. Only app cache copies are owned here.
      if (uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`)) {
        pendingCopies.add(uri);
        removeCopies();
      }
    },
    current,
  );
  pendingPicker = operation;
  try { return await operation; }
  finally { if (pendingPicker === operation) pendingPicker = null; }
}
