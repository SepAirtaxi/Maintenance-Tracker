import { Fragment, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  Gauge,
  History,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  StickyNote,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBookingRange, formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { type Severity } from "@/lib/eventStatus";
import { setAircraftAirworthy } from "@/services/aircraft";
import { isBookingActive } from "@/services/bookings";
import {
  buildBookingGroups,
  describeBookingGroups,
} from "@/lib/bookingDisplay";
import EventRow, { EVENTS_GRID_COLS } from "@/components/overview/EventRow";
import DefectsList from "@/components/overview/DefectsList";
import type {
  Aircraft,
  Booking,
  Defect,
  Location,
  MaintenanceEvent,
} from "@/types";

type Props = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
  nextBooking: Booking | null;
  // The maintenance event linked from `nextBooking.eventId`, if any. Resolved
  // here in the parent so we don't have to thread the events list down.
  nextBookingEvent: MaintenanceEvent | null;
  // Defects linked from `nextBooking.defectIds`. Same render-time-resolution
  // pattern as `nextBookingEvent` — passed in already filtered.
  nextBookingDefects: Defect[];
  worstSeverity: Severity;
  airworthy: boolean;
  bookedEventIds: ReadonlySet<string>;
  bookedDefectIds: ReadonlySet<string>;
  locationsById: ReadonlyMap<string, Location>;
  readOnly?: boolean;
  onOpenEditLog: () => void;
  onUpdateTtaf: () => void;
  onAddBooking: () => void;
  onViewBooking: (booking: Booking) => void;
  onAddEvent: () => void;
  onEditEvent: (event: MaintenanceEvent) => void;
  onDeleteEvent: (event: MaintenanceEvent) => void;
  onResolveEvent: (event: MaintenanceEvent) => void;
  onAddDefect: () => void;
  onEditDefect: (defect: Defect) => void;
  onDeleteDefect: (defect: Defect) => void;
  onResolveDefect: (defect: Defect) => void;
  onEditNote: () => void;
};

const stripe: Record<Severity, string> = {
  red: "border-l-status-red bg-rose-50",
  yellow: "border-l-status-yellow bg-amber-50",
  green: "border-l-status-green bg-emerald-50/70",
  unknown: "border-l-muted-foreground/30 bg-card",
};

const headerBg: Record<Severity, string> = {
  red: "bg-rose-100",
  yellow: "bg-amber-100",
  green: "bg-emerald-100/70",
  unknown: "bg-secondary",
};

