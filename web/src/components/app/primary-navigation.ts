import {
  ArrowDownToLineIcon,
  ChartNoAxesCombinedIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  TagsIcon,
  UsersRoundIcon,
} from "lucide-react";

const primaryNavigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboardIcon },
  { label: "Imports", href: "/imports", icon: ArrowDownToLineIcon },
  { label: "Transactions", href: "/transactions", icon: ListFilterIcon },
  { label: "Insights", href: "/insights", icon: ChartNoAxesCombinedIcon },
  { label: "Budgets", href: "/categories", icon: TagsIcon },
  { label: "Sharing", href: "/sharing", icon: UsersRoundIcon },
];

const mobileNavigation = primaryNavigation.filter(
  ({ href }) => href !== "/sharing" && href !== "/categories",
);

function getNavigationTarget(href: string, spaceId?: string): string {
  if (spaceId === undefined) return href;

  const searchParams = new URLSearchParams({ spaceId });
  return `${href}?${searchParams.toString()}`;
}

export { getNavigationTarget, mobileNavigation, primaryNavigation };
