// Which roles may reach which route. One table, two consumers: the sidebar
// renders from it and the router guard enforces it, so a link that is hidden
// cannot also be reachable by typing the URL.
//
// The backend is still the only real enforcer — this stops a user landing on a
// page whose every call will 403.
import type { Role } from "../types";

export interface NavItem {
    to: string;
    label: string;
    icon: string;
    roles: Role[];
    isSpecial?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
    {
        to: "/",
        label: "Dashboard",
        icon: "dashboard",
        roles: ["admin", "compliance_officer", "hr"],
    },
    {
        to: "/clinicians",
        label: "Clinicians",
        icon: "medical_information",
        roles: ["admin", "compliance_officer", "hr", "clinician"],
    },
    {
        to: "/documents",
        label: "Documents",
        icon: "description",
        roles: ["admin", "compliance_officer", "hr", "clinician"],
    },
    {
        to: "/chat",
        label: "AI Chat",
        icon: "forum",
        roles: ["admin", "compliance_officer", "hr", "clinician", "super_admin"],
    },
    {
        to: "/reports",
        label: "Reports",
        icon: "analytics",
        roles: ["admin", "compliance_officer", "hr", "clinician"],
    },
    {
        to: "/onboardOrg",
        label: "Onboard Org",
        icon: "corporate_fare",
        roles: ["super_admin"],
        isSpecial: true,
    },
    {
        to: "/costManagement",
        label: "Cost Management",
        icon: "payments",
        roles: ["super_admin"],
        isSpecial: true,
    },
];

export const navItemsFor = (role: Role | undefined): NavItem[] =>
    role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : [];

/** The route a role should land on when it may not see the one it asked for. */
export const homeRouteFor = (role: Role | undefined): string =>
    navItemsFor(role)[0]?.to ?? "/login";

export function canAccessRoute(
    role: Role | undefined,
    pathname: string,
): boolean {
    if (!role) return false;
    // "/dashboard" is an alias of the index route; everything else matches on
    // its own prefix so nested paths inherit their parent's roles.
    const path = pathname === "/dashboard" ? "/" : pathname;
    const match =
        NAV_ITEMS.find((item) => item.to !== "/" && path.startsWith(item.to)) ??
        NAV_ITEMS.find((item) => item.to === "/");
    return match ? match.roles.includes(role) : false;
}
