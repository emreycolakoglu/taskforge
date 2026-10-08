/**
 * ProjectDetailPage — project detail at /projects/:projectId
 * (TFG-34; global since Projects v2 — a project's tasks can span boards).
 *
 * Renders the GET /api/projects/:id rollup: header (icon, name, lifecycle
 * chip, lead via the user directory, dates, description), the project's
 * tasks grouped by status (the payload is ordered status.position then
 * position; grouping preserves first-appearance order), and the server's
 * progress rollup as a neutral bar. Task rows link to their own board-scoped
 * route (/board/:boardId/task/:taskId) — tasks stay board-scoped. The
 * header's outline "Edit" button opens EditProjectDialog (deleting from it
 * navigates back to /projects).
 *
 * design.md compliance: Obsidian card surfaces with 1px Graphite inset
 * borders, no bright fills, no gradients; the Add task button is the page's
 * single primary CTA in Acid Lime; Inter weights ≤590 via the house
 * `font-medium` token; JetBrains Mono (`font-mono`) for task numbers and
 * dates; status dots take the status row's own color.
 */
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, FolderKanban, Pencil, Plus } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useBoardFull, useBoards } from '@/hooks/use-boards';
import { useCreateTask } from '@/hooks/use-tasks';
import { useUserDirectory } from '@/hooks/use-users';
import { useSocket } from '@/hooks/use-socket';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressIcon } from '@/components/progress-icon';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { EditProjectDialog } from '@/components/edit-project-dialog';
import type { ProjectDetail, ProjectStatus, Task } from '@/types';
import { PROJECT_STATUS_LABELS } from '@/types';

const formatDate = (ts: string) =>
  new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

interface StatusGroup {
  key: string;
  name: string;
  color?: string;
  tasks: Task[];
}

/**
 * Group the payload's tasks by their status row, preserving the order the
 * API already established (status.position asc, then position asc) — i.e.
 * first appearance wins.
 */
function groupByStatus(tasks: Task[]): StatusGroup[] {
  const groups = new Map<string, StatusGroup>();
  for (const task of tasks) {
    const status = task.status;
    const key = status?.id ?? 'none';
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(key, {
        key,
        name: status?.name ?? 'No status',
        color: status?.color,
        tasks: [task],
      });
    }
  }
  return [...groups.values()];
}

