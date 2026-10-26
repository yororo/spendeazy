import { useRouter } from 'expo-router';
import { useState } from 'react';

import { SharingView } from '@/features/sharing/sharing-view';
import { useSharing } from '@/features/sharing/use-sharing';

export default function SharingScreen() {
  const router = useRouter();
  const controller = useSharing();
  const [code, setCode] = useState('');
  return (
    <SharingView
      controller={controller}
      code={code}
      onCodeChange={setCode}
      onBack={() => router.back()}
      onOpenImportHistory={() => router.push('./statement-import-history')}
    />
  );
}
