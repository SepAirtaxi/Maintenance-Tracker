import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Eye,
  LayoutGrid,
  LogOut,
  Settings,
  Telescope,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import NotificationBannerStack from "@/components/notifications/NotificationBannerStack";
import logoUrl from "@/img/logo.png";

const navItems = [
  {
    to: "/",
    label: "Overview",
    code: "01",
    icon: LayoutGrid,
    end: true,
    viewerVisible: true,
  },
  {
    to: "/calendar",
    label: "Calendar",
    code: "02",
    icon: CalendarDays,
    end: false,
    viewerVisible: true,
  },
  {
    to: "/forecast",
    label: "Forecast",
    code: "03",
    icon: Telescope,
    end: false,
    viewerVisible: false,
  },
  {
    to: "/settings",
    label: "Settings",
    code: "04",
    icon: Settings,
    end: false,
    viewerVisible: false,
  },
];

export default function Layout() {
  const { profile, isViewer, signOutUser } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOutUser();
    navigate("/login", { replace: true });
  };

  const visibleNavItems = isViewer
    ? navItems.filter((item) => item.viewerVisible)
    : navItems;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-foreground/15 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Hairline filing strip — gives the masthead a publication tell */}
        <div className="border-b border-foreground/10 bg-card/60">
          <div className="container flex h-5 items-center justify-between text-[9px] uppercase tracking-spec text-muted-foreground/80">
            <span>CAT · Maintenance Tracker · v0.1</span>
            <span className="font-mono tabular-nums">
              {new Date()
                .toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
                .replace(/\//g, ".")}
            </span>
          </div>
        </div>

        <div className="container grid grid-cols-[auto_1fr_auto] items-center gap-8 py-3">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt=""
              aria-hidden="true"
              className="h-8 w-auto shrink-0"
            />
            <div className="flex flex-col leading-none">
              <span className="font-display text-base font-semibold tracking-tight text-foreground">
                Maintenance Tracker
              </span>
              <span className="mt-1 text-[9px] uppercase tracking-spec text-muted-foreground">
                Copenhagen AirTaxi · Part-145 / CAMO
              </span>
            </div>
          </div>

          {/* Section index — small caps with hairline-rule active state */}
          <nav className="flex items-end gap-7 justify-self-start ml-4">
            {visibleNavItems.map(({ to, label, code, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-baseline gap-2 pb-2 text-[11px] uppercase tracking-spec transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="font-mono text-[9px] text-muted-foreground/80">
                      {code}
                    </span>
                    <span className="font-semibold">{label}</span>
                    <span
                      className={cn(
                        "absolute -bottom-px left-0 right-0 h-[2px] transition-all",
                        isActive
                          ? "bg-foreground"
                          : "bg-transparent group-hover:bg-foreground/30",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right rail — viewer chip / profile / sign-out */}
          <div className="flex items-center gap-2">
            {isViewer ? (
              <span className="inline-flex items-center gap-1.5 border border-foreground/25 bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-spec text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                View only
              </span>
            ) : (
              profile && (
                <NavLink
                  to="/profile"
                  className="group flex items-center gap-2 border border-transparent px-2 py-1 transition-colors hover:border-foreground/25 hover:bg-card"
                  title={profile.email}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center bg-foreground text-background font-mono text-[10px] font-bold tracking-stamp">
                    {profile.initials}
                  </span>
                  <span className="hidden sm:inline text-xs text-muted-foreground group-hover:text-foreground">
                    {profile.displayName ?? profile.email}
                  </span>
                </NavLink>
              )
            )}
            <button
              type="button"
              onClick={onSignOut}
              title={isViewer ? "Exit viewer" : "Sign out"}
              className="inline-flex h-8 w-8 items-center justify-center border border-foreground/25 bg-card text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="container flex-1 py-6 space-y-3">
        <NotificationBannerStack />
        <Outlet />
      </main>
    </div>
  );
}
