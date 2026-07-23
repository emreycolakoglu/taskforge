import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ListChecks,
  Settings,
  PanelLeftClose,
  PanelLeft,
  User,
  LogOut,
  ChevronRight,
  Plus,
  Inbox,
  LayoutGrid,
} from "lucide-react";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useBoards } from "@/hooks/use-boards";
import { useUnreadCount } from "@/hooks/use-notifications";
import { useSocket } from "@/hooks/use-socket";
import { CreateBoardDialog } from "@/components/create-board-dialog";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

// Primary nav vocabulary mirrors Linear. Both routes exist today; placeholder
// destinations were removed. No backend features are implied.
const PRIMARY_NAV = [
  { label: "Inbox", icon: Inbox, to: "/inbox" },
  { label: "My Issues", icon: ListChecks, to: "/tasks" },
  { label: "Boards", icon: LayoutGrid, to: "/boards" },
];

/**
 * SidebarLayout — app chrome built on the shadcn Sidebar primitive.
 *
 * Collapse is now CSS-driven (data-[collapsible=icon]) rather than the old
 * conditional-render `collapsed` state: labels stay mounted and hide via the
 * sidebar's data attributes, tooltips come from SidebarMenuButton's `tooltip`
 * prop, and ⌘/Ctrl-B toggles. State persists to a cookie across reloads.
 *
 * Boards section: each board the current user is a member of is shown as a
 * collapsible group with Issues / Settings sub-items. Non-member boards are
 * hidden from the sidebar but accessible via /boards or direct link.
 */
export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: boards, isLoading: boardsLoading } = useBoards();
  const { data: unreadData } = useUnreadCount();
  useSocket();
  const unreadCount = unreadData?.count ?? 0;

  // Close the mobile sidebar (Sheet) whenever the route changes.
  // This component must be rendered inside <SidebarProvider>.
  function MobileSidebarCloser() {
    const { isMobile, setOpenMobile } = useSidebar();
    useEffect(() => {
      if (isMobile) setOpenMobile(false);
    }, [location.pathname, isMobile, setOpenMobile]);
    return null;
  }

  // Filter boards to only those the current user is a member of.
  // Membership is determined by the `members` array (if present) or by
  // checking if the user's ID appears in the board's member list.
  const memberBoards = boards?.filter((board) => {
    if (!user) return false;
    if (board.members && board.members.length > 0) {
      return board.members.some((m) => m.userId === user.id);
    }
    // If members array isn't loaded (list endpoint), show all boards
    return true;
  });

  const avatarLetter = user?.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : "T";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <MobileSidebarCloser />
      <Sidebar collapsible="icon" className="bg-sidebar-background">
        {/* Workspace header — plain label, not an interactive trigger */}
        <SidebarHeader>
          <div className="flex h-8 items-center gap-2 px-1">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
              {avatarLetter}
            </span>
            <span className="text-sm font-medium text-foreground group-data-[collapsible=icon]:hidden">
              TaskForge
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* Primary navigation */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {PRIMARY_NAV.map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <Link
                          to={item.to}
                          aria-label={item.label}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.label === "Inbox" && unreadCount > 0 && (
                        <SidebarMenuBadge className="bg-primary text-primary-foreground">
                          {unreadCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Boards — collapsible group with per-board sub-items */}
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <div className="flex items-center gap-0 w-full">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center justify-center size-6 shrink-0 rounded-md hover:bg-accent/50 transition-colors">
                      <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </button>
                  </CollapsibleTrigger>
                  <Link
                    to="/boards"
                    className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ml-1"
                  >
                    BOARDS
                  </Link>
                </div>
              </SidebarGroupLabel>
              <SidebarGroupAction
                aria-label="Create board"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus />
              </SidebarGroupAction>
              <CollapsibleContent>
                <SidebarGroupContent>
                  {boardsLoading ? (
                    <div className="flex flex-col gap-1 px-2 py-1">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-3/4" />
                    </div>
                  ) : (
                    <SidebarMenu>
                      {memberBoards?.map((board) => {
                        const issuesActive =
                          location.pathname === `/board/${board.id}`;
                        const settingsActive =
                          location.pathname ===
                          `/board/${board.id}/settings`;
                        const boardActive =
                          issuesActive || settingsActive;
                        return (
                          <Collapsible
                            key={board.id}
                            defaultOpen={boardActive}
                            className="group/collapsible"
                          >
                            <SidebarMenuItem>
                              <div className="flex items-center">
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton className="w-auto shrink-0 px-1" tooltip={board.name}>
                                    <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                  </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <SidebarMenuButton asChild isActive={issuesActive} tooltip={board.name} className="flex-1">
                                  <Link to={`/board/${board.id}`}>
                                    <span className="text-base leading-none">
                                      {board.icon ?? "⭐"}
                                    </span>
                                    <span className="truncate">
                                      {board.name}
                                    </span>
                                  </Link>
                                </SidebarMenuButton>
                              </div>
                              <CollapsibleContent>
                                <div className="ml-6 flex flex-col gap-0.5">
                                  <SidebarMenuButton
                                    asChild
                                    isActive={settingsActive}
                                    size="sm"
                                    className="pl-2"
                                  >
                                    <Link
                                      to={`/board/${board.id}/settings`}
                                    >
                                      Settings
                                    </Link>
                                  </SidebarMenuButton>
                                </div>
                              </CollapsibleContent>
                            </SidebarMenuItem>
                          </Collapsible>
                        );
                      })}
                      {(!memberBoards || memberBoards.length === 0) && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No boards yet
                        </p>
                      )}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        </SidebarContent>

        {/* Bottom section */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={location.pathname.startsWith("/settings")}
                tooltip="Settings"
              >
                <Link
                  to="/settings"
                  aria-current={
                    location.pathname.startsWith("/settings")
                      ? "page"
                      : undefined
                  }
                >
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {user && (
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton>
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground text-[11px] font-semibold">
                        {avatarLetter}
                      </span>
                      <span className="truncate text-foreground">
                        {user.displayName}
                      </span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="end">
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
              </SidebarMenuItem>
            )}

            <SidebarMenuItem>
              <CollapseToggle />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset id="main-content" className="overflow-hidden">
        {children}
      </SidebarInset>

      <CreateBoardDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={(board) => navigate(`/board/${board.id}`)}
      />
    </SidebarProvider>
  );
}

/** Footer toggle — collapses/expands the rail with a state-aware aria-label. */
function CollapseToggle() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <SidebarMenuButton
      onClick={toggleSidebar}
      tooltip={collapsed ? "Expand" : undefined}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {collapsed ? <PanelLeft /> : <PanelLeftClose />}
      <span>Collapse</span>
    </SidebarMenuButton>
  );
}
