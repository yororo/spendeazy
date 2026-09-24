import spendeazyLogo from "@/assets/spendeazy-site-logo-pixel-icon.svg";
import { cn } from "@/lib/utils";

interface LedgerMarkProps {
  className?: string;
  interactive?: boolean;
}

function LedgerMark({ className, interactive = true }: LedgerMarkProps) {
  const mark = (
    <>
      <img
        src={spendeazyLogo}
        alt=""
        width={24}
        height={24}
        className="size-6 shrink-0"
      />
      SPENDEAZY
    </>
  );
  const markClassName = cn(
    "inline-flex min-h-10 items-center gap-2 font-mono text-sm font-bold tracking-widest text-secondary-foreground",
    interactive && "focus-ledger",
    className,
  );

  if (!interactive) return <div className={markClassName}>{mark}</div>;

  return (
    <a href="#dashboard" className={markClassName}>
      {mark}
    </a>
  );
}

export { LedgerMark };
