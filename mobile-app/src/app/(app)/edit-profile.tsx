import { useRouter } from 'expo-router';
import { ProfileEditorView } from '@/features/profile/profile-editor-view';
import { useProfileEditor } from '@/features/profile/use-profile-editor';

export default function EditProfileScreen() {
  const router = useRouter();
  const editor = useProfileEditor();
  return (
    <ProfileEditorView
      {...editor}
      onChange={editor.change}
      onChoosePhoto={() => {
        void editor.choosePhoto();
      }}
      onSave={() => {
        void editor.save();
      }}
      onBack={() => router.back()}
    />
  );
}
