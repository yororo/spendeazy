import { Asset } from "expo-asset";
import { File } from "expo-file-system";

import encryptedFixture from "../../web/e2e/fixtures/spending-journey-encrypted.pdf";
import plainFixture from "../../web/e2e/fixtures/spending-journey.pdf";

export interface BundledFixture {
  readonly fileName: string;
  readonly moduleId: number;
  readonly password: string | null;
}

export const bundledFixtures: readonly BundledFixture[] = [
  {
    fileName: "spending-journey.pdf",
    moduleId: plainFixture,
    password: null,
  },
  {
    fileName: "spending-journey-encrypted.pdf",
    moduleId: encryptedFixture,
    password: "fictional-journey-only",
  },
];

export async function readBundledFixture(
  fixture: BundledFixture,
): Promise<Uint8Array> {
  const asset = Asset.fromModule(fixture.moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const file = new File(uri);
  return file.bytes();
}
