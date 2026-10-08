/**
 * EditProjectDialog — edit a project's name, icon, description, status, lead
 * and start/target dates, or delete it (Projects v2).
 *
 * Opened from the projects list rows and the project detail header. The form
 * is prefilled from `project` each time the dialog opens, and Save sends only
 * the fields that changed. A cleared lead, date or description goes out as
 * explicit `null` — the API treats `undefined` as "leave alone" and `null` as
 * "clear". Nothing changed → the dialog just closes, no request.
 *
 * Delete is a destructive secondary action behind an AlertDialog confirm.
 * The confirm is a sibling, not nested: the edit dialog closes as it opens
 * (two stacked modal focus traps fight each other). `onDeleted` lets the
 * detail page navigate away from the now-404 route.
 *
 * design.md: Save is the dialog's single primary (Lime) action; delete uses
 * the Crimson destructive text on a ghost button, not a fill.
 */
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useDeleteProject, useUpdateProject } from '@/hooks/use-projects';
import { useUserDirectory } from '@/hooks/use-users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmojiPicker } from '@/components/emoji-picker';
import { UserSelect } from '@/components/user-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Project, ProjectStatus } from '@/types';
import { PROJECT_STATUS_LABELS } from '@/types';
import type { api } from '@/hooks/api';

type ProjectUpdate = Parameters<typeof api.projects.update>[1];

/** ISO timestamp (or YYYY-MM-DD) → the YYYY-MM-DD a date input expects. */
const toDateInput = (ts: string | null | undefined) => (ts ? ts.slice(0, 10) : '');

interface EditProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: EditProjectDialogProps) {
  const { data: directory = [] } = useUserDirectory();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [icon, setIcon] = useState(project.icon ?? '📦');
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [leadId, setLeadId] = useState<string | null>(project.leadId ?? null);
  const [startDate, setStartDate] = useState(toDateInput(project.startDate));
  const [targetDate, setTargetDate] = useState(toDateInput(project.targetDate));
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Diff against the project as it was when the dialog opened, not the live
  // prop — otherwise a concurrent edit arriving via socket would make the
  // untouched field look changed and Save would revert it.
  const [baseline, setBaseline] = useState(project);

  useEffect(() => {
    if (!open) return;
    setBaseline(project);
    setName(project.name);
    setDescription(project.description ?? '');
    setIcon(project.icon ?? '📦');
    setStatus(project.status);
    setLeadId(project.leadId ?? null);
    setStartDate(toDateInput(project.startDate));
    setTargetDate(toDateInput(project.targetDate));
    // Reset only on open — a socket refetch mid-edit must not wipe the form.
  }, [open]);

  const isValid = name.trim().length > 0;

  const changes = (): ProjectUpdate => {
    const data: ProjectUpdate = {};
    if (name.trim() !== baseline.name) data.name = name.trim();
    const nextDescription = description.trim() || null;
    if (nextDescription !== (baseline.description ?? null)) data.description = nextDescription;
    if (icon !== (baseline.icon ?? '📦')) data.icon = icon;
    if (status !== baseline.status) data.status = status;
    if (leadId !== (baseline.leadId ?? null)) data.leadId = leadId;
    if (startDate !== toDateInput(baseline.startDate)) data.startDate = startDate || null;
    if (targetDate !== toDateInput(baseline.targetDate)) data.targetDate = targetDate || null;
    return data;
  };

  const submit = () => {
    if (!isValid) return;
    const data = changes();
    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }
    updateProject.mutate({ id: project.id, data }, { onSuccess: () => onOpenChange(false) });
  };

  const confirmDelete = () => deleteProject.mutate(project.id, { onSuccess: () => onDeleted?.() });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Update the project's details, lead and timeline.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-project-name">Name</Label>
              <div className="flex gap-2">
                <EmojiPicker
                  value={icon}
                  onChange={setIcon}
                  className="size-9 shrink-0 border border-border"
                />
                <Input
                  id="edit-project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-project-description">Description</Label>
              <Textarea
                id="edit-project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                className="min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-project-status">Status</Label>
                <select
                  id="edit-project-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="rounded-md border border-border bg-input px-3 py-2 text-sm"
                >
                  {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-project-lead">Lead</Label>
                <UserSelect
                  id="edit-project-lead"
                  value={leadId}
                  users={directory}
                  onChange={setLeadId}
                  noneLabel="No lead"
                  ariaLabel="Lead"
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-project-start-date">Start date</Label>
                <Input
                  id="edit-project-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-project-target-date">Target date</Label>
                <Input
                  id="edit-project-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive sm:mr-auto"
              onClick={() => {
                onOpenChange(false);
                setConfirmDeleteOpen(true);
              }}
            >
              <Trash2 className="size-4 mr-1.5" />
              Delete project
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!isValid || updateProject.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{project.name}" and its documents will be permanently removed. Its tasks stay on
              their boards, unlinked from the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleteProject.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
