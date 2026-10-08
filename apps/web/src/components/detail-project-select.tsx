/**
 * DetailProjectSelect — compact project picker for the properties sidebar
 * (TFG-34). Mirrors DetailAssigneeSelect: shared radix Select primitive,
 * ghost-styled trigger so it reads as an inline property row, and a sentinel
 * value for "no value" that maps back to explicit null at the boundary —
 * the API distinguishes an absent key (untouched) from null (un-assign).
 */

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
  'h-8 w-auto max-w-[180px] gap-1.5 border-0 bg-transparent px-2 py-1 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-4';

interface DetailProjectSelectProps {
  value: string | null;
  projects: ProjectMeta[];
  onChange: (projectId: string | null) => void;
}

export function DetailProjectSelect({ value, projects, onChange }: DetailProjectSelectProps) {
  const selected = projects.find((p) => p.id === value) ?? null;

  return (
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
  );
}
