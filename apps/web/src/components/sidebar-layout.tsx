import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  LayoutDashboard, ListChecks, Settings, Moon, Sun, PanelLeftClose, PanelLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

interface SidebarLayoutProps {
  children: React.ReactNode
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { theme, setTheme } = useTheme()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: "Boards", href: "/" },
    { icon: ListChecks, label: "Tasks", href: "/tasks" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ]

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r bg-sidebar-background text-sidebar-foreground transition-transform motion-reduce:transition-none duration-200",
            collapsed ? "w-16" : "w-56"
          )}
        >
          {/* Logo */}
          <div className={cn(
            "flex h-14 items-center border-b border-sidebar-border px-4",
            collapsed && "justify-center px-0"
          )}>
            {collapsed ? (
              <span className="text-sm font-bold text-sidebar-primary">TF</span>
            ) : (
              <span className="text-base font-bold text-sidebar-primary">TaskForge</span>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 flex flex-col gap-1 p-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        collapsed && "justify-center px-2"
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <item.icon className="size-5 shrink-0" data-icon="inline-start" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  )}
                </Tooltip>
              )
            })}
          </nav>

          <Separator className="bg-sidebar-border" />

          {/* Bottom actions */}
          <div className="flex flex-col gap-1 p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={collapsed ? "icon" : "default"}
                  className={cn(
                    "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center"
                  )}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? (
                    <Sun className="size-5 shrink-0" data-icon="inline-start" />
                  ) : (
                    <Moon className="size-5 shrink-0" data-icon="inline-start" />
                  )}
                  {!collapsed && <span>{theme === "dark" ? "Light" : "Dark"} Mode</span>}
                </Button>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </TooltipContent>
              )}
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={collapsed ? "icon" : "default"}
                  className={cn(
                    "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center"
                  )}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {collapsed ? (
                    <PanelLeft className="size-5 shrink-0" data-icon="inline-start" />
                  ) : (
                    <PanelLeftClose className="size-5 shrink-0" data-icon="inline-start" />
                  )}
                  {!collapsed && <span>Collapse</span>}
                </Button>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">
                  {collapsed ? "Expand" : "Collapse"}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto" id="main-content">
          {children}
        </main>
      </div>
    </TooltipProvider>
  )
}