/** Lifecycle chip for the project status — outline Badge, capitalized word. */
function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {PROJECT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, error } = useProject(projectId!);
  const { data: directory = [] } = useUserDirectory();
  const { data: boards = [] } = useBoards();
  // The project has no board of its own, so "Add task" needs a board pick.
  // Until the user picks one in the dialog, default to the board of the
  // project's first task, else the first board in the workspace.
  const [pickedBoardId, setPickedBoardId] = useState<string | null>(null);
  const boardId = pickedBoardId ?? project?.tasks?.[0]?.boardId ?? boards[0]?.id ?? '';
  const { data: board } = useBoardFull(boardId);
  const createTask = useCreateTask();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Projects are workspace-level: project:* and task.project.updated are
  // broadcast to every socket, so this page needs no board room.
  useSocket();

  // The payload carries only leadId — resolve the display name through the
  // existing directory hook; no lead (or unknown id) renders nothing.
  const leadName = project?.leadId
    ? (directory.find((u) => u.id === project.leadId)?.displayName ?? null)
    : null;

  const groups = groupByStatus(project?.tasks ?? []);
  const progress = project?.progress;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-background">
        <header className="flex h-12 shrink-0 items-center border-b border-border bg-secondary px-3 sm:px-6">
          <SidebarTrigger
            className="md:hidden text-muted-foreground hover:text-foreground"
            aria-label="Toggle sidebar"
          />
        </header>
        <div className="flex-1 space-y-6 p-4 sm:p-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (error || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-foreground">Project not found.</p>
        <Button variant="outline" onClick={() => navigate('/projects')}>
          <ArrowLeft className="size-4 mr-2" />
          Back to projects
        </Button>
      </div>
    );
  }

  const pct =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  // TFG-34 — the page's create affordance: the house New Issue dialog, preset
  // to this project, in board-picker mode (the dialog lists the boards; the
  // page owns the pick and feeds it that board's statuses). Status defaults to
  // the board's first status (the dialog already does that when no
  // defaultStatusId is given). Freshness comes from
  // two layers: (1) useCreateTask.onSuccess invalidates ['projects', id] for
  // the page's own mutation, and (2) the socket's task:created /
  // task.project.updated handlers invalidate ['projects', projectId] so tasks
  // created elsewhere (board kanban, MCP) land here too.
  const handleCreateTask = (data: {
    title: string;
    description?: string;
    statusId: string;
    priority: Task['priority'];
    assigneeId?: string | null;
    projectId?: string | null;
  }) => {
    if (!boardId) return;
    // The dialog always sends the picker's value (null = No project); fall
    // back to the route param only if the caller's dialog lacks the key.
    createTask.mutate({
      ...data,
      projectId: data.projectId !== undefined ? data.projectId : projectId!,
      boardId,
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Breadcrumb bar — mirrors the board-header-bar pattern */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-secondary px-3 sm:px-6">
        <SidebarTrigger
          className="md:hidden text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Back to projects"
          onClick={() => navigate('/projects')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <nav
          aria-label="breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/projects" className="truncate hover:text-foreground">
            Projects
          </Link>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ›
          </span>
          <span className="truncate text-foreground">{project.name}</span>
        </nav>
        {/* Secondary action — outline, so Add task stays the only Lime CTA */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          aria-label="Edit project"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="size-4" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        {/* The page's single primary CTA — Acid Lime (design.md) */}
        <Button
          size="sm"
          className="shrink-0"
          aria-label="Add task"
          onClick={() => setCreateTaskOpen(true)}
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add task</span>
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{project.icon ?? '📦'}</span>
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-[24px] font-medium tracking-tight text-foreground">
                  {project.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <ProjectStatusChip status={project.status as ProjectStatus} />
                  {leadName && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[9px] font-semibold"
                        title={leadName}
                        aria-hidden="true"
                      >
                        {leadName.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{leadName}</span>
                    </span>
                  )}
                  {progress && progress.total > 0 && (
                    <span className="flex items-center gap-2">
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
                  )}
                </div>
              </div>
            </div>
            {(project.startDate || project.targetDate) && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {project.startDate && (
                  <span>
                    <span className="text-muted-foreground/70">Start </span>
                    <span className="font-mono">{formatDate(project.startDate)}</span>
                  </span>
                )}
                {project.targetDate && (
                  <span>
                    <span className="text-muted-foreground/70">Target </span>
                    <span className="font-mono">{formatDate(project.targetDate)}</span>
                  </span>
                )}
              </p>
            )}
            {project.description && (
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>

          {/* ── Tasks grouped by status ────────────────────────────────────── */}
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FolderKanban className="h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-medium text-foreground">No tasks yet</h2>
              <p className="text-sm text-muted-foreground">
                Add tasks to this project from the board.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.key} className="space-y-2" aria-label={`${group.name} tasks`}>
                  {/* Group header — dot in the status color + name + count, mirrors BoardColumn header */}
                  <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color ?? '#94a3b8' }}
                      aria-hidden="true"
                    />
                    {group.name}
                    <span className="text-xs font-mono text-muted-foreground">
                      {group.tasks.length}
                    </span>
                  </h2>
                  <ul className="space-y-1.5">
                    {group.tasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/board/${task.boardId}/task/${task.id}`)}
                          className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left cursor-pointer transition-colors hover:bg-accent/30"
                        >
                          <ProgressIcon
                            progress={task.status?.progress ?? 0}
                            type={task.status?.type}
                            size={16}
                          />
                          {task.taskNumber && (
                            <span className="font-mono text-xs text-muted-foreground shrink-0">
                              {task.taskNumber}
                            </span>
                          )}
                          <span className="text-sm text-foreground truncate flex-1">
                            {task.title}
                          </span>
                          {(task.labels ?? []).length > 0 && (
                            <span className="flex min-w-0 max-w-[50%] flex-wrap justify-end gap-1">
                              {(task.labels ?? []).map((tl) => (
                                <Badge
                                  key={tl.labelId}
                                  variant="outline"
                                  className="min-w-0 max-w-full shrink"
                                >
                                  <span
                                    className="size-2 shrink-0 rounded-sm"
                                    style={{ backgroundColor: tl.label.color }}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{tl.label.name}</span>
                                </Badge>
                              ))}
                            </span>
                          )}
                          {task.assignee && (
                            <span
                              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[9px] font-semibold"
                              title={task.assignee.displayName}
                            >
                              {task.assignee.displayName.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add-task dialog — preset to this project (TFG-34) */}
      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        statuses={board?.statuses ?? []}
        users={directory}
        projectId={projectId}
        boards={boards}
        boardId={boardId}
        onBoardChange={setPickedBoardId}
        onSubmit={handleCreateTask}
      />

      <EditProjectDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onDeleted={() => navigate('/projects')}
      />
    </div>
  );
}
