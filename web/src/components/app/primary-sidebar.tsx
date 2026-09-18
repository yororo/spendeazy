import { LogOutIcon } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { NavLink } from "react-router-dom";

import { LedgerMark } from "@/components/app/ledger-mark";
import { AppearanceSelector } from "@/components/app/appearance-selector";
import { primaryNavigation } from "@/components/app/primary-navigation";
import { cn } from "@/lib/utils";

interface PrimarySidebarProps {
  className?: string;
  onNavigate?: () => void;
}

const FALLBACK_USER_NAME = "Signed-in user";

function getDisplayName(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return FALLBACK_USER_NAME;

  return (
    user.fullName ??
    user.firstName ??
    user.primaryEmailAddress?.emailAddress ??
    FALLBACK_USER_NAME
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "SU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function PrimarySidebar({ className, onNavigate }: PrimarySidebarProps) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const displayName = getDisplayName(user);

  const handleSignOut = async () => {
    onNavigate?.();
    await signOut({ redirectUrl: "/sign-in" });
  };

  return (
    <div
      className={cn(
        "flex min-h-full flex-col bg-sidebar px-5 py-7 text-sidebar-foreground",
        className,
      )}
    >
      <LedgerMark />

      <nav aria-label="Primary navigation" className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-2">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.label}>
                <NavLink
                  to={item.href}
                  end={item.href === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "focus-ledger flex min-h-10 items-center gap-3 px-3 font-mono text-xs font-semibold tracking-wide transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-foreground/10",
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-8 shrink-0 place-content-center bg-primary font-mono text-xs font-bold text-primary-foreground"
          >
            {getInitials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-sidebar-border pt-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="focus-ledger flex min-h-8 flex-1 items-center gap-2 font-mono text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <LogOutIcon className="size-4" aria-hidden="true" />
            Sign out
          </button>
          <AppearanceSelector />
        </div>
      </div>
    </div>
  );
}

export { PrimarySidebar };
