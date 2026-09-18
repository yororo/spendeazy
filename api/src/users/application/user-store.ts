export const USER_STORE = Symbol('USER_STORE');
export const USER_NAME_MAX_LENGTH = 200;
export const USER_EMAIL_MAX_LENGTH = 320;

export interface UserRecord {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUser {
  clerkUserId: string;
  name: string;
  email: string;
}

export interface UpdateUser {
  name?: string;
  email?: string;
}

export interface UserStore {
  findById(id: string): Promise<UserRecord | null>;
  findByClerkUserId(clerkUserId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: NewUser): Promise<UserRecord>;
  update(id: string, input: UpdateUser): Promise<UserRecord | null>;
}
