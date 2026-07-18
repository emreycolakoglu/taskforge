/**
 * PublicTaskPage — the read-only task view served to anonymous visitors at
 * /public/:identifier/:number (e.g. /public/TF/123).
 *
 * Deliberately imports no mutation hooks and no authed API client. It is a
 * separate page rather than <TaskDetailView readOnly>, because the read-only
 * surface is genuinely different UI, not the same UI with controls disabled:
 * status is a static pill instead of a Select, the description is rendered
 * markdown instead of an editor, comments have no composer. Threading a
 * `readOnly` flag through six controls that each need a different rendering
 * would put more branching in the files that matter most.
 *
 * If you add anything here, remember the payload is curated server-side
 * (see PublicService) — activity, sub-tasks, parent and relations are absent by
 * design, not by oversight.
 *
 * design.md: no Lime anywhere — the page has no primary action. Onyx canvas,
 * border-defined edges, mono for the task ID, Inter weights capped at 590.
 */

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fetchPublicTask, PublicTaskNotFoundError } from "@/hooks/public-api";
import { MarkdownEditor } from "@/components/markdown";
import { LabelPill } from "@/components/label-pill";
import { Skeleton } from "@/components/ui/skeleton";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Static counterpart of DetailStatusSelect — a pill, not a control. */
function StatusPill({ status }: { status: { name: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: status.color }}
        aria-hidden
      />
      {status.name}
    </span>
  );
}

function PublicTaskNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <p className="text-foreground">This task isn’t available.</p>
      <p className="text-sm text-muted-foreground">
        It may have never been shared, or sharing may have been turned off.
      </p>
    </div>
  );
}

export function PublicTaskPage() {
  const { identifier, number } = useParams<{
    identifier: string;
    number: string;
  }>();

  const {
    data: task,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-task", identifier, number],
    queryFn: () => fetchPublicTask(identifier!, number!),
    retry: (failureCount, err) =>
      !(err instanceof PublicTaskNotFoundError) && failureCount < 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-2/3" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) return <PublicTaskNotFound />;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-11 items-center gap-2 border-b border-border bg-secondary px-6">
        <span className="font-mono text-xs text-foreground">
          {task.taskNumber}
        </span>
        <span className="text-muted-foreground/50">›</span>
        <StatusPill status={task.status} />
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
        <div className="space-y-3">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            {task.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="capitalize">{task.priority} priority</span>
            {task.assignee && <span>Assigned to {task.assignee}</span>}
            <span>Created {formatTimestamp(task.createdAt)}</span>
          </div>
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {task.labels.map((label) => (
                <LabelPill key={label.name} label={label} />
              ))}
            </div>
          )}
        </div>

        {task.description ? (
          <MarkdownEditor value={task.description} editable={false} />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No description.
          </p>
        )}

        {task.comments.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Comments
            </h2>
            <ul className="space-y-4">
              {task.comments.map((c, i) => (
                <li
                  key={`${c.author}-${c.createdAt}-${i}`}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-foreground">{c.author}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatTimestamp(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/90">{c.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
