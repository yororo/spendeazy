import { ChevronDownIcon, LoaderCircleIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { useNavigationGuard } from "@/shared/navigation";
import { useAppSession } from "@/shared/session";
import { getSpaceIdentityLabel, SpaceAvatarStack } from "@/shared/ui";
import {
  buildCanonicalSpaceSearch,
  getActiveSpaces,
  getPersonalSpace,
  persistSpaceSelection,
} from "./space-selection";

interface SpaceSwitcherProps {
  readonly className?: string;
  readonly onNavigate?: () => void;
}

function SpaceSwitcher({ className, onNavigate }: SpaceSwitcherProps) {
  const spacesQuery = useAccessibleSpacesQuery(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();
  const { user } = useAppSession();
  const currentSpaceId = new URLSearchParams(location.search).get("spaceId");
  const isHistoryRoute = location.pathname === "/history";
  const activeSpaces = getActiveSpaces(spacesQuery.data ?? []);
  const personalSpace = getPersonalSpace(spacesQuery.data ?? []);
  const activeSpace =
    activeSpaces.find((space) => space.id === currentSpaceId) ?? personalSpace;
  let activeLabel =
    currentSpaceId === null ? "Spaces unavailable" : "Space unavailable";
  if (activeSpace) {
    activeLabel = getSpaceIdentityLabel(activeSpace);
  } else if (spacesQuery.isPending) {
    activeLabel = "Loading Spaces…";
  } else if (spacesQuery.isSuccess && activeSpaces.length === 0) {
    activeLabel = "No active Spaces";
  }

  function switchSpace(spaceId: string) {
    if (!isHistoryRoute && spaceId === (currentSpaceId ?? activeSpace?.id)) {
      return;
    }

    const search = buildCanonicalSpaceSearch(
      location.search,
      spaceId,
      personalSpace?.id,
    );
    const destination = isHistoryRoute
      ? `/${buildCanonicalSpaceSearch("", spaceId, personalSpace?.id)}`
      : `${location.pathname}${search}${location.hash}`;
    const completeSwitch = () => {
      persistSpaceSelection(user?.id, spaceId);
      navigate(destination);
      onNavigate?.();
    };

    if (requestNavigation(completeSwitch)) return;
    completeSwitch();
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          className="focus-ledger flex min-h-10 w-full min-w-0 items-center gap-2 border border-sidebar-border px-2 text-left text-sidebar-foreground hover:bg-sidebar-foreground/10"
          aria-label={`Active Space: ${activeLabel}`}
          data-navigation-intent="space-switcher"
        >
          <SpaceAvatarStack members={activeSpace?.members ?? []} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {activeLabel}
          </span>
          <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="left-0 right-0 min-w-0 border-sidebar-border bg-sidebar text-sidebar-foreground"
          data-navigation-intent="space-switcher"
        >
          <p className="px-3 py-2 text-label text-sidebar-foreground/70">
            Switch Space
          </p>
          {spacesQuery.isPending && (
            <div className="flex min-h-10 items-center gap-2 px-3 py-2 text-xs">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
              Loading Spaces…
            </div>
          )}
          {spacesQuery.isError && (
            <p role="alert" className="px-3 py-2 text-xs">
              Spaces unavailable. Try again.
            </p>
          )}
          {spacesQuery.isSuccess && activeSpaces.length === 0 && (
            <p className="px-3 py-2 text-xs">No active Spaces are available.</p>
          )}
          {activeSpaces.map((space) => {
            const isActive =
              space.id === (currentSpaceId ?? activeSpace?.id);

            return (
              <DropdownMenuItem
                key={space.id}
                role="menuitemradio"
                aria-checked={isActive}
                aria-label={getSpaceIdentityLabel(space)}
                onSelect={() => switchSpace(space.id)}
                className="min-h-12 gap-3 text-sm normal-case tracking-normal"
              >
                <SpaceAvatarStack members={space.members} />
                <span className="min-w-0 flex-1 truncate">
                  {getSpaceIdentityLabel(space)}
                </span>
                {isActive && (
                  <span className="shrink-0 text-xs" aria-label="Current Space">
                    Current
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { SpaceSwitcher };
