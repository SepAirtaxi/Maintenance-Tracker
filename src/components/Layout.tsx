import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import ProfileSetupGate from "@/components/ProfileSetupGate";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CalendarDays,
  Eye,
  FileText,
  FolderKanban,
  LayoutGrid,
  ListTodo,
  LogOut,
  Settings,
  Tag,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import NotificationBannerStack from "@/components/notifications/NotificationBannerStack";
import {
  subscribeSyncMeta,
  type FlightloggerSyncMeta,
} from "@/services/flightlogger";
import logoUrl from "@/img/logo.png";

function formatTtafSyncStamp(meta: FlightloggerSyncMeta | null): string | null {
  const ts = meta?.lastSuccessAt;
  if (!ts) return null;
  const d = ts.toDate();
  // dd.MM.yyyy HH:mm in Europe/Copenhagen — matches the filing-strip date
  // style and reads as an instrument timestamp.
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/\//g, ".")
    .replace(",", "");
}

// Compact global TTAF sync indicator for the filing strip. Mirrors the per-
// page indicator on OverviewPage but rendered on every route so the user can
// glance up from any view and see when flight hours were last pulled.
function TtafStripIndicator({
  meta,
  loaded,
}: {
  meta: FlightloggerSyncMeta | null;
  loaded: boolean;
}) {
  if (!loaded) return null;

  if (!meta || !meta.lastSuccessAt) {
    return <span>TTAF · not yet synced</span>;
  }

  const stamp = formatTtafSyncStamp(meta);
  if (meta.lastStatus === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sev-red-bg"
        title={meta.lastError ?? "Sync failed"}
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-sev-red-edge"
        />
        TTAF · sync failed{stamp ? ` · last ok ${stamp}` : ""}
      </span>
    );
  }
  return <span>TTAF synced {stamp}</span>;
}

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
    to: "/statement",
    label: "Statement",
    code: "03",
    icon: FileText,
    end: false,
    viewerVisible: false,
  },
  {
    to: "/labels",
    label: "Labels",
    code: "04",
    icon: Tag,
    end: false,
    viewerVisible: false,
  },
  {
    to: "/next-due",
    label: "Next Due",
    code: "05",
    icon: CalendarClock,
    end: false,
    viewerVisible: false,
  },
  {
    to: "/projects",
    label: "Projects",
    code: "06",
    icon: FolderKanban,
    end: false,
    viewerVisible: false,
  },
  {
    to: "/tasks",
    label: "Tasks",
    code: "07",
    icon: ListTodo,
    end: false,
    viewerVisible: false,
  },
];
// Settings is not a work area, so it lives as a gear in the right rail next to
// the profile rather than in the section index.

