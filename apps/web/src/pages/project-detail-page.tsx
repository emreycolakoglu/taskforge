/**
 * ProjectDetailPage — placeholder for Task 6 (TFG-34).
 *
 * The route exists now so the sidebar link and router surface are complete;
 * the real deliverable (header, status-grouped task list, progress summary,
 * add-to-project) lands in Task 6 and replaces this body. Until then the page
 * renders the project name from the same `projects.get` fetch Task 6 will
 * consume, or a loading stub while the query is in flight.
 */
import { useParams, Link } from 'react-router-dom';
import { useProject } from '@/hooks/use-projects';

export function ProjectDetailPage() {
  const { boardId, projectId } = useParams<{ boardId: string; projectId: string }>();
  const { data: project, isLoading } = useProject(projectId!);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-secondary px-6">
        <Link
          to={`/board/${boardId}/projects`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Projects
        </Link>
      </header>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <h1 className="text-lg font-medium text-foreground">
            {project ? `${project.icon ?? '📦'} ${project.name}` : 'Project not found'}
          </h1>
        )}
      </div>
    </div>
  );
}
