import { ApiError, type ApiClient } from "./api-client";
import { isRecord } from "./api-response";

interface SpaceMember {
  readonly id: string;
  readonly name: string;
}

interface AccessibleSpace {
  readonly id: string;
  readonly kind: "personal" | "shared";
  readonly status: "active" | "archived";
  readonly accessLevel: "read" | "write";
  readonly members: readonly SpaceMember[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

type SpaceClient = Pick<ApiClient, "get">;

function getArchivedSpaces(
  spaces: readonly AccessibleSpace[],
): readonly AccessibleSpace[] {
  return spaces.filter(
    (space) => space.kind === "shared" && space.status === "archived",
  );
}

function isAccessibleSpace(value: unknown): value is AccessibleSpace {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[1-9]\d*$/u.test(value.id) &&
    (value.kind === "personal" || value.kind === "shared") &&
    (value.status === "active" || value.status === "archived") &&
    (value.accessLevel === "read" || value.accessLevel === "write") &&
    Array.isArray(value.members) &&
    value.members.length > 0 &&
    value.members.every(isSpaceMember) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isSpaceMember(value: unknown): value is SpaceMember {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[1-9]\d*$/u.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0
  );
}

function invalidSpacesError(): ApiError {
  return new ApiError("The API returned an invalid Space catalog.", {
    kind: "malformed-response",
  });
}

function requireAccessibleSpaces(value: unknown): readonly AccessibleSpace[] {
  if (!Array.isArray(value) || !value.every(isAccessibleSpace)) {
    throw invalidSpacesError();
  }

  return value;
}

async function getAccessibleSpaces(
  apiClient: SpaceClient,
  signal?: AbortSignal,
): Promise<readonly AccessibleSpace[]> {
  const response = await apiClient.get<unknown>("/spaces", { signal });
  return requireAccessibleSpaces(response);
}

export {
  getAccessibleSpaces,
  getArchivedSpaces,
  isAccessibleSpace,
  requireAccessibleSpaces,
};
export type { AccessibleSpace, SpaceMember };
