import {
  ArrowDownToLineIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  TagsIcon,
} from "lucide-react";

const primaryNavigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboardIcon },
  { label: "Imports", href: "/imports", icon: ArrowDownToLineIcon },
  { label: "Transactions", href: "/transactions", icon: ListFilterIcon },
  { label: "Categories", href: "/categories", icon: TagsIcon },
];

export { primaryNavigation };
