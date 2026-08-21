/**
 * PublicDocumentPage — the read-only document view at /public/docs/:identifier/:number.
 *
 * Like PublicTaskPage: no mutation hooks, no authed client, no AuthProvider
 * wrapper (the route lives above it in app.tsx). design.md: no Lime, mono for
 * the doc number, markdown body rendered read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  fetchPublicDocument,
  PublicDocumentNotFoundError,
} from "@/hooks/public-api";
import { MarkdownEditor } from "@/components/markdown";
import { Skeleton } from "@/components/ui/skeleton";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PublicDocumentPage() {
  const { identifier, number } = useParams<{
    identifier: string;
    number: string;
  }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-document", identifier, number],
    queryFn: () => fetchPublicDocument(identifier!, number!),
    retry: (failureCount, err) =>
      !(err instanceof PublicDocumentNotFoundError) && failureCount < 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-foreground">This document isn’t available.</p>
        <p className="text-sm text-muted-foreground">
          It may have never been shared, or sharing may have been turned off.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-11 items-center gap-2 border-b border-border bg-secondary px-6">
        <span className="font-mono text-xs text-foreground">
          {data.docNumber}
        </span>
        <span className="text-muted-foreground/50">›</span>
        <span className="text-xs text-muted-foreground">{data.taskNumber}</span>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
        <div className="space-y-3">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            {data.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {data.taskTitle} · Updated {formatTimestamp(data.updatedAt)}
          </p>
        </div>
        {data.body ? (
          <MarkdownEditor value={data.body} editable={false} />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            This document is empty.
          </p>
        )}
      </main>
    </div>
  );
}
