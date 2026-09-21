import { cn } from "@/lib/utils";
import { getNameInitials } from "@/shared/user-name";

interface SpaceAvatarMember {
  readonly id: string;
  readonly name: string;
}

interface SpaceAvatarStackProps {
  readonly className?: string;
  readonly members: readonly SpaceAvatarMember[];
}

function SpaceAvatarStack({ className, members }: SpaceAvatarStackProps) {
  const visibleMembers = members.slice(0, 2);
  const avatars =
    visibleMembers.length > 0
      ? visibleMembers.map((member) => ({
          id: member.id,
          initials: getNameInitials(member.name),
        }))
      : [{ id: "empty", initials: "?" }];

  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 -space-x-1", className)}
    >
      {avatars.map((avatar) => (
        <span
          key={avatar.id}
          className="grid size-6 place-content-center border border-background bg-primary text-xs font-bold text-primary-foreground"
        >
          {avatar.initials}
        </span>
      ))}
    </span>
  );
}

export { SpaceAvatarStack };
export type { SpaceAvatarMember };
