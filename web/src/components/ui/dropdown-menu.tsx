import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type DropdownMenuInitialFocus = "first" | "last";

interface DropdownMenuContextValue {
  readonly contentId: string;
  readonly contentRef: React.RefObject<HTMLDivElement | null>;
  readonly initialFocusRef: React.MutableRefObject<DropdownMenuInitialFocus>;
  readonly open: boolean;
  readonly openMenu: (initialFocus?: DropdownMenuInitialFocus) => void;
  readonly closeMenu: () => void;
  readonly getEnabledItems: () => HTMLButtonElement[];
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = React.createContext<
  DropdownMenuContextValue | undefined
>(undefined);

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error(
      "DropdownMenu components must be used within a DropdownMenu.",
    );
  }

  return context;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (value: T | null) => {
    refs.forEach((ref) => assignRef(ref, value));
  };
}

interface DropdownMenuProps {
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
}

function DropdownMenu({
  children,
  defaultOpen = false,
  onOpenChange,
  open: openProp,
}: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] =
    React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const initialFocusRef = React.useRef<DropdownMenuInitialFocus>("first");
  const previousOpenRef = React.useRef(open);
  const restoreFocusOnCloseRef = React.useRef(true);
  const contentId = React.useId();

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, openProp],
  );

  const openMenu = React.useCallback(
    (initialFocus: DropdownMenuInitialFocus = "first") => {
      initialFocusRef.current = initialFocus;
      restoreFocusOnCloseRef.current = true;
      setOpen(true);
    },
    [setOpen],
  );

  const closeMenu = React.useCallback(() => {
    restoreFocusOnCloseRef.current = true;
    setOpen(false);
  }, [setOpen]);

  const getEnabledItems = React.useCallback(() => {
    if (!contentRef.current) return [];

    return Array.from(
      contentRef.current.querySelectorAll<HTMLButtonElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])',
      ),
    );
  }, []);

  React.useEffect(() => {
    if (open || !previousOpenRef.current) {
      previousOpenRef.current = open;
      return;
    }

    previousOpenRef.current = false;
    if (!restoreFocusOnCloseRef.current) return;

    const timeoutId = window.setTimeout(() => {
      const trigger = triggerRef.current;
      if (trigger && document.body.contains(trigger)) {
        trigger.focus();
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        contentRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }

      closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeMenu, open]);

  const contextValue = React.useMemo<DropdownMenuContextValue>(
    () => ({
      closeMenu,
      contentId,
      contentRef,
      getEnabledItems,
      initialFocusRef,
      open,
      openMenu,
      triggerRef,
    }),
    [closeMenu, contentId, getEnabledItems, open, openMenu],
  );

  return (
    <DropdownMenuContext.Provider value={contextValue}>
      {children}
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps
  extends React.ComponentPropsWithoutRef<"button"> {
  readonly asChild?: boolean;
}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(function DropdownMenuTrigger(
  {
    asChild = false,
    onClick,
    onKeyDown,
    type = "button",
    ...props
  },
  forwardedRef,
) {
  const {
    closeMenu,
    contentId,
    open,
    openMenu,
    triggerRef,
  } = useDropdownMenu();
  const ref = composeRefs(triggerRef, forwardedRef);
  const Comp = asChild ? Slot : "button";

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  }

  return (
    <Comp
      {...props}
      ref={ref}
      type={asChild ? undefined : type}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={contentId}
      data-slot="dropdown-menu-trigger"
      data-state={open ? "open" : "closed"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    />
  );
});

interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<"div"> {
  readonly align?: "start" | "end";
}

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(function DropdownMenuContent(
  {
    align = "start",
    children,
    className,
    id,
    onKeyDown,
    ...props
  },
  forwardedRef,
) {
  const {
    closeMenu,
    contentId,
    contentRef,
    getEnabledItems,
    initialFocusRef,
    open,
  } = useDropdownMenu();
  const ref = composeRefs(contentRef, forwardedRef);

  React.useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      const items = getEnabledItems();
      const item =
        initialFocusRef.current === "last" ? items.at(-1) : items[0];
      item?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [getEnabledItems, initialFocusRef, open]);

  function moveFocus(direction: -1 | 1, toEdge?: "first" | "last") {
    const items = getEnabledItems();
    if (items.length === 0) return;

    if (toEdge) {
      (toEdge === "first" ? items[0] : items.at(-1))?.focus();
      return;
    }

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      currentIndex < 0
        ? direction === 1
          ? 0
          : items.length - 1
        : (currentIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    // A containing modal may prevent Escape at document capture to stay open.
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(1, "first");
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(-1, "last");
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  if (!open) return null;

  return (
    <div
      {...props}
      ref={ref}
      id={id ?? contentId}
      role="menu"
      aria-orientation="vertical"
      data-slot="dropdown-menu-content"
      className={cn(
        "absolute z-50 mt-1 min-w-44 border border-foreground bg-popover p-1 text-popover-foreground shadow-none",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
});

interface DropdownMenuItemProps
  extends Omit<React.ComponentPropsWithoutRef<"button">, "onSelect"> {
  readonly onSelect?: (event: React.SyntheticEvent<HTMLButtonElement>) => void;
}

const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  {
    children,
    className,
    disabled = false,
    onClick,
    onKeyDown,
    onSelect,
    role = "menuitem",
    ...props
  },
  forwardedRef,
) {
  const { closeMenu } = useDropdownMenu();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;

    onSelect?.(event);
    if (!event.defaultPrevented) closeMenu();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <button
      {...props}
      ref={forwardedRef}
      type="button"
      role={role}
      tabIndex={-1}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      data-slot="dropdown-menu-item"
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "focus-ledger flex min-h-10 w-full cursor-default items-center gap-2 px-3 py-2 text-left font-mono text-xs font-semibold tracking-wide uppercase outline-none hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
});

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
};
