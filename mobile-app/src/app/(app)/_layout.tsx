import { Stack } from 'expo-router/stack';

import { SpacesProvider } from '@/application/spaces/provider';
import { ImportRecoveryEntry } from '@/features/statement-import/recovery-entry';

export default function SignedInLayout() {
  return (
    <SpacesProvider>
      <ImportRecoveryEntry />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{
            presentation: 'transparentModal',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="import-statement" />
        <Stack.Screen name="add-expense" />
        <Stack.Screen name="category-editor" />
        <Stack.Screen name="sharing" />
        <Stack.Screen name="statement-import-history" />
        <Stack.Screen name="statement-import/[statementImportId]" />
        <Stack.Screen name="statement-import-expenses" />
        <Stack.Screen name="dashboard-expenses" />
      </Stack>
    </SpacesProvider>
  );
}
