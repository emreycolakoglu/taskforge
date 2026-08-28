/**
 * BlockerPill — outlined pill showing a blocker count with a shadcn tooltip
 * that lazily fetches the related tasks on open and lists them as
 * "TFG-123 Title" rows.
 *
 * Used in the TaskCard row 3 metadata strip. Two directions:
 *   - `blockedBy`: tasks that block this one (Crimson icon)
 *   - `blocking`:  tasks this one blocks (Indigo icon)
 *
 * design.md: Snow (#f7f8f8) pill text + outline, semantic-color icon only.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTaskRelations } from '@/hooks/use-relations';

function BlockedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.82843 1H10.1716C10.702 1 11.2107 1.21071 11.5858 1.58579L14.4142 4.41421C14.7893 4.78929 15 5.29799 15 5.82843V10.1716C15 10.702 14.7893 11.2107 14.4142 11.5858L11.5858 14.4142C11.2107 14.7893 10.702 15 10.1716 15H5.82843C5.29799 15 4.78929 14.7893 4.41421 14.4142L1.58579 11.5858C1.21071 11.2107 1 10.702 1 10.1716V5.82843C1 5.29799 1.21071 4.78929 1.58579 4.41421L4.41421 1.58579C4.78929 1.21071 5.29799 1 5.82843 1ZM4.5 6.75C4.22386 6.75 4 6.97386 4 7.25V8.75C4 9.02614 4.22386 9.25 4.5 9.25H11.5C11.7761 9.25 12 9.02614 12 8.75V7.25C12 6.97386 11.7761 6.75 11.5 6.75H4.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BlockingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.7461 1C12.8172 1 14.4961 2.67893 14.4961 4.75V5.24561C14.4961 5.65982 14.1603 5.99561 13.7461 5.99561C13.3319 5.99561 12.9961 5.65982 12.9961 5.24561V4.75C12.9961 3.50736 11.9887 2.5 10.7461 2.5H4.74609C3.50345 2.5 2.49609 3.50736 2.49609 4.75V10.9705C2.49609 12.2131 3.50345 13.2205 4.74609 13.2205H5.25009C5.66431 13.2205 6.00009 13.5562 6.00009 13.9705C6.00009 14.3847 5.66431 14.7205 5.25009 14.7205H4.74609C2.67503 14.7205 0.996094 13.0415 0.996094 10.9705V4.75C0.996094 2.67893 2.67503 1 4.74609 1H10.7461Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.2409 7H9.7591C9.456 7 9.16531 7.12041 8.95098 7.33473L7.33473 8.95098C7.12041 9.16531 7 9.456 7 9.7591V12.2409C7 12.544 7.12041 12.8347 7.33473 13.049L8.95098 14.6653C9.16531 14.8796 9.456 15 9.7591 15H12.2409C12.544 15 12.8347 14.8796 13.049 14.6653L14.6653 13.049C14.8796 12.8347 15 12.544 15 12.2409V9.7591C15 9.456 14.8796 9.16531 14.6653 8.95098L13.049 7.33473C12.8347 7.12041 12.544 7 12.2409 7ZM9.22222 10.1111C8.97676 10.1111 8.77778 10.3101 8.77778 10.5556V11.4444C8.77778 11.6899 8.97676 11.8889 9.22222 11.8889H12.7778C13.0232 11.8889 13.2222 11.6899 13.2222 11.4444V10.5556C13.2222 10.3101 13.0232 10.1111 12.7778 10.1111H9.22222Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface BlockerPillProps {
  taskId: string;
  count: number;
  direction: 'blockedBy' | 'blocking';
}

export function BlockerPill({ taskId, count, direction }: BlockerPillProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useTaskRelations(taskId, { enabled: open });

  if (count <= 0) return null;

  const isBlockedBy = direction === 'blockedBy';
  const entries = data ? (isBlockedBy ? data.blockedBy : data.blocking) : [];

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Badge
            variant={'outline'}
            style={{ color: '#f7f8f8' }}
            className={`shrink-0 [&_svg]:${isBlockedBy ? 'text-destructive' : 'text-indigo'}`}
            aria-label={isBlockedBy ? `Blocked by ${count} task(s)` : `Blocking ${count} task(s)`}
          >
            {isBlockedBy ? <BlockedIcon /> : <BlockingIcon />}
            {count}
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs space-y-1 py-2"
          aria-label={isBlockedBy ? 'Blocked by' : 'Blocking'}
        >
          <p className="font-medium text-foreground">{isBlockedBy ? 'Blocked By' : 'Blocking'}</p>
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {error && <p className="text-destructive">Failed to load</p>}
          {!isLoading && !error && entries.length === 0 && (
            <p className="text-muted-foreground">No tasks</p>
          )}
          {!isLoading &&
            !error &&
            entries.map((e) => (
              <p key={e.relationId} className="text-popover-foreground">
                <span className="font-mono text-muted-foreground">{e.task.taskNumber}</span>{' '}
                {e.task.title}
              </p>
            ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