export default function Layout() {
  const { profile, isViewer, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [syncMeta, setSyncMeta] = useState<FlightloggerSyncMeta | null>(null);
  const [syncMetaLoaded, setSyncMetaLoaded] = useState(false);

  useEffect(
    () =>
      subscribeSyncMeta((m) => {
        setSyncMeta(m);
        setSyncMetaLoaded(true);
      }),
    [],
  );

  // Publish the sticky header's live height as `--header-h`, so things that
  // stick just below it (the Overview jump bar, card scroll targets) follow
  // the header instead of a hardcoded pixel guess.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--header-h",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onSignOut = async () => {
    await signOutUser();
    navigate("/login", { replace: true });
  };

  // A member who has never named themselves is held at the setup gate: their
  // name goes on the maintenance statements they issue. Viewers have no
  // profile at all and are never gated, and the gate stays down until the
  // profile has actually loaded so it can't flash on a slow connection.
  const needsProfileSetup =
    !isViewer && !!profile && !(profile.displayName ?? "").trim();

  // The section index is hidden behind the gate — every route would render the
  // gate anyway, so offering the links would just be a dead end.
  const visibleNavItems = needsProfileSetup
    ? []
    : isViewer
      ? navItems.filter((item) => item.viewerVisible)
      : navItems;

  return (
    <div className="min-h-screen flex flex-col">
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-foreground/15 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Masthead row — deep-navy band (same ink as the tail stamps) so it
            reads apart from the section index below. Wordmark left; sync
            stamp, identity and utilities right. The TTAF stamp lives here (it
            used to have its own filing strip) so flight-hour freshness is
            visible from every route. */}
        <div className="bg-primary text-primary-foreground">
          <div className="container flex h-10 items-center justify-between gap-6">
            {/* Wordmark */}
            <div className="flex shrink-0 items-center gap-2.5">
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                className="h-6 w-auto shrink-0 brightness-0 invert"
              />
              <span className="font-display text-[15px] font-medium leading-none tracking-tight text-primary-foreground">
                Maintenance Tracker
              </span>
            </div>

            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden min-w-0 items-center gap-2.5 font-mono text-[10px] uppercase tracking-spec tabular-nums text-primary-foreground/70 md:flex">
                <TtafStripIndicator meta={syncMeta} loaded={syncMetaLoaded} />
                <span aria-hidden="true" className="text-primary-foreground/30">
                  ·
                </span>
                <span className="shrink-0">
                  {new Date()
                    .toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                    .replace(/\//g, ".")}
                </span>
                <span aria-hidden="true" className="ml-0.5 h-4 w-px bg-primary-foreground/20" />
              </div>

              {/* Right rail — viewer chip / profile / settings / sign-out */}
              <div className="flex shrink-0 items-center gap-1.5">
                {isViewer ? (
                  <span className="inline-flex h-7 items-center gap-1.5 border border-primary-foreground/30 px-2.5 text-[10px] font-semibold uppercase tracking-spec text-primary-foreground/80">
                    <Eye className="h-3.5 w-3.5" />
                    View only
                  </span>
                ) : (
                  profile &&
                  !needsProfileSetup && (
                    <>
                      <NavLink
                        to="/profile"
                        className="group flex h-7 items-center gap-2 border border-transparent pl-0.5 pr-2 transition-colors hover:border-primary-foreground/30 hover:bg-primary-foreground/10"
                        title={profile.email}
                      >
                        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center bg-primary-foreground px-1 text-primary font-mono text-[10px] font-bold tracking-stamp">
                          {profile.initials}
                        </span>
                        <span className="hidden sm:inline text-xs text-primary-foreground/75 group-hover:text-primary-foreground">
                          {profile.displayName ?? profile.email}
                        </span>
                      </NavLink>
                      <NavLink
                        to="/settings"
                        title="Settings"
                        aria-label="Settings"
                        className={({ isActive }) =>
                          cn(
                            "inline-flex h-7 w-7 items-center justify-center border transition-colors",
                            isActive
                              ? "border-primary-foreground bg-primary-foreground text-primary"
                              : "border-primary-foreground/30 text-primary-foreground/75 hover:border-primary-foreground/70 hover:text-primary-foreground",
                          )
                        }
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </NavLink>
                    </>
                  )
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  title={isViewer ? "Exit viewer" : "Sign out"}
                  className="inline-flex h-7 w-7 items-center justify-center border border-primary-foreground/30 text-primary-foreground/75 transition-colors hover:border-primary-foreground/70 hover:text-primary-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section index — its own row, so the masthead never runs out of
            room. Small caps with a hairline-rule active state that sits on
            the header's bottom rule. */}
        {visibleNavItems.length > 0 && (
          <div>
            <nav className="container flex h-8 items-end gap-7 overflow-x-auto [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto [scrollbar-width:none]">
              {visibleNavItems.map(({ to, label, code, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex shrink-0 items-baseline gap-2 pb-1.5 text-[11px] uppercase tracking-spec transition-colors",
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
                          "absolute bottom-0 left-0 right-0 h-[2px] transition-all",
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
          </div>
        )}
      </header>

      <main className="container flex-1 py-6 space-y-3">
        {needsProfileSetup && profile ? (
          <ProfileSetupGate profile={profile} />
        ) : (
          <>
            <NotificationBannerStack />
            <Outlet />
          </>
        )}
      </main>
    </div>
  );
}
