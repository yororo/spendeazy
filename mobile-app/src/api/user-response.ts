export type UserProfile = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  deletionStatus: 'active';
  createdAt: string;
  updatedAt: string;
};

export function parseUserProfile(value: unknown): UserProfile {
  if (typeof value !== 'object' || value === null)
    throw new Error('Invalid User');
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    !/^[1-9]\d*$/.test(v.id) ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 200 ||
    typeof v.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+$/.test(v.email) ||
    v.deletionStatus !== 'active' ||
    (v.photoUrl !== null &&
      (typeof v.photoUrl !== 'string' || !/^https?:\/\//.test(v.photoUrl))) ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt)) ||
    typeof v.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(v.updatedAt))
  )
    throw new Error('Invalid User profile');
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    photoUrl: v.photoUrl as string | null,
    deletionStatus: 'active',
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}
