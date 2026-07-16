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
import { InboxPage } from "@/pages/inbox-page";
import { PublicTaskPage } from "@/pages/public-task-page";

/**
 * The authenticated app. Everything here sits under AuthProvider, whose init
 * effect hits /auth/status on every route and redirects to /login when there is
 * no stored session.
 */
function AuthedRoutes() {
  return (
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
          path="/inbox"
          element={
            <SidebarLayout>
              <InboxPage />
            </SidebarLayout>
          }
        />
        <Route
          path="/inbox/:notificationId"
          element={
            <SidebarLayout>
              <InboxPage />
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
  );
}

/**
 * The public task route is mounted ABOVE AuthProvider, not exempted from inside
 * it.
 *
 * AuthProvider redirects anonymous visitors to /login and carries a single
 * hardcoded escape hatch (`pathname.startsWith('/signup/')`). Adding a second
 * string check would leave the public page's correctness resting on a
 * `startsWith` that any refactor could quietly break — and it would still mount
 * inside the provider, so the /auth/status roundtrip and redirect flash would
 * happen anyway. Rendering it as a sibling makes it structural: a provider that
 * isn't above the page cannot redirect it.
 *
 * It also stays outside SidebarLayout, which calls useAuth/useBoards/useSocket
 * unconditionally and cannot render without a user.
 */
export function App() {
  return (
    <>
      <Toaster richColors />
      <BrowserRouter>
        <Routes>
          <Route
            path="/public/:identifier/:number"
            element={<PublicTaskPage />}
          />
          <Route path="*" element={<AuthedRoutes />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
