import { LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ExpenseLoadMoreButtonProps {
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => void;
}

function ExpenseLoadMoreButton({
  isFetchingNextPage,
  onLoadMore,
}: ExpenseLoadMoreButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full md:w-auto"
      disabled={isFetchingNextPage}
      onClick={onLoadMore}
    >
      {isFetchingNextPage && (
        <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
      )}
      {isFetchingNextPage ? "Loading more" : "Load more"}
    </Button>
  );
}

export { ExpenseLoadMoreButton };
