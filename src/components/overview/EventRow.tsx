import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import {
  computeDaysLeft,
  computeMinutesLeft,
  getEventSeverity,
  type Severity,
} from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import type { MaintenanceEvent } from "@/types";

const dotClass: Record<Severity, string> = {
  green: "bg-status-green",
  yellow: "bg-status-yellow",
  red: "bg-status-red",
  unknown: "bg-muted-foreground/40",
};

const valueClass: Record<Severity, string> = {
  green: "text-status-green",
  yellow: "text-status-yellow",
  red: "text-status-red",
  unknown: "text-muted-foreground",
};

function daysLeftSeverity(days: number | null): Severity {
  if (days == null) return "unknown";
  if (days < 0) return "red";
  if (days <= 30) return "yellow";
  return "green";
}

function hoursLeftSeverity(minutes: number | null): Severity {
  if (minutes == null) return "unknown";
  if (minutes < 0) return "red";
  if (minutes <= 25 * 60) return "yellow";
  return "green";
}

type Props = {
  event: MaintenanceEvent;
  currentTtafMinutes: number | null;
  onEdit: () => void;
  onDelete: () => void;
};

export default function EventRow({
  event,
  currentTtafMinutes,
  onEdit,
  onDelete,
}: Props) {
  const severity = getEventSeverity(event, currentTtafMinutes);
  const daysLeft = computeDaysLeft(event);
  const minutesLeft = computeMinutesLeft(event, currentTtafMinutes);
  const daysSev = daysLeftSeverity(daysLeft);
  const hoursSev = hoursLeftSeverity(minutesLeft);

  return (
    <div className="grid grid-cols-12 items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm">
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span
          className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotClass[severity])}
          title={severity}
        />
        <span className="truncate" title={event.warning}>
          {event.warning}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            event.status === "planned"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-muted text-muted-foreground",
          )}
        >
          {event.status}
        </span>
      </div>

      <div className="col-span-2 flex flex-col">
        <span className="text-xs text-muted-foreground">Due date</span>
        <span className="font-mono">{formatDate(event.expiryDate)}</span>
      </div>

      <div className="col-span-1 flex flex-col">
        <span className="text-xs text-muted-foreground">Days</span>
        <span className={cn("font-mono", valueClass[daysSev])}>
          {daysLeft == null ? "—" : daysLeft}
        </span>
      </div>

      <div className="col-span-2 flex flex-col">
        <span className="text-xs text-muted-foreground">TTAF expiry</span>
        <span className="font-mono">
          {formatMinutesAsDuration(event.timerExpiryTimeMinutes)}
        </span>
      </div>

      <div className="col-span-1 flex flex-col">
        <span className="text-xs text-muted-foreground">Hours left</span>
        <span className={cn("font-mono", valueClass[hoursSev])}>
          {formatHoursLeft(minutesLeft)}
        </span>
      </div>

      <div className="col-span-1 min-w-0">
        <WorkOrderCell
          eventId={event.id}
          value={event.workOrderNumber}
        />
      </div>

      <div className="col-span-1 flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} title="Edit event">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete event"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
