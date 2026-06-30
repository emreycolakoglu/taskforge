import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ListChecks,
  Settings,
  PanelLeftClose,
  PanelLeft,
  User,
  LogOut,
  ChevronRight,
  Loader2,
  Plus,
  Columns3,
  Inbox,
  Activity,
  Layers,
  Flag,
  FolderKanban,
  LayoutGrid,
  MoreHorizontal,
  Star,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useBoards } from "@/hooks/use-boards";
import { CreateBoardDialog } from "@/components/create-board-dialog";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

// Primary nav vocabulary mirrors Linear. Only "My Issues" routes today; the
// rest are placeholder links rendered as muted, non-interactive affordances
// with a "Coming soon" tooltip. No backend features are implied.
const PRIMARY_NAV = [
  {
    label: "Inbox",
    icon: Inbox,
    to: "/tasks" as string | null,
    enabled: false,
  },
  { label: "My Issues", icon: ListChecks, to: "/tasks", enabled: true },
  // { label: "Pulse", icon: Activity, to: null, enabled: false },
  // { label: "Workspace", icon: Layers, to: null, enabled: false },
  // { label: "Initiatives", icon: Flag, to: null, enabled: false },
  // { label: "Projects", icon: FolderKanban, to: null, enabled: false },
  // { label: "Views", icon: LayoutGrid, to: null, enabled: false },
  // { label: "More", icon: MoreHorizontal, to: null, enabled: false },
];

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: boards, isLoading: boardsLoading } = useBoards();

  const avatarLetter = user?.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : "T";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        <aside
          className={cn(
            "flex flex-col border-r bg-sidebar-background text-sidebar-foreground transition-all motion-reduce:transition-none duration-200",
            collapsed ? "w-14" : "w-64",
          )}
        >
          {/* Workspace header — plain label (Linear: avatar tile + name + chevron) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex h-11 mt-2 items-center gap-2 px-3 transition-colors w-full",
                  collapsed && "justify-center px-0",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                  {avatarLetter}
                </span>
                {!collapsed && (
                  <span className="flex-1 text-sm font-medium text-foreground">
                    TaskForge
                  </span>
                )}
              </div>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">TaskForge</TooltipContent>
            )}
          </Tooltip>

          {/* Primary navigation */}
          <nav className="flex flex-col gap-0.5 px-2 pt-2">
            {PRIMARY_NAV.map((item) => {
              const isActive =
                item.enabled &&
                item.to !== null &&
                location.pathname === item.to;
              const content = (
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-foreground"
                      : item.enabled
                        ? "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                        : "text-muted-foreground/60 cursor-default",
                    collapsed && "justify-center px-2",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </span>
              );

              if (!item.enabled) {
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <div>{content}</div>
                    </TooltipTrigger>
                    {!collapsed ? (
                      <TooltipContent side="right">Coming soon</TooltipContent>
                    ) : (
                      <TooltipContent side="right">
                        {item.label} — Coming soon
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              }

              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <Link to={item.to!} aria-label={item.label}>
                      {content}
                    </Link>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* Favorites — collapsible section (Linear-style saved views placeholder) */}
          {
            // !collapsed && (
            //   <div className="mt-4 px-2">
            //     <Collapsible defaultOpen>
            //       <CollapsibleTrigger className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
            //         <ChevronRight className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            //         Favorites
            //       </CollapsibleTrigger>
            //       <CollapsibleContent>
            //         <div className="flex flex-col gap-0.5">
            //           <Link
            //             to="/tasks"
            //             className={cn(
            //               "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
            //               location.pathname === "/tasks"
            //                 ? "bg-sidebar-accent text-foreground"
            //                 : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
            //             )}
            //           >
            //             <Star className="size-3.5 shrink-0" />
            //             Assigned to me
            //           </Link>
            //         </div>
            //       </CollapsibleContent>
            //     </Collapsible>
            //   </div>
            // )
          }

          {/* Boards section — collapsible */}
          {!collapsed ? (
            <div className="mt-2 px-2">
              <Collapsible defaultOpen>
                <div className="flex items-center px-3 pt-2 pb-1">
                  <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                    <ChevronRight className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    BOARDS
                  </CollapsibleTrigger>
                  <button
                    onClick={() => setCreateDialogOpen(true)}
                    className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Create board"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <CollapsibleContent>
                  {boardsLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {boards?.map((board) => {
                        const isActive =
                          location.pathname === `/board/${board.id}`;
                        return (
                          <Link
                            key={board.id}
                            to={`/board/${board.id}`}
                            className={cn(
                              "relative flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                              isActive
                                ? "bg-sidebar-accent text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                            )}
                            aria-current={isActive ? "page" : undefined}
                          >
                            {isActive && (
                              <span className="absolute left-0 h-5 w-0.5 rounded-r bg-primary" />
                            )}
                            <Columns3 className="size-4 shrink-0" />
                            <span>{board.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  aria-label="Boards"
                  className={cn(
                    "flex items-center justify-center rounded-md px-2 py-1.5 text-sm transition-colors mt-4 mx-2",
                    "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Columns3 className="size-4 shrink-0" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Boards</TooltipContent>
            </Tooltip>
          )}

          {/* Spacer to push bottom section down */}
          <div className="flex-1" />

          {/* Bottom section */}
          <div className="flex flex-col gap-0.5 p-3 border-t border-sidebar-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/settings"
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                    location.pathname.startsWith("/settings")
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                    collapsed && "justify-center px-2",
                  )}
                  aria-current={
                    location.pathname.startsWith("/settings")
                      ? "page"
                      : undefined
                  }
                >
                  <Settings className="size-4 shrink-0" />
                  {!collapsed && <span>Settings</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Settings</TooltipContent>
              )}
            </Tooltip>

            {user && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                          "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                          collapsed && "justify-center px-2",
                        )}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground text-[11px] font-semibold">
                          {avatarLetter}
                        </span>
                        {!collapsed && (
                          <span className="truncate text-sm text-foreground">
                            {user.displayName}
                          </span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">
                      {user.displayName}
                    </TooltipContent>
                  )}
                </Tooltip>
                <DropdownMenuContent side="right" align="start">
                  <DropdownMenuItem asChild>
                    <Link to="/account">
                      <User className="size-4 mr-2" />
                      Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="size-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                    collapsed && "justify-center px-2",
                  )}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {collapsed ? (
                    <PanelLeft className="size-4 shrink-0" />
                  ) : (
                    <>
                      <PanelLeftClose className="size-4 shrink-0" />
                      <span>Collapse</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Expand</TooltipContent>
              )}
            </Tooltip>
          </div>
        </aside>

        {/* Main content — flex column so board header is sticky and body scrolls */}
        <main
          className="flex-1 flex flex-col overflow-hidden bg-background"
          id="main-content"
        >
          {children}
        </main>

        <CreateBoardDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={(board) => navigate(`/board/${board.id}`)}
        />
      </div>
    </TooltipProvider>
  );
}
