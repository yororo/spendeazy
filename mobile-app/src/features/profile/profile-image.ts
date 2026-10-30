type PickerAsset = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
};
type PickerResult = { canceled: boolean; assets: PickerAsset[] | null };

/** Retain upload bytes in memory only; release the picker-owned cache copy first. */
export async function selectProfileImage(
  launch: () => Promise<PickerResult>,
  release: (uri: string) => Promise<void>,
  current: () => boolean,
): Promise<string | null> {
  const result = await launch();
  try {
    if (result.canceled || !current()) return null;
    const asset = result.assets?.[0];
    if (!asset?.base64) throw new Error('Photo could not be read');
    // ImagePicker documents base64 as JPEG-encoded data, independent of source MIME.
    return `data:image/jpeg;base64,${asset.base64}`;
  } finally {
    for (const asset of result.assets ?? []) await release(asset.uri);
  }
}
