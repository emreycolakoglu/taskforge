import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { api } from '@/hooks/api';
import type { Status, StatusType } from '@/types';
import { defaultProgressForType, isProgressEditable } from '@/lib/status-type';
import { ProgressIcon } from '@/components/progress-icon';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as UILabel } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TYPE_OPTIONS: { value: StatusType; label: string }[] = [
  { value: 'triage', label: 'Triage' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'duplicate', label: 'Duplicate' },
];

export function StatusesSection({ boardId, statuses }: { boardId: string; statuses: Status[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StatusType>('todo');
  const [newColor, setNewColor] = useState('#6366f1');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<StatusType>('todo');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editProgress, setEditProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
    queryClient.invalidateQueries({ queryKey: ['boards'] });
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.statuses.create({ boardId, name: newName.trim(), type: newType, color: newColor });
      toast.success('Status created');
      setNewName('');
      setNewType('todo');
      setNewColor('#6366f1');
      setAdding(false);
      invalidate();
    } catch (err) {
      toast.error('Failed to create status', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (status: Status) => {
    setEditingId(status.id);
    setEditName(status.name);
    setEditType(status.type);
    setEditColor(status.color ?? '#6366f1');
    setEditProgress(status.progress ?? 0);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const data: Record<string, any> = { name: editName, type: editType, color: editColor };
      if (isProgressEditable(editType)) {
        data.progress = editProgress;
      }
      await api.statuses.update(editingId, data);
      toast.success('Status updated');
      setEditingId(null);
      invalidate();
    } catch (err) {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (statusId: string) => {
    try {
      await api.statuses.delete(statusId);
      toast.success('Status deleted');
      invalidate();
    } catch (err) {
      toast.error('Failed to delete status', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const pendingDeleteStatus = pendingDeleteId
    ? statuses.find((s) => s.id === pendingDeleteId)
    : null;

  const handleReorder = async (status: Status, direction: 'up' | 'down') => {
    const sorted = [...statuses].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((s) => s.id === status.id);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorted.length - 1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const items = sorted.map((s, i) => ({ id: s.id, position: i }));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    try {
      await api.statuses.reorder(items);
      invalidate();
    } catch (err) {
      toast.error('Failed to reorder', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Statuses</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Manage columns and their issue status types for this board.
        </CardDescription>
      </div>

      <div className="flex flex-col">
        {statuses.map((status) => (
          <div key={status.id} className="border-b border-border last:border-0">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <ProgressIcon progress={status.progress ?? 0} type={status.type} size={16} />
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: status.color ?? '#94a3b8' }}
                  aria-label={`Color ${status.color ?? 'default'}`}
                />
                <span className="text-sm text-foreground">{status.name}</span>
                <Badge
                  variant="secondary"
                  className="text-xs text-muted-foreground border-0 rounded-sm px-1.5 py-0.5 font-mono"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${status.color ?? '#333'}`,
                    color: status.color ?? '#94a3b8',
                  }}
                >
                  {TYPE_OPTIONS.find((t) => t.value === status.type)?.label ?? status.type}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">
                  {status._count?.tasks ?? 0}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleReorder(status, 'up')}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleReorder(status, 'down')}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => startEdit(status)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => setPendingDeleteId(status.id)}
                  aria-label="Delete status"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            {editingId === status.id && (
              <div className="pb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <UILabel className="text-xs text-muted-foreground">Name</UILabel>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 w-48"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <UILabel className="text-xs text-muted-foreground">Type</UILabel>
                    <Select
                      value={editType}
                      onValueChange={(v) => {
                        const next = v as StatusType;
                        setEditType(next);
                        setEditProgress(defaultProgressForType(next) ?? 0);
                      }}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <UILabel className="text-xs text-muted-foreground">Color</UILabel>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-8 w-9 rounded-md border border-border bg-background cursor-pointer"
                    />
                  </div>
                  {isProgressEditable(editType) && (
                    <div className="flex flex-col gap-1">
                      <UILabel className="text-xs text-muted-foreground">Progress</UILabel>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editProgress}
                        onChange={(e) => setEditProgress(parseInt(e.target.value, 10) || 0)}
                        className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {statuses.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No statuses yet</p>
        )}
      </div>

      {/* Add status form */}
      {adding ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <UILabel className="text-xs text-muted-foreground">Name</UILabel>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Status name..."
                className="h-8 w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <UILabel className="text-xs text-muted-foreground">Type</UILabel>
              <Select value={newType} onValueChange={(v) => setNewType(v as StatusType)}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <UILabel className="text-xs text-muted-foreground">Color</UILabel>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-9 rounded-md border border-border bg-background cursor-pointer"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              Add
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full border-dashed border-border text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus data-icon="inline-start" />
          Add Status
        </Button>
      )}

      {/* Delete status confirmation dialog */}
      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete status</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{pendingDeleteStatus?.name}&rdquo;? All tasks
              in this status will also be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) {
                  handleDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
