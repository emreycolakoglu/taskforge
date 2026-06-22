import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/auth-context";
import { SidebarLayout } from "@/components/sidebar-layout";
import { HomePage } from "@/pages/home-page";
import { TasksPage } from "@/pages/tasks-page";
import { SettingsPage } from "@/pages/settings-page";
import { AccountPage } from "@/pages/account-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { OnboardingPage } from "@/pages/onboarding-page";
import { LoginPage } from "@/pages/login-page";
import { SignupPage } from "@/pages/signup-page";

import { KanbanBoard } from "@/components/kanban-board";
import { BoardSettingsPage } from "@/pages/board-settings-page";
import { TaskDetailPage } from "@/pages/task-detail-page";

export function App() {
  return (
    <>
      <Toaster richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup/:token" element={<SignupPage />} />
            <Route
              path="/"
              element={
                <SidebarLayout>
                  <HomePage />
                </SidebarLayout>
              }
            />
            <Route
              path="/board/:id"
              element={
                <SidebarLayout>
                  <KanbanBoard />
                </SidebarLayout>
              }
            />
            <Route
              path="/board/:id/settings"
              element={
                <SidebarLayout>
                  <BoardSettingsPage />
                </SidebarLayout>
              }
            />
            <Route
              path="/board/:boardId/task/:taskId"
              element={
                <SidebarLayout>
                  <TaskDetailPage />
                </SidebarLayout>
              }
            />
            <Route
              path="/tasks"
              element={
                <SidebarLayout>
                  <TasksPage />
                </SidebarLayout>
              }
            />
            <Route
              path="/settings"
              element={
                <SidebarLayout>
                  <SettingsPage />
                </SidebarLayout>
              }
            />
            <Route
              path="/account"
              element={
                <SidebarLayout>
                  <AccountPage />
                </SidebarLayout>
              }
            />

            <Route
              path="*"
              element={
                <SidebarLayout>
                  <NotFoundPage />
                </SidebarLayout>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}
