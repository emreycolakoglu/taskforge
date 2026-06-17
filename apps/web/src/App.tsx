import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarLayout } from '@/components/sidebar-layout'
import { HomePage } from '@/pages/HomePage'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TooltipProvider } from '@/components/ui/tooltip'

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
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
