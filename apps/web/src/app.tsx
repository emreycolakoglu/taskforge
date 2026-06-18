import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarLayout } from '@/components/sidebar-layout'
import { HomePage } from '@/pages/home-page'
import { TasksPage } from '@/pages/tasks-page'
import { SettingsPage } from '@/pages/settings-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { KanbanBoard } from '@/components/kanban-board'

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="taskforge-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <SidebarLayout>
              <HomePage />
            </SidebarLayout>
          } />
          <Route path="/board/:id" element={
            <SidebarLayout>
              <KanbanBoard />
            </SidebarLayout>
          } />
          <Route path="/tasks" element={
            <SidebarLayout>
              <TasksPage />
            </SidebarLayout>
          } />
          <Route path="/settings" element={
            <SidebarLayout>
              <SettingsPage />
            </SidebarLayout>
          } />
          <Route path="*" element={
            <SidebarLayout>
              <NotFoundPage />
            </SidebarLayout>
          } />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}