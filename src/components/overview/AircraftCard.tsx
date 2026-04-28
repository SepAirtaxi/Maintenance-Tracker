import { useState } from "react";
import {
  CalendarDays,
  Gauge,
  History,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateRange } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { type Severity } from "@/lib/eventStatus";
import { setAircraftAirworthy } from "@/services/aircraft";
import EventRow, { EVENTS_GRID_COLS } from "@/components/overview/EventRow";
import DefectsList from "@/components/overview/DefectsList";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

const stripe: Record<Severity, string> = {
  red: "border-l-status-red bg-rose-50/50",
  yellow: "border-l-status-yellow bg-amber-50/40",
  green: "border-l-status-green bg-emerald-50/30",
  unknown: "border-l-muted-foreground/30 bg-card",
};

const headerBg: Record<Severity, string> = {
  red: "bg-rose-100/60",
  yellow: "bg-amber-100/50",
  green: "bg-emerald-100/40",
  unknown: "bg-secondary/60",
};

type Props = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
  worstSeverity: Severity;
  airworthy: boolean;
  onOpenEditLog: () => void;
  onUpdateTtaf: () => void;
  onEditBooked: () => void;
  onAddEvent: () => void;
  onEditEvent: (event: MaintenanceEvent) => void;
  onDeleteEvent: (event: MaintenanceEvent) => void;
  onAddDefect: () => void;
  onEditDefect: (defect: Defect) => void;
  onDeleteDefect: (defect: Defect) => void;
};

export default function AircraftCard({
  aircraft,
  events,
  defects,
  worstSeverity,
  airworthy,
  onOpenEditLog,
  onUpdateTtaf,
  onEditBooked,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onAddDefect,
  onEditDefect,
  onDeleteDefect,
}: Props) {
  const [togglingAirworthy, setTogglingAirworthy] = useState(false);

  const onToggleAirworthy = async () => {
    setTogglingAirworthy(true);
    try {
      await setAircraftAirworthy(aircraft.tailNumber, !airworthy);
    } finally {
      setTogglingAirworthy(false);
    }
  };

  // Grounded aircraft override the severity-tint with a muted/destructive look.
  const containerClass = airworthy
    ? cn("border-l-4", stripe[worstSeverity])
    : "border-l-4 border-l-destructive bg-muted/40";
  const headerClass = airworthy
    ? headerBg[worstSeverity]
    : "bg-muted/60";

  return (
    <section
      className={cn(
        "rounded-md border shadow-sm overflow-hidden",
        containerClass,
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b",
          headerClass,
        )}
      >
        {/* Tail number — prominent ticket-style pill */}
        <span className="inline-flex items-center rounded-md bg-foreground text-background px-2.5 py-1 font-mono text-base font-bold tracking-wide shadow-sm">
          {aircraft.tailNumber}
        </span>
        <span className="text-xs text-muted-foreground -ml-1">
          {aircraft.model}
        </span>

        {/* TTAF pill */}
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-sm">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            TTAF
          </span>
          <span className="font-mono font-semibold tabular-nums text-sm">
            {formatMinutesAsDuration(aircraft.totalTimeMinutes)}
          </span>
          <button
            type="button"
            onClick={onUpdateTtaf}
            title="Update TTAF manually"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {aircraft.totalTimeUpdatedAt && (
            <span className="text-[10px] text-muted-foreground">
              {formatDate(aircraft.totalTimeUpdatedAt)}
              {aircraft.totalTimeSource && ` · ${aircraft.totalTimeSource}`}
            </span>
          )}
        </span>

        {/* Booked maintenance pill */}
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Booked
          </span>
          <span className="font-mono tabular-nums text-xs">
            {aircraft.nextBookedMaintenance
              ? formatDateRange(
                  aircraft.nextBookedMaintenance.from,
                  aircraft.nextBookedMaintenance.to,
                )
              : <span className="italic text-muted-foreground">not set</span>}
          </span>
          <button
            type="button"
            onClick={onEditBooked}
            title="Edit booked maintenance"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </span>

        {/* Airworthiness toggle */}
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

        {defects.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/70 text-amber-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            <ShieldAlert className="h-3 w-3" />
            {defects.length} defect{defects.length === 1 ? "" : "s"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
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
      </header>

      {events.length === 0 ? (
        <p className="px-3 py-2 text-xs italic text-muted-foreground bg-card">
          No events. Import flight data or add one manually.
        </p>
      ) : (
        <div className="bg-card">
          <div
            className={cn(
              "grid items-center gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/40",
              EVENTS_GRID_COLS,
            )}
          >
            <span></span>
            <span>Event</span>
            <span>Status</span>
            <span>Due</span>
            <span className="text-right">Days</span>
            <span>TTAF exp.</span>
            <span className="text-right">Hrs left</span>
            <span>WO</span>
            <span className="text-right">Actions</span>
          </div>
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              currentTtafMinutes={aircraft.totalTimeMinutes}
              onEdit={() => onEditEvent(event)}
              onDelete={() => onDeleteEvent(event)}
            />
          ))}
        </div>
      )}

      <DefectsList
        defects={defects}
        onEdit={onEditDefect}
        onDelete={onDeleteDefect}
      />
    </section>
  );
}
