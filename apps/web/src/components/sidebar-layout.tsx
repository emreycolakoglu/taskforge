import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  ListChecks, Settings, PanelLeftClose, PanelLeft, User, LogOut,
  ChevronRight, Loader2, Plus, Columns3,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useBoards } from "@/hooks/use-boards"
import { CreateBoardDialog } from "@/components/create-board-dialog"

interface SidebarLayoutProps {
  children: React.ReactNode
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [boardsCollapsed, setBoardsCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { data: boards, isLoading: boardsLoading } = useBoards()

  const avatarLetter = user?.displayName ? user.displayName.charAt(0).toUpperCase() : "T"

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        <aside
          className={cn(
            "flex flex-col border-r bg-sidebar-background text-sidebar-foreground transition-all motion-reduce:transition-none duration-200",
            collapsed ? "w-14" : "w-60"
          )}
        >
          {/* Workspace header — plain label */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex h-14 items-center gap-2 border-b border-sidebar-border transition-colors w-full",
                  collapsed ? "justify-center px-0" : "px-3"
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                  {avatarLetter}
                </span>
                {!collapsed && (
                  <span className="flex-1 text-sm font-semibold text-sidebar-foreground">TaskForge</span>
                )}
              </div>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">TaskForge</TooltipContent>
            )}
          </Tooltip>

          {/* Primary navigation */}
          <nav className="flex flex-col gap-0.5 px-2 pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/tasks"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    location.pathname === "/tasks"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  aria-current={location.pathname === "/tasks" ? "page" : undefined}
                >
                  <ListChecks className="size-4 shrink-0" />
                  {!collapsed && <span>My Tasks</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">My Tasks</TooltipContent>
              )}
            </Tooltip>
          </nav>

          {/* Boards section */}
          {!collapsed ? (
            <div className="mt-4 px-2">
              <div className="flex items-center px-3 mb-1">
                <button
                  onClick={() => setBoardsCollapsed(!boardsCollapsed)}
                  className="flex items-center gap-1 text-xs font-semibold uppercase text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                >
                  <ChevronRight className={cn("size-3.5 shrink-0 transition-transform duration-200", !boardsCollapsed && "rotate-90")} />
                  BOARDS
                </button>
                <button
                  onClick={() => setCreateDialogOpen(true)}
                  className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  aria-label="Create board"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {!boardsCollapsed && (
                <>
                  {boardsLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="size-4 animate-spin text-sidebar-foreground/50" />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {boards?.map((board) => (
                        <Link
                          key={board.id}
                          to={`/board/${board.id}`}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                            location.pathname === `/board/${board.id}`
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                          )}
                          aria-current={location.pathname === `/board/${board.id}` ? "page" : undefined}
                        >
                          <Columns3 className="size-4 shrink-0" />
                          <span>{board.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  aria-label="Boards"
                  className={cn(
                    "flex items-center justify-center rounded-lg px-2 py-1.5 text-sm transition-colors mt-4 mx-2",
                    "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
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

          <Separator className="bg-sidebar-border" />

          {/* Bottom section */}
          <div className="flex flex-col gap-0.5 p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/settings"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    location.pathname.startsWith("/settings")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  aria-current={location.pathname.startsWith("/settings") ? "page" : undefined}
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
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-sidebar-accent text-sidebar-accent-foreground text-[11px] font-semibold">
                          {avatarLetter}
                        </span>
                        {!collapsed && <span className="truncate">{user.displayName}</span>}
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">{user.displayName}</TooltipContent>
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
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
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

        {/* Main content */}
        <main className="flex-1 overflow-auto" id="main-content">
          {children}
        </main>

        <CreateBoardDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={(board) => navigate(`/board/${board.id}`)}
        />
      </div>
    </TooltipProvider>
  )
}