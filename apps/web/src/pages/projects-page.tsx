/**
 * ProjectsPage — workspace project list at /projects (TFG-34; global since
 * Projects v2).
 *
 * Lists every project in the workspace (icon, name, status chip, lead display
 * name, progress bar, target date) and offers a single "New project" CTA —
 * the screen's one Lime action per design.md. Progress comes from the list
 * payload's server-side rollup (status.type === 'done'), since a project's
 * tasks can span boards and this page has no board to fetch them from.
 * Each row carries a ghost pencil button that opens EditProjectDialog.
 *
 * design.md compliance: Obsidian card surfaces with 1px Graphite inset
 * borders, neutral progress fill (no Lime — the CTA owns it), status chip is
 * an outline Badge in Fog, JetBrains Mono for dates.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Pencil, Plus } from 'lucide-react';
import { useProjects, useCreateProject } from '@/hooks/use-projects';
import { useUserDirectory } from '@/hooks/use-users';
import { useSocket } from '@/hooks/use-socket';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmojiPicker } from '@/components/emoji-picker';
import { UserSelect } from '@/components/user-select';
import { EditProjectDialog } from '@/components/edit-project-dialog';
import type { AssigneeOption } from '@/components/detail-assignee-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProjectListItem, ProjectStatus } from '@/types';
import { PROJECT_STATUS_LABELS } from '@/types';

interface CreateProjectFormData {
  name: string;
  description: string;
  icon: string;
  status: ProjectStatus;
  leadId: string | null;
  targetDate: string;
}

/** Small create dialog (name, description, icon, status, lead, target date). */
function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate,
  isPending,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: CreateProjectFormData, onSuccess: () => void) => void;
  isPending: boolean;
  users: AssigneeOption[];
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');
  const [status, setStatus] = useState<ProjectStatus>('planned');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState('');

  const isValid = name.trim().length > 0;

  const submit = () => {
    if (!isValid) return;
    onCreate(
      {
        name: name.trim(),
        description: description.trim() || '',
        icon: icon || '📦',
        status,
        leadId,
        targetDate: targetDate || '',
      },
      () => {
        onOpenChange(false);
        setName('');
        setDescription('');
        setIcon('📦');
        setStatus('planned');
        setLeadId(null);
        setTargetDate('');
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group related tasks into a named, trackable container.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <div className="flex gap-2">
              <EmojiPicker
                value={icon}
                onChange={setIcon}
                className="size-9 shrink-0 border border-border"
              />
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Roadmap"
                className="flex-1"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="min-h-[60px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-status">Status</Label>
              <select
                id="project-status"
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
              <Label htmlFor="project-lead">Lead</Label>
              <UserSelect
                id="project-lead"
                value={leadId}
                users={users}
                onChange={setLeadId}
                noneLabel="No lead"
                ariaLabel="Lead"
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-target-date">Target date</Label>
              <Input
                id="project-target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isValid || isPending}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const { data: directory = [] } = useUserDirectory();
  const createProject = useCreateProject();
  const [createOpen, setCreateOpen] = useState(false);
  // editOpen is separate from editingId so the dialog stays mounted after it
  // closes — its delete confirm lives in it and opens as the form closes.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const editing = projects.find((p) => p.id === editingId) ?? null;
  // Projects are workspace-level: project:* and task.project.updated are
  // broadcast to every socket, so no board room is needed.
  useSocket();

  const leadName = (leadId: string | null | undefined) =>
    directory.find((u) => u.id === leadId)?.displayName ?? null;

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-secondary px-6">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger
            className="md:hidden text-muted-foreground hover:text-foreground"
            aria-label="Toggle sidebar"
          />
          <h1 className="text-sm font-medium text-foreground truncate">Projects</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />
          New project
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium text-foreground">No projects yet</h2>
            <p className="text-sm text-muted-foreground">
              Create one to group related tasks together.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project: ProjectListItem) => {
              const progress = project.progress ?? { completed: 0, total: 0 };
              const pct =
                progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
              const lead = leadName(project.leadId);
              // The edit button is a sibling overlaid on the row, not a child —
              // a <button> can't nest inside the row's <button>.
              return (
                <div key={project.id} className="relative">
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="flex w-full items-center gap-4 rounded-lg border border-border bg-card py-3 pl-4 pr-12 text-left shadow-sm transition-colors hover:border-foreground/20 hover:bg-accent/30"
                    data-testid="project-row"
                  >
                    <span className="text-base leading-none shrink-0">{project.icon ?? '📦'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {project.name}
                        </span>
                        <Badge variant="outline" className="text-muted-foreground">
                          {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
                        </Badge>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span
                          role="progressbar"
                          aria-label={`${project.name} progress`}
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="h-1.5 w-40 max-w-full overflow-hidden rounded-full border border-border bg-secondary"
                        >
                          <span
                            className="block h-full rounded-full bg-muted-foreground/40 transition-[width]"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {progress.completed}/{progress.total}
                        </span>
                      </span>
                    </span>
                    {lead && <span className="text-xs text-muted-foreground shrink-0">{lead}</span>}
                    {project.targetDate && (
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {formatDate(project.targetDate)}
                      </span>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${project.name}`}
                    onClick={() => {
                      setEditingId(project.id);
                      setEditOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isPending={createProject.isPending}
        users={directory}
        onCreate={(data, onSuccess) =>
          createProject.mutate(
            {
              name: data.name,
              description: data.description || undefined,
              icon: data.icon,
              status: data.status,
              leadId: data.leadId ?? undefined,
              targetDate: data.targetDate || undefined,
            },
            { onSuccess },
          )
        }
      />

      {editing && (
        <EditProjectDialog project={editing} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </div>
  );
}
