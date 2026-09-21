import {
  ArrowDownToLineIcon,
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
  { label: "Sharing", href: "/sharing", icon: UsersRoundIcon },
];

export { primaryNavigation };
