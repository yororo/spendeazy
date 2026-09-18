import { NavLink } from "react-router-dom";

import { primaryNavigation } from "@/components/app/primary-navigation";
import { cn } from "@/lib/utils";

function MobileTabBar() {
  return (
    <nav aria-label="Mobile navigation" className="mobile-tab-bar">
      <ul className="grid h-[var(--mobile-tab-bar-height)] grid-cols-4">
        {primaryNavigation.map(({ label, href, icon: Icon }) => (
          <li key={href} className="min-w-0">
            <NavLink
              to={href}
              end={href === "/"}
              className={({ isActive }) =>
                cn(
                  "flex h-full flex-col items-center justify-center gap-1 font-mono text-xs font-semibold tracking-tighter focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-current",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-foreground/10",
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { MobileTabBar };
