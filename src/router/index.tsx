import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { RouteErrorBoundary } from "../components/common/RouteErrorBoundary";
import { RequireRole } from "../auth/RequireRole";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ChatPage } from "../features/chat/ChatPage";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { ClinicianStatusPage } from "../features/clinicians/ClinicianStatusPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { OnboardOrgPage } from "../features/admin/OnboardOrgPage";
import { CostManagementPage } from "../features/admin/CostManagementPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    // Gate first, shell second: an unauthenticated or unauthorized request
    // never renders the sidebar it isn't entitled to.
    element: <RequireRole />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "clinicians", element: <ClinicianStatusPage /> },
          { path: "documents", element: <DocumentsPage /> },
          { path: "chat", element: <ChatPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "onboardOrg", element: <OnboardOrgPage /> },
          { path: "costManagement", element: <CostManagementPage /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
