import { ApiError, type ApiClient } from "./api-client";
import { isRecord } from "./api-response";

interface UserProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type UserProvisioningClient = Pick<ApiClient, "put">;
type UserProfileClient = Pick<ApiClient, "get">;

const USER_PROFILE_FIELDS = [
  "id",
  "name",
  "email",
  "createdAt",
  "updatedAt",
] as const;
const USER_ID_PATTERN = /^[1-9]\d*$/u;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[^\s@.-](?:[^\s@]*[^\s@.-])?$/u;
const UTC_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u;

function isExactUserProfileRecord(
  value: Record<string, unknown>,
): boolean {
  const fields = Reflect.ownKeys(value);

  return (
    fields.length === USER_PROFILE_FIELDS.length &&
    fields.every(
      (field) =>
        typeof field === "string" &&
        USER_PROFILE_FIELDS.includes(field as (typeof USER_PROFILE_FIELDS)[number]),
    )
  );
}

function isUtcDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = UTC_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;

  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
  );
}

function isEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 320) return false;

  const [localPart, domainPart, ...extraParts] = value.split("@");
  if (!localPart || !domainPart || extraParts.length > 0) return false;
  if (
    /\s/u.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return false;
  }

  return domainPart
    .split(".")
    .every((label) => label.length > 0 && EMAIL_DOMAIN_LABEL_PATTERN.test(label));
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value) || !isExactUserProfileRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    USER_ID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.length >= 1 &&
    value.name.length <= 200 &&
    /\S/u.test(value.name) &&
    isEmail(value.email) &&
    isUtcDateTime(value.createdAt) &&
    isUtcDateTime(value.updatedAt)
  );
}

function invalidUserProfileError(): ApiError {
  return new ApiError("The API returned an invalid User profile.", {
    kind: "malformed-response",
  });
}

function requireUserProfile(value: unknown): UserProfile {
  if (!isUserProfile(value)) throw invalidUserProfileError();

  return value;
}

async function provisionUser(
  apiClient: UserProvisioningClient,
  signal?: AbortSignal,
): Promise<UserProfile> {
  const response = await apiClient.put<unknown>("", undefined, {
    signal,
    expectedStatuses: [200, 201],
  });
  return requireUserProfile(response);
}

async function getUserProfile(
  apiClient: UserProfileClient,
  signal?: AbortSignal,
): Promise<UserProfile> {
  const response = await apiClient.get<unknown>("", { signal });
  return requireUserProfile(response);
}

export { getUserProfile, isUserProfile, provisionUser, requireUserProfile };
export type { UserProfile };
