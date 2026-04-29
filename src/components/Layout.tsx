import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Eye, Plane, LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/aircraft", label: "Aircraft", icon: Plane, end: false },
];

export default function Layout() {
  const { profile, isViewer, signOutUser } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOutUser();
    navigate("/login", { replace: true });
  };

  const visibleNavItems = isViewer
    ? navItems.filter((item) => item.to === "/")
    : navItems;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-14 items-center gap-6">
          <span className="font-semibold tracking-tight">
            CAT Maintenance Tracker
          </span>
          <nav className="flex items-center gap-1">
            {visibleNavItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {isViewer ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1 text-xs font-medium text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                View only
              </span>
            ) : (
              profile && (
                <NavLink
                  to="/profile"
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-secondary"
                  title={profile.email}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    {profile.initials}
                  </span>
                  <span className="hidden sm:inline text-muted-foreground">
                    {profile.displayName ?? profile.email}
                  </span>
                </NavLink>
              )
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onSignOut}
              title={isViewer ? "Exit viewer" : "Sign out"}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
}
