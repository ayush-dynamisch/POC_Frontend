import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccessRoute, homeRouteFor } from "./routeAccess";

/**
 * Gate for every route inside the app shell. Without it each page rendered for
 * every role and only hid its own contents, so a clinician could open
 * /onboardOrg; and with no session at all the shell rendered a placeholder
 * identity instead of sending the user to sign in.
 */
export const RequireRole: React.FC = () => {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#f8f9ff] text-sm text-[#57605f] gap-2">
                <span className="material-symbols-outlined animate-spin text-[#0a6659]">
                    sync
                </span>
                <span>Restoring your session...</span>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    if (!canAccessRoute(user.role, location.pathname)) {
        return <Navigate to={homeRouteFor(user.role)} replace />;
    }

    return <Outlet />;
};
