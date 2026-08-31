/**
 * ViewSelector — saved-views dropdown in the board header center slot.
 *
 * Trigger shows the active view name or "No view". Entries are grouped
 * "Board views" (isShared) / "My views" (personal). Active entry uses the
 * Graphite accent (bg-accent) — NEVER Lime (design.md: Lime is rationed to
 * the New Issue CTA). Owner-facing Rename/Delete actions sit inline per row.
 */

import { useState } from 'react';
import { ChevronDown, Eye, Pencil, Trash2 } from 'lucide-react';
import type { View } from '@/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

const TRIGGER_CLASS =
  'h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground';

interface ViewSelectorProps {
  views: View[];
  activeViewId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function ViewSelector({
  views,
  activeViewId,
  onSelect,
  onRename,
  onDelete,
}: ViewSelectorProps) {
  const [renaming, setRenaming] = useState<View | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<View | null>(null);

  const shared = views.filter((v) => v.isShared);
  const personal = views.filter((v) => !v.isShared);
  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  const startRename = (view: View) => {
    setRenaming(view);
    setRenameValue(view.name);
  };

  const submitRename = () => {
    const name = renameValue.trim();
    if (renaming && name && name !== renaming.name) onRename(renaming.id, name);
    setRenaming(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-transparent hover:border-input',
            'px-2.5 text-xs font-medium transition-colors hover:bg-accent',
            activeView ? 'text-foreground' : 'text-muted-foreground',
          )}
          aria-label="Saved views"
        >
          <Eye className="size-3.5 shrink-0" />
          <span className="max-w-40 truncate">{activeView ? activeView.name : 'No view'}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 border-sidebar-border">
          <DropdownMenuItem
            className={cn(activeViewId === null && 'bg-accent text-foreground')}
            onSelect={() => onSelect(null)}
          >
            No view
          </DropdownMenuItem>

          {shared.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Board views
              </DropdownMenuLabel>
              {shared.map((view) => (
                <ViewRow
                  key={view.id}
                  view={view}
                  active={view.id === activeViewId}
                  onSelect={onSelect}
                  onRename={startRename}
                  onDelete={setDeleting}
                />
              ))}
            </>
          )}

          {personal.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                My views
              </DropdownMenuLabel>
              {personal.map((view) => (
                <ViewRow
                  key={view.id}
                  view={view}
                  active={view.id === activeViewId}
                  onSelect={onSelect}
                  onRename={startRename}
                  onDelete={setDeleting}
                />
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-1">
            <Label htmlFor="view-rename-input">Name</Label>
            <Input
              id="view-rename-input"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete view</DialogTitle>
            <DialogDescription>
              {deleting?.isShared
                ? `Delete "${deleting?.name}"? This shared view will be removed for all board members. This action cannot be undone.`
                : `Delete "${deleting?.name}"? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) onDelete(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ViewRow({
  view,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  view: View;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (view: View) => void;
  onDelete: (view: View) => void;
}) {
  return (
    <div className="group/row relative flex items-center">
      <DropdownMenuItem
        className={cn('flex-1 pr-14', active && 'bg-accent text-foreground')}
        onSelect={() => onSelect(view.id)}
      >
        <span className="truncate">{view.name}</span>
      </DropdownMenuItem>
      {/* TODO(TFG-30 follow-up): row rename/delete unreachable via keyboard — Radix menu focus trap; use submenu or footer action row */}
      <div className="absolute right-1 flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`Rename ${view.name}`}
          className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onRename(view);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${view.name}`}
          className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(view);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
