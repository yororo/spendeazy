import { ObsoleteRequestError } from '../../api/request-failure.ts';
import type { ProfileNames } from './profile-workflow.ts';

type ProviderUser = {
  update: (names: ProfileNames) => Promise<unknown>;
  setProfileImage: (params: { file: string }) => Promise<unknown>;
  reload: () => Promise<unknown>;
};

export function createClerkProfileAdapter(
  user: ProviderUser,
  current: () => boolean,
) {
  function assertCurrent() {
    if (!current()) throw new ObsoleteRequestError();
  }
  return {
    async updateName(names: ProfileNames) {
      assertCurrent();
      await user.update(names);
      assertCurrent();
    },
    async updatePhoto(photo: string) {
      assertCurrent();
      await user.setProfileImage({ file: photo });
      assertCurrent();
    },
    async reload() {
      assertCurrent();
      await user.reload();
      assertCurrent();
    },
  };
}
