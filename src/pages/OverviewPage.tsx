import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  Filter,
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
import NoteDialog from "@/components/overview/NoteDialog";
import DefectFormDialog from "@/components/overview/DefectFormDialog";
import DeleteDefectDialog from "@/components/overview/DeleteDefectDialog";
import ResolveDefectDialog from "@/components/overview/ResolveDefectDialog";
import ResolveEventDialog from "@/components/overview/ResolveEventDialog";
import UpcomingEventsDialog from "@/components/overview/UpcomingEventsDialog";
import AuditLogDialog from "@/components/overview/AuditLogDialog";
import { useAuth } from "@/context/AuthContext";
import { subscribeAircraft } from "@/services/aircraft";
import { subscribeEvents } from "@/services/events";
import { subscribeDefects } from "@/services/defects";
import { nextBookingForTail, subscribeBookings } from "@/services/bookings";
import {
  getEventSeverity,
  worstSeverity,
  type Severity,
} from "@/lib/eventStatus";
import type { Aircraft, Booking, Defect, MaintenanceEvent } from "@/types";

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

  const [sortKey, setSortKey] = useState<SortKey>("tail");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filter is session-only; defaults to all aircraft included. We track
  // *excluded* tails so newly-added aircraft are visible by default.
  const [excludedTails, setExcludedTails] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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
  const [auditLogTail, setAuditLogTail] = useState<string | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  useEffect(() => subscribeAircraft(setAircraft), []);
  useEffect(() => subscribeEvents(setAllEvents), []);
  useEffect(() => subscribeDefects(setAllDefects), []);
  useEffect(() => subscribeBookings(setAllBookings), []);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  const fleetTails = useMemo(
    () =>
      (aircraft ?? [])
        .map((a) => a.tailNumber)
        .sort((a, b) => a.localeCompare(b)),
    [aircraft],
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

    const eventsById = new Map<string, MaintenanceEvent>();
    for (const e of allEvents) eventsById.set(e.id, e);

    const defectsById = new Map<string, Defect>();
    for (const d of allDefects) defectsById.set(d.id, d);

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
  }, [aircraft, allEvents, allDefects, allBookings]);

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
      if (excludedTails.has(s.aircraft.tailNumber)) continue;
      (s.airworthy ? aw : gr).push(s);
    }
    aw.sort(sortFn);
    gr.sort(sortFn);
    return { airworthyList: aw, groundedList: gr };
  }, [summaries, sortFn, excludedTails]);

  const includedCount = fleetTails.length - excludedTails.size;
  const allIncluded = excludedTails.size === 0;
  const noneIncluded = includedCount === 0 && fleetTails.length > 0;
  const filterLabel = allIncluded
    ? "All aircraft"
    : noneIncluded
      ? "No aircraft"
      : `${includedCount} of ${fleetTails.length}`;

  const toggleTail = (tail: string) => {
    setExcludedTails((prev) => {
      const next = new Set(prev);
      if (next.has(tail)) next.delete(tail);
      else next.add(tail);
      return next;
    });
  };
  const soloTail = (tail: string) => {
    setExcludedTails(new Set(fleetTails.filter((t) => t !== tail)));
  };
  const selectAllTails = () => setExcludedTails(new Set());
  const deselectAllTails = () => setExcludedTails(new Set(fleetTails));

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
    setBookingPrefillTail(tailNumber);
    setBookingDialogOpen(true);
  };

  const renderCard = (s: AircraftSummary) => (
    <AircraftCard
      key={s.aircraft.tailNumber}
      aircraft={s.aircraft}
      events={s.events}
      defects={s.defects}
      nextBooking={s.nextBooking}
      nextBookingEvent={s.nextBookingEvent}
      nextBookingDefects={s.nextBookingDefects}
      worstSeverity={s.worst}
      airworthy={s.airworthy}
      readOnly={isViewer}
      onOpenEditLog={() => setAuditLogTail(s.aircraft.tailNumber)}
      onUpdateTtaf={() => setTtafTarget(s.aircraft)}
      onAddBooking={() => openAddBooking(s.aircraft.tailNumber)}
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

        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            disabled={fleetTails.length === 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              !allIncluded
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
            title="Filter by tail number"
          >
            <Filter className="h-3 w-3" />
            <span>{filterLabel}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {filterOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-md border bg-card text-foreground shadow-lg">
              <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
                <button
                  type="button"
                  onClick={selectAllTails}
                  disabled={allIncluded}
                  className="text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={deselectAllTails}
                  disabled={noneIncluded || fleetTails.length === 0}
                  className="text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  Unselect all
                </button>
              </div>
              <div className="border-b px-2 py-1 text-[10px] text-muted-foreground">
                Click a tail to show only it. Use the checkbox to add/remove.
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {fleetTails.map((tail) => {
                  const included = !excludedTails.has(tail);
                  return (
                    <div
                      key={tail}
                      className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-secondary/60"
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleTail(tail)}
                        aria-label={`Toggle ${tail}`}
                        className="h-3.5 w-3.5 rounded border-input shrink-0 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => soloTail(tail)}
                        title={`Show only ${tail}`}
                        className="flex-1 min-w-0 text-left font-mono truncate cursor-pointer hover:underline"
                      >
                        {tail}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {airworthyList.length} airworthy
          {groundedList.length > 0 && ` · ${groundedList.length} grounded`}
        </span>
      </div>

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
          {airworthyList.length === 0 && groundedList.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No aircraft match the current filter.{" "}
                <button
                  type="button"
                  onClick={selectAllTails}
                  className="text-primary underline hover:no-underline"
                >
                  Select all
                </button>
                .
              </p>
            </div>
          )}
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
        onOpenChange={setBookingDialogOpen}
        fleet={aircraft ?? []}
        events={allEvents}
        defects={allDefects}
        booking={null}
        prefill={{ tailNumber: bookingPrefillTail }}
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
      />
      <DeleteDefectDialog
        defect={defectDeleteTarget}
        onClose={() => setDefectDeleteTarget(null)}
      />
      <ResolveDefectDialog
        defect={defectResolveTarget}
        onClose={() => setDefectResolveTarget(null)}
      />
      <AuditLogDialog
        tailNumber={auditLogTail}
        onClose={() => setAuditLogTail(null)}
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
