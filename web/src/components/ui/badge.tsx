import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center justify-center gap-1 border px-2 font-mono text-xs font-semibold tracking-wide whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground",
        outline: "border-border bg-background text-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        success:
          "border-success bg-success-surface text-success",
        destructive:
          "border-destructive bg-background text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