export default function AircraftCard({
  aircraft,
  events,
  defects,
  nextBooking,
  nextBookingEvent,
  nextBookingDefects,
  worstSeverity,
  airworthy,
  bookedEventIds,
  bookedDefectIds,
  locationsById,
  readOnly = false,
  onOpenEditLog,
  onUpdateTtaf,
  onAddBooking,
  onViewBooking,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onResolveEvent,
  onAddDefect,
  onEditDefect,
  onDeleteDefect,
  onResolveDefect,
  onEditNote,
}: Props) {
  const [togglingAirworthy, setTogglingAirworthy] = useState(false);
  const inHangar = isBookingActive(nextBooking);
  const bookingGroups = nextBooking
    ? buildBookingGroups(nextBookingEvent, nextBookingDefects)
    : [];
  // First group is the "primary" one — event's group, else first defect group.
  const primaryGroup = bookingGroups[0] ?? null;
  const activeWo = inHangar ? primaryGroup?.wo ?? null : null;

  const onToggleAirworthy = async () => {
    setTogglingAirworthy(true);
    try {
      await setAircraftAirworthy(aircraft.tailNumber, !airworthy);
    } finally {
      setTogglingAirworthy(false);
    }
  };

  const containerClass = airworthy
    ? cn("border-l-4", stripe[worstSeverity])
    : "border-l-4 border-l-destructive bg-muted";
  const headerClass = airworthy ? headerBg[worstSeverity] : "bg-muted/80";

  const bookingText = nextBooking
    ? formatBookingRange(nextBooking.from, nextBooking.to)
    : null;
  const bookingNotes = nextBooking?.notes?.trim() || null;
  const bookingDescription = describeBookingGroups(bookingGroups);
  const bookingLocation = nextBooking?.locationId
    ? locationsById.get(nextBooking.locationId) ?? null
    : null;
  const bookingTitleAttr = [
    `Booked ${bookingText ?? ""}`,
    bookingLocation ? `at ${bookingLocation.name}` : null,
    bookingDescription,
    bookingNotes,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className={cn(
        "rounded-md border shadow-md overflow-hidden",
        containerClass,
      )}
    >
      <header className={cn("border-b", headerClass)}>
        {/* Row 1: identity, status, actions */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-1.5">
          <span className="inline-flex items-center rounded-md bg-foreground text-background px-2.5 py-1 font-mono text-base font-bold tracking-wide shadow-sm">
            {aircraft.tailNumber}
          </span>
          <span className="text-xs text-muted-foreground">
            {aircraft.model}
          </span>

          {readOnly ? (
            <span
              title={airworthy ? "Aircraft is airworthy" : "Aircraft is grounded"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm",
                airworthy
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                  : "border-rose-300 bg-rose-100 text-rose-800",
              )}
            >
              {airworthy ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              {airworthy ? "Airworthy" : "Grounded"}
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleAirworthy}
              disabled={togglingAirworthy}
              title={
                airworthy
                  ? "Click to mark as grounded"
                  : "Click to mark as airworthy"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm transition-colors disabled:opacity-50",
                airworthy
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                  : "border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200",
              )}
            >
              {airworthy ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              {airworthy ? "Airworthy" : "Grounded"}
            </button>
          )}

          {inHangar && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm"
              title="Aircraft is currently in the maintenance hangar"
            >
              <Wrench className="h-3.5 w-3.5" />
              In maintenance
              {activeWo && (
                <span className="ml-1 rounded bg-white/20 px-1 py-0.5 text-[10px] font-mono normal-case tracking-normal">
                  WO: {activeWo}
                </span>
              )}
            </span>
          )}

          {defects.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/70 text-amber-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              <ShieldAlert className="h-3 w-3" />
              {defects.length} defect{defects.length === 1 ? "" : "s"}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {aircraft.updatedAt && (
              <span
                className="text-[10px] text-muted-foreground whitespace-nowrap"
                title="Last update to any data on this aircraft"
              >
                Last updated: {formatDate(aircraft.updatedAt)}
              </span>
            )}
            <div className="flex items-center gap-0.5">
              {!readOnly && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={onAddEvent}
                    title="Add event"
                  >
                    <Plus className="h-3 w-3" />
                    Event
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={onAddDefect}
                    title="Report defect"
                  >
                    <Plus className="h-3 w-3" />
                    Defect
                  </Button>
                  {!aircraft.note && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={onEditNote}
                      title="Add note"
                    >
                      <StickyNote className="h-3 w-3" />
                      Note
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onOpenEditLog}
                title="Show transaction log"
              >
                <History className="h-3 w-3" />
                Log
              </Button>
            </div>
          </div>
        </div>

        {/* Row 2: TTAF + Booked, two equal cells with stable column placement */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-3 pb-1.5">
          <div className="grid grid-cols-[14px_3rem_minmax(0,1fr)_auto_22px] items-center gap-x-2 rounded-md border bg-background px-2 py-1 shadow-sm">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              TTAF
            </span>
            <span className="font-mono font-semibold tabular-nums text-sm">
              {formatMinutesAsDuration(aircraft.totalTimeMinutes)}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap justify-self-end">
              {aircraft.totalTimeUpdatedAt
                ? `Last updated: ${formatDate(aircraft.totalTimeUpdatedAt)}${
                    aircraft.totalTimeSource
                      ? ` · ${aircraft.totalTimeSource}`
                      : ""
                  }`
                : ""}
            </span>
            {readOnly ? (
              <span className="justify-self-end" />
            ) : (
              <button
                type="button"
                onClick={onUpdateTtaf}
                title="Update TTAF manually"
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground justify-self-end"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {nextBooking ? (
            <button
              type="button"
              onClick={() => onViewBooking(nextBooking)}
              title={bookingTitleAttr || "View booking"}
              className={cn(
                "group flex items-center gap-2 rounded-md border px-2 py-1 shadow-sm text-left transition-colors",
                inHangar
                  ? "border-blue-300 bg-blue-50 hover:bg-blue-100"
                  : "border-sky-200 bg-sky-50 hover:bg-sky-100",
              )}
            >
              <CalendarDays
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  inHangar ? "text-blue-700" : "text-sky-700",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider shrink-0",
                  inHangar ? "text-blue-800" : "text-sky-800",
                )}
              >
                {inHangar ? "In hangar" : "Booked"}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums text-xs shrink-0",
                  inHangar ? "text-blue-900" : "text-sky-900",
                )}
              >
                {bookingText}
              </span>
              {bookingLocation && (
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    inHangar
                      ? "bg-blue-100 text-blue-900 border border-blue-300"
                      : "bg-sky-100 text-sky-900 border border-sky-300",
                  )}
                  title={`Location: ${bookingLocation.name}${bookingLocation.kind === "external" ? " (external)" : ""}`}
                >
                  {bookingLocation.kind === "external" ? (
                    <MapPin className="h-2.5 w-2.5" />
                  ) : (
                    <Building2 className="h-2.5 w-2.5" />
                  )}
                  {bookingLocation.name}
                </span>
              )}
              {bookingGroups.length > 0 ? (
                bookingGroups.map((g, gi) => (
                  <Fragment key={gi}>
                    {gi > 0 && (
                      <span
                        className={cn(
                          "shrink-0 opacity-50",
                          inHangar ? "text-blue-800" : "text-sky-800",
                        )}
                      >
                        |
                      </span>
                    )}
                    {g.wo && (
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold",
                          inHangar
                            ? "bg-blue-200 text-blue-900"
                            : "bg-sky-200 text-sky-900",
                        )}
                      >
                        WO: {g.wo}
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink min-w-0 truncate text-[11px]",
                        inHangar ? "text-blue-800/80" : "text-sky-800/80",
                      )}
                    >
                      {g.items.map((it, ii) => (
                        <span
                          key={ii}
                          className={cn(
                            it.resolved && "line-through opacity-60",
                          )}
                        >
                          {ii > 0 ? " · " : ""}
                          {it.resolved && (
                            <Check className="inline h-2.5 w-2.5 mr-0.5" />
                          )}
                          {it.label}
                        </span>
                      ))}
                    </span>
                  </Fragment>
                ))
              ) : bookingNotes ? (
                <span
                  className={cn(
                    "shrink min-w-0 truncate text-[11px] italic",
                    inHangar ? "text-blue-800/80" : "text-sky-800/80",
                  )}
                >
                  · {bookingNotes}
                </span>
              ) : null}
              {bookingNotes && bookingGroups.length > 0 && (
                <StickyNote
                  className={cn(
                    "h-3 w-3 shrink-0",
                    inHangar ? "text-blue-700/80" : "text-sky-700/80",
                  )}
                />
              )}
              {!readOnly && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddBooking();
                  }}
                  title="Add booking for this tail"
                  className={cn(
                    "ml-auto rounded p-0.5 transition-colors",
                    inHangar
                      ? "text-blue-700/70 hover:bg-blue-200 hover:text-blue-900"
                      : "text-sky-700/70 hover:bg-sky-200 hover:text-sky-900",
                  )}
                >
                  <Plus className="h-3 w-3" />
                </span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed bg-background/60 px-2 py-1 text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Booked
              </span>
              <span className="text-xs italic">not set</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onAddBooking}
                  title="Book maintenance slot"
                  className="ml-auto rounded p-0.5 hover:bg-secondary hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {aircraft.note && (
          <div className="px-3 pb-2">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 shadow-sm">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span className="flex-1 whitespace-pre-wrap break-words text-xs text-amber-900">
                {aircraft.note}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onEditNote}
                  title="Edit note"
                  className="rounded p-0.5 text-amber-800/70 hover:bg-amber-100 hover:text-amber-900"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {events.length === 0 ? (
        <p className="px-3 py-2 text-xs italic text-muted-foreground bg-card">
          No events. Import flight data or add one manually.
        </p>
      ) : (
        <div className="bg-card">
          {/* Header row — supergroup labels live inside the compartments */}
          <div
            className={cn(
              "grid items-end gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/40",
              EVENTS_GRID_COLS,
            )}
          >
            <span className="self-end pb-0.5">WO</span>
            <span className="self-end pb-0.5">REQ</span>
            <span className="self-end pb-0.5">Event</span>
            <span className="self-end pb-0.5">Status</span>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted/70 text-center text-[9px] font-bold tracking-wider py-0 border-b border-border text-foreground/80">
                Due at
              </div>
              <div className="grid grid-cols-2 divide-x divide-border text-[9px] text-center">
                <span className="py-0.5">Date</span>
                <span className="py-0.5">TTAF</span>
              </div>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted/70 text-center text-[9px] font-bold tracking-wider py-0 border-b border-border text-foreground/80">
                Time left
              </div>
              <div className="grid grid-cols-2 divide-x divide-border text-[9px] text-center">
                <span className="py-0.5">Days</span>
                <span className="py-0.5">Hours</span>
              </div>
            </div>
            <span className="self-end pb-0.5 text-right">
              {readOnly ? "" : "Actions"}
            </span>
          </div>
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              currentTtafMinutes={aircraft.totalTimeMinutes}
              booked={bookedEventIds.has(event.id)}
              readOnly={readOnly}
              onEdit={() => onEditEvent(event)}
              onDelete={() => onDeleteEvent(event)}
              onResolve={() => onResolveEvent(event)}
            />
          ))}
        </div>
      )}

      <DefectsList
        defects={defects}
        bookedDefectIds={bookedDefectIds}
        readOnly={readOnly}
        onEdit={onEditDefect}
        onDelete={onDeleteDefect}
        onResolve={onResolveDefect}
      />
    </section>
  );
}
