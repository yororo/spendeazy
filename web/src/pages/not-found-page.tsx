import { ArrowLeftIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl items-center px-4 py-6 sm:px-6 lg:min-h-screen lg:px-9 lg:py-7">
      <section aria-labelledby="not-found-heading" className="max-w-xl border border-foreground p-6 sm:p-8">
        <p className="text-label text-muted-foreground">404 / Page not found</p>
        <h1 id="not-found-heading" className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The address may be incorrect, or the page may have moved.
        </p>
        <Button asChild variant="secondary" className="mt-6">
          <Link to="/">
            <ArrowLeftIcon aria-hidden="true" /> Back to dashboard
          </Link>
        </Button>
      </section>
    </div>
  );
}

export { NotFoundPage };
