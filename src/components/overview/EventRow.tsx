import { CheckCircle2, Hourglass, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import {
  computeDaysLeft,
  computeMinutesLeft,
  getEffectiveTimerExpiryMinutes,
  getEventPlanStatus,
  getEventSeverity,
  severityFromDays,
  severityFromMinutes,
  type PlanStatus,
  type Severity,
} from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import { updateEvent } from "@/services/events";
import type { MaintenanceEvent } from "@/types";

// Shared grid template — header row in AircraftCard and the defects list must
// use the same one so the Status column lines up across event/defect rows.
// Columns: WO | REQ | Event(dot+name) | Status | Due-at(date|TTAF) | Time-left(days|hours) | Actions
// Actions is 108px to fit the defect row's 4 buttons (defer + resolve + edit +
// delete). Events only render 3 buttons there but the extra slack is harmless.
export const EVENTS_GRID_COLS =
  "grid-cols-[72px_72px_minmax(0,1fr)_120px_200px_140px_108px]";

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
  // True when a booking links this event — drives the third "Booked" status.
  booked: boolean;
  readOnly?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResolve: () => void;
  onExtend: () => void;
};

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  unplanned: "no action",
  planned: "WO created",
  booked: "WO + booked",
};

const PLAN_STATUS_CLASS: Record<PlanStatus, string> = {
  unplanned: "bg-rose-100 text-rose-800",
  planned: "bg-amber-100/70 text-amber-800",
  booked: "bg-emerald-100 text-emerald-700",
};

export default function EventRow({
  event,
  currentTtafMinutes,
  booked,
  readOnly = false,
  onEdit,
  onDelete,
  onResolve,
  onExtend,
}: Props) {
  const severity = getEventSeverity(event, currentTtafMinutes);
  const planStatus = getEventPlanStatus(
    event,
    booked ? new Set([event.id]) : new Set(),
  );
  const daysLeft = computeDaysLeft(event);
  const minutesLeft = computeMinutesLeft(event, currentTtafMinutes);
  const daysSev = severityFromDays(daysLeft);
  const hoursSev = severityFromMinutes(minutesLeft);
  const effectiveExpiry = getEffectiveTimerExpiryMinutes(event);
  const extHours =
    event.extensionMinutes != null ? event.extensionMinutes / 60 : null;

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
      <WorkOrderCell
        value={event.requisitionNumber}
        readOnly={readOnly}
        onSave={(req) => updateEvent(event.id, { requisitionNumber: req })}
        placeholder="REQ number"
        editTitle="Click to edit requisition number"
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
          PLAN_STATUS_CLASS[planStatus],
        )}
        title={
          planStatus === "booked"
            ? "WO assigned and a calendar block is linked to this event"
            : planStatus === "planned"
              ? "Work order assigned — no hangar slot booked yet"
              : "No work order assigned yet"
        }
      >
        {PLAN_STATUS_LABEL[planStatus]}
      </span>
      {/* Due at — date | TTAF compartment. The TTAF half shows the extended
          due time when an extension is in effect; a small "+Xh ext" tag below
          flags it so the original isn't silently rewritten. */}
      <div
        className={cn(
          "grid grid-cols-2 divide-x divide-border rounded-md border shadow-sm overflow-hidden",
          extHours != null
            ? "border-amber-400 bg-amber-50"
            : "border-border bg-background",
        )}
        title={
          extHours != null
            ? `Extended +${extHours}h (was ${formatMinutesAsDuration(event.timerExpiryTimeMinutes)})`
            : undefined
        }
      >
        <span className="px-1.5 py-0.5 text-center font-mono text-xs tabular-nums self-center">
          {formatDate(event.expiryDate)}
        </span>
        <span className="px-1 py-0 flex flex-col items-center justify-center leading-tight">
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              extHours != null && "font-semibold text-amber-900",
            )}
          >
            {formatMinutesAsDuration(effectiveExpiry)}
          </span>
          {extHours != null && (
            <span className="text-[9px] font-medium tracking-wide text-amber-700">
              +{extHours}h ext
            </span>
          )}
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
              className={cn(
                "h-6 w-6",
                extHours != null &&
                  "text-amber-700 hover:bg-amber-100 hover:text-amber-800",
              )}
              onClick={onExtend}
              title={
                extHours != null
                  ? `Extension active (+${extHours}h) — click to manage`
                  : "Grant TTAF extension (CAMO, max 5h)"
              }
            >
              <Hourglass className="h-3.5 w-3.5" />
            </Button>
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
