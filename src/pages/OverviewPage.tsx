import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ShieldOff,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AircraftCard from "@/components/overview/AircraftCard";
import EventFormDialog from "@/components/overview/EventFormDialog";
import DeleteEventDialog from "@/components/overview/DeleteEventDialog";
import ImportDialog from "@/components/overview/ImportDialog";
import TtafDialog from "@/components/overview/TtafDialog";
import BookingDialog from "@/components/calendar/BookingDialog";
import BookingViewDialog from "@/components/calendar/BookingViewDialog";
import NoteDialog from "@/components/overview/NoteDialog";
import DefectFormDialog from "@/components/overview/DefectFormDialog";
import DeleteDefectDialog from "@/components/overview/DeleteDefectDialog";
import ResolveDefectDialog from "@/components/overview/ResolveDefectDialog";
import ResolveEventDialog from "@/components/overview/ResolveEventDialog";
import UpcomingEventsDialog from "@/components/overview/UpcomingEventsDialog";
import HistoryDialog from "@/components/overview/HistoryDialog";
import { useAuth } from "@/context/AuthContext";
import { subscribeAircraft } from "@/services/aircraft";
import { subscribeEvents } from "@/services/events";
import { subscribeDefects } from "@/services/defects";
import { nextBookingForTail, subscribeBookings } from "@/services/bookings";
import { subscribeLocations } from "@/services/locations";
import { subscribeUsers } from "@/services/users";
import {
  buildBookedIdSets,
  getEventSeverity,
  worstSeverity,
  type Severity,
} from "@/lib/eventStatus";
import type {
  Aircraft,
  Booking,
  Defect,
  Location,
  MaintenanceEvent,
  UserProfile,
} from "@/types";

const EVENT_SEVERITY_ORDER: Record<Severity, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  unknown: 3,
};

function sortEvents(
  events: MaintenanceEvent[],
  currentTtafMinutes: number | null,
): MaintenanceEvent[] {
  return [...events].sort((a, b) => {
    const sa = getEventSeverity(a, currentTtafMinutes);
    const sb = getEventSeverity(b, currentTtafMinutes);
    const diff = EVENT_SEVERITY_ORDER[sa] - EVENT_SEVERITY_ORDER[sb];
    if (diff !== 0) return diff;
    const da = a.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    const db = b.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

type SortKey = "severity" | "tail" | "model" | "ttaf" | "due";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "severity", label: "Severity", defaultDir: "desc" },
  { key: "tail", label: "Tail", defaultDir: "asc" },
  { key: "model", label: "Model", defaultDir: "asc" },
  { key: "ttaf", label: "TTAF", defaultDir: "desc" },
  { key: "due", label: "Next due", defaultDir: "asc" },
];

const FLEET_SEVERITY_RANK: Record<Severity, number> = {
  unknown: 0,
  green: 1,
  yellow: 2,
  red: 3,
};

const PILL_TINT: Record<Severity, string> = {
  red: "border-status-red/50 bg-rose-50 text-rose-900 hover:bg-rose-100",
  yellow:
    "border-status-yellow/60 bg-amber-50 text-amber-900 hover:bg-amber-100",
  green:
    "border-status-green/50 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  unknown:
    "border-border bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
};

const PILL_TINT_ACTIVE: Record<Severity, string> = {
  red: "border-status-red bg-rose-100 text-rose-950 ring-2 ring-status-red/40",
  yellow:
    "border-status-yellow bg-amber-100 text-amber-950 ring-2 ring-status-yellow/40",
  green:
    "border-status-green bg-emerald-100 text-emerald-950 ring-2 ring-status-green/40",
  unknown: "border-primary bg-primary/10 text-foreground ring-2 ring-primary/30",
};

function TailPill({
  tail,
  severity,
  active,
  grounded = false,
  onClick,
}: {
  tail: string;
  severity: Severity;
  active: boolean;
  grounded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={grounded ? `${tail} (grounded)` : tail}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-xs transition-colors",
        active ? PILL_TINT_ACTIVE[severity] : PILL_TINT[severity],
        grounded && "opacity-60",
      )}
    >
      {grounded && <ShieldOff className="h-3 w-3" />}
      {tail}
    </button>
  );
}

