import { Pencil, Trash2 } from "lucide-react";
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
import type { MaintenanceEvent } from "@/types";

// Shared grid template — header row in AircraftCard must use the same one.
// Columns: dot | Event | Status | Due-date | Due-TTAF | Days-left | Hours-left | WO | Actions
export const EVENTS_GRID_COLS =
  "grid-cols-[14px_minmax(0,1fr)_72px_96px_96px_56px_72px_140px_56px]";

const dotClass: Record<Severity, string> = {
  green: "bg-status-green",
  yellow: "bg-status-yellow",
  red: "bg-status-red",
  unknown: "bg-muted-foreground/40",
};

// Severity-tinted "data pill" used for Days / Hrs left.
const severityPill: Record<Severity, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  yellow: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-rose-200 text-rose-900 border-rose-300 font-semibold",
  unknown: "bg-muted/60 text-muted-foreground border-border",
};

// Neutral data pill for Due date and TTAF expiry.
const neutralPill =
  "inline-flex items-center justify-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs tabular-nums shadow-sm";

type Props = {
  event: MaintenanceEvent;
  currentTtafMinutes: number | null;
  readOnly?: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export default function EventRow({
  event,
  currentTtafMinutes,
  readOnly = false,
  onEdit,
  onDelete,
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
      <span
        className={cn("h-2.5 w-2.5 rounded-full", dotClass[severity])}
        title={severity}
      />
      <span className="truncate" title={event.warning}>
        {event.warning}
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
      {/* Due at — date | TTAF */}
      <span className={cn(neutralPill, "justify-self-start")}>
        {formatDate(event.expiryDate)}
      </span>
      <span
        className={cn(
          neutralPill,
          "justify-self-start border-r border-r-border/0",
        )}
      >
        {formatMinutesAsDuration(event.timerExpiryTimeMinutes)}
      </span>
      {/* Time left — days | hours */}
      <span
        className={cn(
          "justify-self-end inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums shadow-sm min-w-[2.25rem]",
          severityPill[daysSev],
        )}
      >
        {daysLeft == null ? "—" : daysLeft}
      </span>
      <span
        className={cn(
          "justify-self-end inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums shadow-sm min-w-[3rem]",
          severityPill[hoursSev],
        )}
      >
        {formatHoursLeft(minutesLeft)}
      </span>
      <WorkOrderCell
        eventId={event.id}
        value={event.workOrderNumber}
        readOnly={readOnly}
      />
      <div className="flex items-center justify-end gap-0.5">
        {!readOnly && (
          <>
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
