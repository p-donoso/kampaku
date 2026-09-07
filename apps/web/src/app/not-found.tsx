import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Page Not Found"
        description="The requested resource could not be found."
      />
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          title="404 - Not Found"
          description="The page you are looking for does not exist."
          action={
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
            >
              Return to Dashboard
            </Link>
          }
        />
      </div>
    </div>
  );
}
