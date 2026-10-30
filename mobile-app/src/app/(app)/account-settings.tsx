import { useRouter } from 'expo-router';
import { AccountSettingsView } from '@/features/account-deletion/account-settings-view';
import { accountDeletion, useDeletionSnapshot } from '@/features/account-deletion/deletion-runtime';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const state = useDeletionSnapshot();
  return <AccountSettingsView onBack={() => router.back()} onRequest={() => { void accountDeletion.submit(); }} error={state.error} />;
}
