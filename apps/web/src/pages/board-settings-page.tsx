import { NavLink, Outlet, useParams, useOutletContext } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBoardFull } from '@/hooks/use-boards';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GeneralSection } from './board-settings/general-section';
import { StatusesSection } from './board-settings/statuses-section';
import { LabelsSection } from './board-settings/labels-section';
import { MembersSection } from './board-settings/members-section';
import { DeleteBoardSection } from './board-settings/danger-section';

const TABS = [
  { to: 'general', label: 'General' },
  { to: 'statuses', label: 'Statuses' },
  { to: 'labels', label: 'Labels' },
  { to: 'members', label: 'Members' },
  { to: 'danger', label: 'Danger' },
];

function SettingsContent({ board }: { board: any }) {
  if (!board) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Board not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — 48px */}
      <div className="h-12 shrink-0 px-4 flex items-center gap-2 border-b border-border">
        <NavLink to={`/board/${board.id}`}>
          <ArrowLeft className="size-4 text-muted-foreground hover:text-foreground" />
        </NavLink>
        <span className="text-lg">{board.icon ?? '⭐'}</span>
        <span className="text-sm font-medium text-foreground">{board.name}</span>
        <span className="text-sm text-muted-foreground">— Settings</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-border">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-3 py-2 text-sm rounded-none border-b-2 transition-colors ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <Outlet context={{ board }} />
      </div>
    </div>
  );
}

export function BoardSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: board, isLoading } = useBoardFull(id!);

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-60" />
      </div>
    );
  }

  return <SettingsContent board={board} />;
}

export function GeneralSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  if (!board) return null;
  return <GeneralSection boardId={board.id} boardName={board.name} boardIcon={board.icon} />;
}

export function StatusesSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  if (!board) return null;
  return <StatusesSection boardId={board.id} statuses={board.statuses ?? []} />;
}

export function LabelsSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  if (!board) return null;
  return <LabelsSection boardId={board.id} labels={board.labels ?? []} />;
}

export function MembersSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  if (!board) return null;
  return <MembersSection boardId={board.id} />;
}

export function DangerSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  if (!board) return null;
  return <DeleteBoardSection boardId={board.id} boardName={board.name} />;
}