type AircraftSummary = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
  nextBooking: Booking | null;
  nextBookingEvent: MaintenanceEvent | null;
  nextBookingDefects: Defect[];
  worst: Severity;
  earliestDueMillis: number | null;
  airworthy: boolean;
};

function compareNullable(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls always last
  if (b == null) return -1;
  return (a - b) * dir;
}

export default function OverviewPage() {
  const { isViewer } = useAuth();
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);
  const [allEvents, setAllEvents] = useState<MaintenanceEvent[]>([]);
  const [allDefects, setAllDefects] = useState<Defect[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("tail");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Tracks which aircraft card is currently in the viewport "reading zone"
  // (just below the sticky header + jump bar) so the matching pill can light
  // up. Updated by the IntersectionObserver below.
  const [activeTail, setActiveTail] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const visibleTails = useRef<Set<string>>(new Set());

  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventFormTail, setEventFormTail] = useState<string>("");
  const [eventFormTarget, setEventFormTarget] =
    useState<MaintenanceEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceEvent | null>(
    null,
  );
  const [resolveEventTarget, setResolveEventTarget] =
    useState<MaintenanceEvent | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ttafTarget, setTtafTarget] = useState<Aircraft | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingPrefillTail, setBookingPrefillTail] = useState<string>("");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [noteTarget, setNoteTarget] = useState<Aircraft | null>(null);

  const [defectFormOpen, setDefectFormOpen] = useState(false);
  const [defectFormTail, setDefectFormTail] = useState("");
  const [defectFormTarget, setDefectFormTarget] = useState<Defect | null>(null);
  const [defectDeleteTarget, setDefectDeleteTarget] = useState<Defect | null>(
    null,
  );
  const [defectResolveTarget, setDefectResolveTarget] = useState<Defect | null>(
    null,
  );
  const [historyTail, setHistoryTail] = useState<string | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  useEffect(() => subscribeAircraft(setAircraft), []);
  useEffect(() => subscribeEvents(setAllEvents), []);
  useEffect(() => subscribeDefects(setAllDefects), []);
  useEffect(() => subscribeBookings(setAllBookings), []);
  useEffect(() => subscribeLocations(setAllLocations), []);
  useEffect(() => subscribeUsers(setAllUsers), []);

  const usersByUid = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const u of allUsers) m.set(u.uid, u);
    return m;
  }, [allUsers]);

  const historyDefects = useMemo(
    () =>
      historyTail
        ? allDefects.filter((d) => d.tailNumber === historyTail)
        : [],
    [historyTail, allDefects],
  );

  const historyEvents = useMemo(
    () =>
      historyTail
        ? allEvents.filter((e) => e.tailNumber === historyTail)
        : [],
    [historyTail, allEvents],
  );

  const defectFormTailDefects = useMemo(
    () =>
      defectFormTail
        ? allDefects.filter((d) => d.tailNumber === defectFormTail)
        : [],
    [defectFormTail, allDefects],
  );

  const eventsById = useMemo(() => {
    const m = new Map<string, MaintenanceEvent>();
    for (const e of allEvents) m.set(e.id, e);
    return m;
  }, [allEvents]);

  const defectsById = useMemo(() => {
    const m = new Map<string, Defect>();
    for (const d of allDefects) m.set(d.id, d);
    return m;
  }, [allDefects]);

  const locationsById = useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of allLocations) m.set(l.id, l);
    return m;
  }, [allLocations]);

  const bookedIds = useMemo(
    () => buildBookedIdSets(allBookings, eventsById, defectsById),
    [allBookings, eventsById, defectsById],
  );

  const summaries: AircraftSummary[] = useMemo(() => {
    if (!aircraft) return [];
    const eventsByTail = new Map<string, MaintenanceEvent[]>();
    for (const e of allEvents) {
      if (e.resolvedAt) continue; // closed events stay as legacy in Firestore
      const arr = eventsByTail.get(e.tailNumber) ?? [];
      arr.push(e);
      eventsByTail.set(e.tailNumber, arr);
    }
    const defectsByTail = new Map<string, Defect[]>();
    for (const d of allDefects) {
      if (d.resolvedAt) continue; // resolved defects stay as legacy in Firestore
      const arr = defectsByTail.get(d.tailNumber) ?? [];
      arr.push(d);
      defectsByTail.set(d.tailNumber, arr);
    }

    return aircraft.map((a) => {
      const events = eventsByTail.get(a.tailNumber) ?? [];
      let worst: Severity = "unknown";
      let earliestDueMillis: number | null = null;
      for (const e of events) {
        const s = getEventSeverity(e, a.totalTimeMinutes);
        worst = worstSeverity(worst, s);
        const due = e.expiryDate?.toMillis() ?? null;
        if (
          due != null &&
          (earliestDueMillis == null || due < earliestDueMillis)
        ) {
          earliestDueMillis = due;
        }
      }
      const nextBooking = nextBookingForTail(allBookings, a.tailNumber);
      const nextBookingEvent =
        nextBooking?.eventId ? eventsById.get(nextBooking.eventId) ?? null : null;
      const nextBookingDefects = (nextBooking?.defectIds ?? [])
        .map((id) => defectsById.get(id))
        .filter((d): d is Defect => !!d);
      return {
        aircraft: a,
        events: sortEvents(events, a.totalTimeMinutes),
        defects: defectsByTail.get(a.tailNumber) ?? [],
        nextBooking,
        nextBookingEvent,
        nextBookingDefects,
        worst,
        earliestDueMillis,
        airworthy: a.airworthy !== false,
      };
    });
  }, [aircraft, allEvents, allDefects, allBookings, eventsById, defectsById]);

  const sortFn = useMemo(() => {
    const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
    const tieBreaker = (a: AircraftSummary, b: AircraftSummary) =>
      a.aircraft.tailNumber.localeCompare(b.aircraft.tailNumber);
    return (a: AircraftSummary, b: AircraftSummary) => {
      let cmp = 0;
      switch (sortKey) {
        case "severity":
          cmp =
            (FLEET_SEVERITY_RANK[a.worst] - FLEET_SEVERITY_RANK[b.worst]) * dir;
          break;
        case "tail":
          cmp =
            a.aircraft.tailNumber.localeCompare(b.aircraft.tailNumber) * dir;
          break;
        case "model":
          cmp = a.aircraft.model.localeCompare(b.aircraft.model) * dir;
          break;
        case "ttaf":
          cmp = compareNullable(
            a.aircraft.totalTimeMinutes,
            b.aircraft.totalTimeMinutes,
            dir,
          );
          break;
        case "due":
          cmp = compareNullable(a.earliestDueMillis, b.earliestDueMillis, dir);
          break;
      }
      return cmp !== 0 ? cmp : tieBreaker(a, b);
    };
  }, [sortKey, sortDir]);

  const { airworthyList, groundedList } = useMemo(() => {
    const aw: AircraftSummary[] = [];
    const gr: AircraftSummary[] = [];
    for (const s of summaries) {
      (s.airworthy ? aw : gr).push(s);
    }
    aw.sort(sortFn);
    gr.sort(sortFn);
    return { airworthyList: aw, groundedList: gr };
  }, [summaries, sortFn]);

  // Pills are sorted alphabetically and stay in fixed positions regardless of
  // the card sort order — that keeps muscle memory intact when jumping.
  const { airworthyPills, groundedPills } = useMemo(() => {
    const sorted = [...summaries].sort((a, b) =>
      a.aircraft.tailNumber.localeCompare(b.aircraft.tailNumber),
    );
    return {
      airworthyPills: sorted.filter((s) => s.airworthy),
      groundedPills: sorted.filter((s) => !s.airworthy),
    };
  }, [summaries]);

  const jumpToTail = (tail: string) => {
    const el = cardRefs.current.get(tail);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveTail(tail);
  };

  // Scrollspy: highlight the pill whose card sits in the top ~35% band of the
  // viewport (just below the sticky header + jump bar). When several cards
  // intersect at once, the topmost one wins so the active pill tracks the
  // card you're currently reading.
  useEffect(() => {
    if (summaries.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const tail = (entry.target as HTMLElement).dataset.tail;
          if (!tail) continue;
          if (entry.isIntersecting) visibleTails.current.add(tail);
          else visibleTails.current.delete(tail);
        }
        let topTail: string | null = null;
        let topPos = Number.POSITIVE_INFINITY;
        for (const tail of visibleTails.current) {
          const el = cardRefs.current.get(tail);
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top < topPos) {
            topPos = top;
            topTail = tail;
          }
        }
        if (topTail) setActiveTail(topTail);
      },
      { rootMargin: "-100px 0px -65% 0px" },
    );
    for (const el of cardRefs.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      visibleTails.current.clear();
    };
  }, [summaries.length, airworthyList, groundedList]);

  const onSortClick = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const opt = SORT_OPTIONS.find((o) => o.key === key);
      setSortDir(opt?.defaultDir ?? "asc");
    }
  };

  const openAddDefect = (tailNumber: string) => {
    setDefectFormTail(tailNumber);
    setDefectFormTarget(null);
    setDefectFormOpen(true);
  };

  const openEditDefect = (defect: Defect) => {
    setDefectFormTail(defect.tailNumber);
    setDefectFormTarget(defect);
    setDefectFormOpen(true);
  };

  const openAddEvent = (tailNumber: string) => {
    setEventFormTail(tailNumber);
    setEventFormTarget(null);
    setEventFormOpen(true);
  };

  const openEditEvent = (event: MaintenanceEvent) => {
    setEventFormTail(event.tailNumber);
    setEventFormTarget(event);
    setEventFormOpen(true);
  };

  const openAddBooking = (tailNumber: string) => {
    setEditingBooking(null);
    setBookingPrefillTail(tailNumber);
    setBookingDialogOpen(true);
  };

  // Keep the view dialog showing live data if the booking is updated upstream.
  const liveViewingBooking = useMemo(() => {
    if (!viewingBooking) return null;
    return allBookings.find((b) => b.id === viewingBooking.id) ?? viewingBooking;
  }, [allBookings, viewingBooking]);

  const promoteViewToEdit = () => {
    if (!viewingBooking) return;
    const target = viewingBooking;
    setViewingBooking(null);
    setEditingBooking(target);
    setBookingPrefillTail("");
    setBookingDialogOpen(true);
  };

  const setCardRef = (tail: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(tail, el);
    else cardRefs.current.delete(tail);
  };

  const renderCard = (s: AircraftSummary) => (
    <div
      key={s.aircraft.tailNumber}
      ref={setCardRef(s.aircraft.tailNumber)}
      data-tail={s.aircraft.tailNumber}
      className="scroll-mt-24"
    >
    <AircraftCard
      aircraft={s.aircraft}
      events={s.events}
      defects={s.defects}
      nextBooking={s.nextBooking}
      nextBookingEvent={s.nextBookingEvent}
      nextBookingDefects={s.nextBookingDefects}
      worstSeverity={s.worst}
      airworthy={s.airworthy}
      bookedEventIds={bookedIds.eventIds}
      bookedDefectIds={bookedIds.defectIds}
      locationsById={locationsById}
      readOnly={isViewer}
      onOpenEditLog={() => setHistoryTail(s.aircraft.tailNumber)}
      onUpdateTtaf={() => setTtafTarget(s.aircraft)}
      onAddBooking={() => openAddBooking(s.aircraft.tailNumber)}
      onViewBooking={setViewingBooking}
      onAddEvent={() => openAddEvent(s.aircraft.tailNumber)}
      onEditEvent={openEditEvent}
      onDeleteEvent={setDeleteTarget}
      onResolveEvent={setResolveEventTarget}
      onAddDefect={() => openAddDefect(s.aircraft.tailNumber)}
      onEditDefect={openEditDefect}
      onDeleteDefect={setDefectDeleteTarget}
      onResolveDefect={setDefectResolveTarget}
      onEditNote={() => setNoteTarget(s.aircraft)}
    />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Maintenance Overview
          </h1>
          <p className="text-xs text-muted-foreground">
            Fleet status, grouped by tail number.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setUpcomingOpen(true)}
            size="sm"
            variant="outline"
          >
            <CalendarClock className="h-4 w-4" />
            Upcoming events
          </Button>
          {!isViewer && (
            <Button onClick={() => setImportOpen(true)} size="sm">
              <Upload className="h-4 w-4" />
              Import flight data
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card shadow-sm px-2 py-1.5">
        <span className="text-xs text-muted-foreground mr-1">Sort:</span>
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sortKey;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSortClick(opt.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {opt.label}
              {active &&
                (sortDir === "asc" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                ))}
            </button>
          );
        })}

        <span className="ml-auto text-xs text-muted-foreground">
          {airworthyList.length} airworthy
          {groundedList.length > 0 && ` · ${groundedList.length} grounded`}
        </span>
      </div>

      {summaries.length > 0 && (
        <div className="sticky top-14 z-30 flex flex-wrap items-center gap-1 rounded-md border bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <span className="text-xs text-muted-foreground mr-1">Jump to:</span>
          {airworthyPills.map((s) => (
            <TailPill
              key={s.aircraft.tailNumber}
              tail={s.aircraft.tailNumber}
              severity={s.worst}
              active={s.aircraft.tailNumber === activeTail}
              onClick={() => jumpToTail(s.aircraft.tailNumber)}
            />
          ))}
          {groundedPills.length > 0 && (
            <>
              <span
                className="mx-1 h-4 w-px bg-border"
                aria-hidden="true"
              />
              {groundedPills.map((s) => (
                <TailPill
                  key={s.aircraft.tailNumber}
                  tail={s.aircraft.tailNumber}
                  severity={s.worst}
                  grounded
                  active={s.aircraft.tailNumber === activeTail}
                  onClick={() => jumpToTail(s.aircraft.tailNumber)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {aircraft === null && (
        <p className="text-sm text-muted-foreground">Loading fleet…</p>
      )}
      {aircraft !== null && aircraft.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No aircraft yet. Head over to the <b>Aircraft</b> tab and click{" "}
            <b>Seed fleet</b> to get started.
          </p>
        </div>
      )}
      {aircraft && aircraft.length > 0 && (
        <>
          <div className="space-y-2">{airworthyList.map(renderCard)}</div>

          {groundedList.length > 0 && (
            <div className="pt-4 space-y-2">
              <div className="flex items-center gap-2 px-1">
                <ShieldOff className="h-4 w-4 text-destructive" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-destructive">
                  Grounded ({groundedList.length})
                </h2>
                <div className="flex-1 border-t border-destructive/30 ml-2" />
              </div>
              {groundedList.map(renderCard)}
            </div>
          )}
        </>
      )}

      <EventFormDialog
        open={eventFormOpen}
        onOpenChange={setEventFormOpen}
        tailNumber={eventFormTail}
        event={eventFormTarget}
      />
      <DeleteEventDialog
        event={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
      <ResolveEventDialog
        event={resolveEventTarget}
        onClose={() => setResolveEventTarget(null)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <TtafDialog
        aircraft={ttafTarget}
        onClose={() => setTtafTarget(null)}
      />
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={(open) => {
          setBookingDialogOpen(open);
          if (!open) setEditingBooking(null);
        }}
        fleet={aircraft ?? []}
        events={allEvents}
        defects={allDefects}
        booking={editingBooking}
        prefill={{ tailNumber: bookingPrefillTail }}
      />
      <BookingViewDialog
        booking={liveViewingBooking}
        events={allEvents}
        defects={allDefects}
        locations={allLocations}
        onClose={() => setViewingBooking(null)}
        onEdit={promoteViewToEdit}
        readOnly={isViewer}
      />
      <NoteDialog
        aircraft={noteTarget}
        onClose={() => setNoteTarget(null)}
      />
      <DefectFormDialog
        open={defectFormOpen}
        onOpenChange={setDefectFormOpen}
        tailNumber={defectFormTail}
        defect={defectFormTarget}
        tailDefects={defectFormTailDefects}
      />
      <DeleteDefectDialog
        defect={defectDeleteTarget}
        onClose={() => setDefectDeleteTarget(null)}
      />
      <ResolveDefectDialog
        defect={defectResolveTarget}
        onClose={() => setDefectResolveTarget(null)}
      />
      <HistoryDialog
        tailNumber={historyTail}
        defects={historyDefects}
        events={historyEvents}
        usersByUid={usersByUid}
        onClose={() => setHistoryTail(null)}
      />
      <UpcomingEventsDialog
        open={upcomingOpen}
        onOpenChange={setUpcomingOpen}
        aircraft={aircraft ?? []}
        events={allEvents.filter((e) => !e.resolvedAt)}
      />
    </div>
  );
}
