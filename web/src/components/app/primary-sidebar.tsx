import { useId, useState } from "react";
import { HistoryIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";

import { LedgerMark } from "@/shared/ui/ledger-mark";
import { AppearanceSelector } from "@/components/app/appearance-selector";
import { ThemeSelector } from "@/components/app/theme-selector";
import {
  getNavigationTarget,
  primaryNavigation,
} from "@/components/app/primary-navigation";
import { SpaceSwitcher } from "@/components/app/space-switcher";
import { cn } from "@/lib/utils";
import { useNavigationGuard } from "@/shared/navigation";
import { useAppSession, type AppSessionUser } from "@/shared/session";
import { getNameInitials } from "@/shared/user-name";

interface PrimarySidebarProps {
  className?: string;
  hasArchivedHistory?: boolean;
  onNavigate?: () => void;
}

const FALLBACK_USER_NAME = "Signed-in user";

function getDisplayName(user: AppSessionUser | null): string {
  if (!user) return FALLBACK_USER_NAME;

  return (
    user.fullName ??
    user.firstName ??
    user.primaryEmail ??
    FALLBACK_USER_NAME
  );
}

function getNavigationLinkClassName(isActive: boolean): string {
  return cn(
    "navigation-item focus-ledger flex min-h-10 items-center gap-3 px-3 font-mono text-xs font-semibold tracking-wide transition-colors",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-foreground/10",
  );
}

function PrimarySidebar({
  className,
  hasArchivedHistory = false,
  onNavigate,
}: PrimarySidebarProps) {
  const { signOut, user } = useAppSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsId = useId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { requestNavigation } = useNavigationGuard();
  const displayName = getDisplayName(user);
  const selectedSpaceId = searchParams.get("spaceId") ?? undefined;

  const completeSignOut = async () => {
    onNavigate?.();
    await signOut();
    navigate("/sign-in", { replace: true });
  };

  const handleSignOut = () => {
    if (requestNavigation(() => void completeSignOut())) return;

    void completeSignOut();
  };

  return (
    <div
      className={cn(
        "flex min-h-full flex-col bg-sidebar px-5 py-7 text-sidebar-foreground",
        className,
      )}
    >
      <LedgerMark className="text-sidebar-foreground" />

      <SpaceSwitcher className="mt-6" onNavigate={onNavigate} />

      <nav aria-label="Primary navigation" className="mt-6 min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-2">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.label}>
                <NavLink
                  to={getNavigationTarget(item.href, selectedSpaceId)}
                  end={item.href === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) => getNavigationLinkClassName(isActive)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
          {hasArchivedHistory && (
            <li>
              <NavLink
                to="/history"
                end
                onClick={onNavigate}
                className={({ isActive }) => getNavigationLinkClassName(isActive)}
              >
                <HistoryIcon className="size-4" aria-hidden="true" />
                History
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      <div className="profile-card shrink-0 border border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-8 shrink-0 place-content-center bg-primary font-mono text-xs font-bold text-primary-foreground"
          >
            {getNameInitials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
          </div>
          <button
            type="button"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
            onClick={() => setSettingsOpen((open) => !open)}
            className="focus-ledger grid size-11 shrink-0 place-items-center border border-sidebar-border hover:bg-sidebar-foreground/10"
          >
            <SettingsIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div id={settingsId} hidden={!settingsOpen}>
          {settingsOpen && (
            <div className="mt-3 space-y-3 border-t border-sidebar-border pt-3">
              <ThemeSelector />
              <div className="flex items-center justify-between gap-2">
                <span className="text-label">Appearance</span>
                <AppearanceSelector />
              </div>
            </div>
          )}
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
        </div>
      </div>
    </div>
  );
}

export { PrimarySidebar };
