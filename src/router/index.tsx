import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { RouteErrorBoundary } from "../components/common/RouteErrorBoundary";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ChatPage } from "../features/chat/ChatPage";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { ClinicianStatusPage } from "../features/clinicians/ClinicianStatusPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { OnboardOrgPage } from "../features/admin/OnboardOrgPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "clinicians",
        element: <ClinicianStatusPage />,
      },
      {
        path: "documents",
        element: <DocumentsPage />,
      },
      {
        path: "chat",
        element: <ChatPage />,
      },
      {
        path: "reports",
        element: <ReportsPage />,
      },
      {
        path: "onboardOrg",
        element: <OnboardOrgPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
