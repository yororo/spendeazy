import { useEffect, useRef, useState, type MouseEvent } from "react";
import { MenuIcon } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { LedgerMark } from "@/components/app/ledger-mark";
import { MobileTabBar } from "@/components/app/mobile-tab-bar";
import { PrimarySidebar } from "@/components/app/primary-sidebar";
import { SpaceSwitcher } from "@/components/app/space-switcher";
import { Button } from "@/components/ui/button";
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from "@/shared/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const pageTitles: Record<string, string> = {
  "/": "Dashboard · Spendeazy",
  "/imports": "Statement Import · Spendeazy",
  "/transactions": "Transactions · Spendeazy",
  "/categories": "Budget overview · Spendeazy",
};

function AppShell() {
  return (
    <NavigationGuardProvider>
      <AppShellContent />
    </NavigationGuardProvider>
  );
}

function AppShellContent() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();

  function handleNavigationClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (
      !anchor ||
      anchor.target === "_blank" ||
      anchor.hasAttribute("download") ||
      !anchor.href
    ) {
      return;
    }

    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin !== window.location.origin ||
      destination.pathname === location.pathname
    ) {
      return;
    }

    const anchorPath = `${destination.pathname}${destination.search}${destination.hash}`;
    const activeSpaceId = new URLSearchParams(location.search).get("spaceId");
    if (activeSpaceId && !destination.searchParams.has("spaceId")) {
      destination.searchParams.set("spaceId", activeSpaceId);
    }
    const destinationPath = `${destination.pathname}${destination.search}${destination.hash}`;

    if (
      requestNavigation(() => navigate(destinationPath))
    ) {
      event.preventDefault();
    } else if (destinationPath !== anchorPath) {
      event.preventDefault();
      navigate(destinationPath);
    }
  }

  useEffect(() => {
    document.title = pageTitles[pathname] ?? "Page not found · Spendeazy";
    window.scrollTo({ top: 0, behavior: "auto" });
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div
      className="min-h-screen bg-background lg:flex lg:h-screen lg:overflow-hidden"
      onClickCapture={handleNavigationClickCapture}
    >
      <aside className="hidden h-screen w-56 shrink-0 self-start lg:sticky lg:top-0 lg:block">
        <PrimarySidebar className="h-full" />
      </aside>

      <header className="compact-app-header fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 bg-sidebar text-sidebar-foreground lg:hidden">
        <LedgerMark />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <SpaceSwitcher className="min-w-0 max-w-[min(16rem,calc(100vw-10rem))] flex-1" />
          <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              >
                <MenuIcon className="size-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              onEscapeKeyDown={(event) => {
                // Let an open nested menu consume Escape before closing the Sheet.
                if (event.target instanceof Element && event.target.closest('[role="menu"]')) {
                  event.preventDefault();
                }
              }}
              className="gap-0 border-0 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Primary navigation</SheetTitle>
                <SheetDescription>Navigate through Spendeazy.</SheetDescription>
              </SheetHeader>
              <PrimarySidebar
                className="h-dvh flex-1 overflow-hidden pt-[max(1.75rem,env(safe-area-inset-top,0px))] pb-[max(1.75rem,env(safe-area-inset-bottom,0px))]"
                onNavigate={() => setNavigationOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div
        ref={contentRef}
        className="mobile-navigation-content min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto"
      >
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}

export { AppShell };
