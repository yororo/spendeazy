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
  { label: "Categories", href: "/categories", icon: TagsIcon },
  { label: "Insights", href: "/insights", icon: ChartNoAxesCombinedIcon },
  { label: "Sharing", href: "/sharing", icon: UsersRoundIcon },
];

const mobileNavigation = primaryNavigation.filter(
  ({ href }) => href !== "/sharing" && href !== "/insights",
);

function getNavigationTarget(href: string, spaceId?: string): string {
  if (spaceId === undefined) return href;

  const searchParams = new URLSearchParams({ spaceId });
  return `${href}?${searchParams.toString()}`;
}

export { getNavigationTarget, mobileNavigation, primaryNavigation };
