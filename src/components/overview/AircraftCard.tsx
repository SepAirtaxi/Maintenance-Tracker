import { useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import {
  CalendarDays,
  Gauge,
  History,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBookingRange, formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { type Severity } from "@/lib/eventStatus";
import { setAircraftAirworthy } from "@/services/aircraft";
import EventRow, { EVENTS_GRID_COLS } from "@/components/overview/EventRow";
import DefectsList from "@/components/overview/DefectsList";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

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

function isInHangar(
  booking: Aircraft["nextBookedMaintenance"],
  now: Date,
): boolean {
  if (!booking) return false;
  const fromDelta = differenceInCalendarDays(now, booking.from.toDate());
  if (fromDelta < 0) return false; // booking hasn't started yet
  if (!booking.to) return true; // open-ended, in hangar
  const toDelta = differenceInCalendarDays(now, booking.to.toDate());
  return toDelta <= 0; // today is on/before the to date (inclusive)
}

type Props = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
  worstSeverity: Severity;
  airworthy: boolean;
  readOnly?: boolean;
  onOpenEditLog: () => void;
  onUpdateTtaf: () => void;
  onEditBooked: () => void;
  onAddEvent: () => void;
  onEditEvent: (event: MaintenanceEvent) => void;
  onDeleteEvent: (event: MaintenanceEvent) => void;
  onAddDefect: () => void;
  onEditDefect: (defect: Defect) => void;
  onDeleteDefect: (defect: Defect) => void;
  onResolveDefect: (defect: Defect) => void;
};

export default function AircraftCard({
  aircraft,
  events,
  defects,
  worstSeverity,
  airworthy,
  readOnly = false,
  onOpenEditLog,
  onUpdateTtaf,
  onEditBooked,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onAddDefect,
  onEditDefect,
  onDeleteDefect,
  onResolveDefect,
}: Props) {
  const [togglingAirworthy, setTogglingAirworthy] = useState(false);
  const inHangar = isInHangar(aircraft.nextBookedMaintenance, new Date());

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

  const bookingText = aircraft.nextBookedMaintenance
    ? formatBookingRange(
        aircraft.nextBookedMaintenance.from,
        aircraft.nextBookedMaintenance.to,
      )
    : null;

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
                Updated {formatDate(aircraft.updatedAt)}
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
                ? `${formatDate(aircraft.totalTimeUpdatedAt)}${
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

          <div className="grid grid-cols-[14px_3rem_minmax(0,1fr)_22px] items-center gap-x-2 rounded-md border bg-background px-2 py-1 shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Booked
            </span>
            <span className="font-mono tabular-nums text-xs truncate">
              {bookingText ?? (
                <span className="italic text-muted-foreground">not set</span>
              )}
            </span>
            {readOnly ? (
              <span className="justify-self-end" />
            ) : (
              <button
                type="button"
                onClick={onEditBooked}
                title="Edit booked maintenance"
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground justify-self-end"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      {events.length === 0 ? (
        <p className="px-3 py-2 text-xs italic text-muted-foreground bg-card">
          No events. Import flight data or add one manually.
        </p>
      ) : (
        <div className="bg-card">
          {/* Supergroup header: Due at (date+TTAF) and Time left (days+hours) */}
          <div
            className={cn(
              "grid items-end gap-2 px-3 pt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 bg-muted/40",
              EVENTS_GRID_COLS,
            )}
          >
            <span />
            <span />
            <span />
            <span className="col-span-2 border-b border-border/60 pb-0.5">
              Due at
            </span>
            <span className="col-span-2 border-b border-border/60 pb-0.5 text-right">
              Time left
            </span>
            <span />
            <span />
          </div>
          <div
            className={cn(
              "grid items-center gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/40",
              EVENTS_GRID_COLS,
            )}
          >
            <span></span>
            <span>Event</span>
            <span>Status</span>
            <span>Date</span>
            <span>TTAF</span>
            <span className="text-right">Days</span>
            <span className="text-right">Hours</span>
            <span>WO</span>
            <span className="text-right">{readOnly ? "" : "Actions"}</span>
          </div>
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              currentTtafMinutes={aircraft.totalTimeMinutes}
              readOnly={readOnly}
              onEdit={() => onEditEvent(event)}
              onDelete={() => onDeleteEvent(event)}
            />
          ))}
        </div>
      )}

      <DefectsList
        defects={defects}
        readOnly={readOnly}
        onEdit={onEditDefect}
        onDelete={onDeleteDefect}
        onResolve={onResolveDefect}
      />
    </section>
  );
}
