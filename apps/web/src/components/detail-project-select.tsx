/**
 * DetailProjectSelect — project row for the properties sidebar (TFG-34,
 * Linear-style since Projects v2): a "Project" subheader, and under it the
 * picker plus a chevron link to the global project page (/projects/:id). The
 * chevron only renders when a project is set.
 *
 * The picker mirrors DetailAssigneeSelect: shared radix Select primitive,
 * ghost-styled trigger so it reads as an inline property row, and a sentinel
 * value for "no value" that maps back to explicit null at the boundary — the
 * API distinguishes an absent key (untouched) from null (un-assign).
 *
 * The subheader reuses DetailPropertyRow's label token (text-xs, muted) so it
 * reads as the same property-label voice, just stacked instead of inline.
 */

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectMeta } from '@/types';

const NO_PROJECT = '__noproject__';

const TRIGGER_CLASS =
  'h-8 w-auto min-w-0 max-w-[180px] gap-1.5 border-0 bg-transparent px-2 py-1 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-4';

interface DetailProjectSelectProps {
  value: string | null;
  projects: ProjectMeta[];
  onChange: (projectId: string | null) => void;
}

export function DetailProjectSelect({ value, projects, onChange }: DetailProjectSelectProps) {
  const selected = projects.find((p) => p.id === value) ?? null;

  return (
    <div className="flex flex-col gap-1 py-2">
      <span className="text-xs text-muted-foreground">Project</span>
      <div className="flex min-w-0 items-center gap-1">
        <Select
          value={value ?? NO_PROJECT}
          onValueChange={(v) => onChange(v === NO_PROJECT ? null : v)}
        >
          <SelectTrigger className={TRIGGER_CLASS} aria-label="Project">
            <SelectValue>{selected ? selected.name : 'No project'}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value={NO_PROJECT}>No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-1.5">
                  {p.icon && <span aria-hidden="true">{p.icon}</span>}
                  {p.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Link to={`/projects/${value}`} aria-label="Open project" title="Open project">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
