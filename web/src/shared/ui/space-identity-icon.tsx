import { UserRoundIcon, UsersRoundIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type SpaceKind = "personal" | "shared";

interface SpaceIdentityIconProps {
  readonly className?: string;
  readonly kind?: SpaceKind;
}

function SpaceIdentityIcon({ className, kind }: SpaceIdentityIconProps) {
  const Icon =
    kind === "shared"
      ? UsersRoundIcon
      : kind === "personal"
        ? UserRoundIcon
        : null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-content-center border border-background bg-primary text-primary-foreground",
        className,
      )}
    >
      {Icon ? <Icon className="size-4" strokeWidth={2.5} /> : "?"}
    </span>
  );
}

export { SpaceIdentityIcon };
export type { SpaceKind };
