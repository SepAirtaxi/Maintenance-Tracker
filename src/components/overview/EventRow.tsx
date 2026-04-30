import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import {
  computeDaysLeft,
  computeMinutesLeft,
  getEventSeverity,
  severityFromDays,
  severityFromMinutes,
  type Severity,
} from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import { updateEvent } from "@/services/events";
import type { MaintenanceEvent } from "@/types";

// Shared grid template — header row in AircraftCard must use the same one.
// Columns: WO | Event(dot+name) | Status | Due-at(date|TTAF) | Time-left(days|hours) | Actions
export const EVENTS_GRID_COLS =
  "grid-cols-[72px_minmax(0,1fr)_84px_200px_140px_84px]";

const dotClass: Record<Severity, string> = {
  green: "bg-status-green",
  yellow: "bg-status-yellow",
  red: "bg-status-red",
  unknown: "bg-muted-foreground/40",
};

// Severity tints applied per-half inside the Time Left compartment.
const severityHalf: Record<Severity, string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-rose-200 text-rose-900 font-semibold",
  unknown: "bg-background text-muted-foreground",
};

type Props = {
  event: MaintenanceEvent;
  currentTtafMinutes: number | null;
  readOnly?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResolve: () => void;
};

export default function EventRow({
  event,
  currentTtafMinutes,
  readOnly = false,
  onEdit,
  onDelete,
  onResolve,
}: Props) {
  const severity = getEventSeverity(event, currentTtafMinutes);
  const daysLeft = computeDaysLeft(event);
  const minutesLeft = computeMinutesLeft(event, currentTtafMinutes);
  const daysSev = severityFromDays(daysLeft);
  const hoursSev = severityFromMinutes(minutesLeft);

  return (
    <div
      className={cn(
        "grid items-center gap-2 px-3 py-1 border-t text-xs hover:bg-muted/30",
        EVENTS_GRID_COLS,
      )}
    >
      <WorkOrderCell
        value={event.workOrderNumber}
        readOnly={readOnly}
        onSave={(wo) => updateEvent(event.id, { workOrderNumber: wo })}
      />
      <span className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotClass[severity])}
          title={severity}
        />
        <span className="truncate" title={event.warning}>
          {event.warning}
        </span>
      </span>
      <span
        className={cn(
          "justify-self-start rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
          event.status === "planned"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100/70 text-amber-800",
        )}
      >
        {event.status}
      </span>
      {/* Due at — date | TTAF compartment */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-md border border-border bg-background shadow-sm overflow-hidden">
        <span className="px-1.5 py-0.5 text-center font-mono text-xs tabular-nums">
          {formatDate(event.expiryDate)}
        </span>
        <span className="px-1.5 py-0.5 text-center font-mono text-xs tabular-nums">
          {formatMinutesAsDuration(event.timerExpiryTimeMinutes)}
        </span>
      </div>
      {/* Time left — days | hours compartment with per-half severity tint */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-md border border-border shadow-sm overflow-hidden">
        <span
          className={cn(
            "px-1.5 py-0.5 text-center font-mono text-xs tabular-nums",
            severityHalf[daysSev],
          )}
        >
          {daysLeft == null ? "—" : daysLeft}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.5 text-center font-mono text-xs tabular-nums",
            severityHalf[hoursSev],
          )}
        >
          {formatHoursLeft(minutesLeft)}
        </span>
      </div>
      <div className="flex items-center justify-end gap-0.5">
        {!readOnly && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
              onClick={onResolve}
              title="Close event (mark complete)"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onEdit}
              title="Edit event"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onDelete}
              title="Delete event"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
