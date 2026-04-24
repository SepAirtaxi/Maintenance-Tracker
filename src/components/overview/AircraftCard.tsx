import { History, Pencil, Plane, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateRange } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import EventRow from "@/components/overview/EventRow";
import DefectsList from "@/components/overview/DefectsList";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

type Props = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
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
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex items-start justify-between gap-4 p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Plane className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-mono font-semibold tracking-tight">
                {aircraft.tailNumber}
              </h2>
              <span className="text-sm text-muted-foreground">
                {aircraft.model}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                TTAF:{" "}
                <span className="font-mono text-foreground">
                  {formatMinutesAsDuration(aircraft.totalTimeMinutes)}
                </span>
                <button
                  type="button"
                  onClick={onUpdateTtaf}
                  title="Update TTAF manually"
                  className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                {aircraft.totalTimeUpdatedAt && (
                  <>
                    {" "}
                    · updated {formatDate(aircraft.totalTimeUpdatedAt)}
                    {aircraft.totalTimeSource &&
                      ` (${aircraft.totalTimeSource})`}
                  </>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                Next booked maintenance:{" "}
                <button
                  type="button"
                  onClick={onEditBooked}
                  className="text-foreground rounded px-1 hover:bg-secondary hover:underline"
                  title="Edit booked maintenance"
                >
                  {formatDateRange(
                    aircraft.nextBookedMaintenance?.from,
                    aircraft.nextBookedMaintenance?.to,
                  )}
                </button>
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenEditLog}
          title="Show transaction log"
        >
          <History className="h-4 w-4" />
          Edit log
        </Button>
      </header>

      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Events{events.length > 0 && ` (${events.length})`}
          </h3>
          <Button variant="ghost" size="sm" onClick={onAddEvent}>
            <Plus className="h-3.5 w-3.5" />
            Add event
          </Button>
        </div>
        <div className="mt-2 rounded-md border">
          {events.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No events. Import flight data or add one manually.
            </p>
          )}
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

        <div className="mt-4">
          <DefectsList
            defects={defects}
            onAdd={onAddDefect}
            onEdit={onEditDefect}
            onDelete={onDeleteDefect}
          />
        </div>
      </div>
    </section>
  );
}
