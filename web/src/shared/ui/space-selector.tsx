import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { AccessibleSpace } from "@/shared/api";

interface SpaceSelectorProps {
  readonly id: string;
  readonly spaceId?: string;
  readonly spaces?: readonly AccessibleSpace[];
  readonly spacesPending: boolean;
  readonly spacesError: boolean;
  readonly disabled?: boolean;
  readonly onSpaceChange: (spaceId?: string) => void;
}

function SpaceSelector({
  id,
  spaceId,
  spaces,
  spacesPending,
  spacesError,
  disabled = false,
  onSpaceChange,
}: SpaceSelectorProps) {
  return (
    <div className="grid w-full gap-1 md:w-56">
      <Label htmlFor={id}>Active Space</Label>
      <Select
        value={spaceId ?? "personal"}
        onValueChange={(value) =>
          onSpaceChange(value === "personal" ? undefined : value)
        }
      >
        <SelectTrigger id={id} aria-label="Active Space" disabled={disabled}>
          <SelectValue
            placeholder={spaceId === undefined ? "Personal Space" : `Space ${spaceId}`}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">Personal Space</SelectItem>
          {spacesPending && (
            <SelectItem value="loading" disabled>
              Loading Spaces…
            </SelectItem>
          )}
          {spacesError && (
            <SelectItem value="error" disabled>
              Spaces unavailable
            </SelectItem>
          )}
          {spaces
            ?.filter((space) => space.kind === "shared")
            .map((space) => (
              <SelectItem key={space.id} value={space.id}>
                Shared Space · {space.id}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export { SpaceSelector };
