import { CheckCircle2, Hourglass, Pencil, Trash2 } from "lucide-react";
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
  type BookingPhase,
  type Severity,
} from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import PlanStatusPill from "@/components/overview/PlanStatusPill";
import { updateEvent } from "@/services/events";
import type { MaintenanceEvent } from "@/types";
import FullTextTitle from "./FullTextTitle";

// Shared grid template — header row in AircraftCard and the defects list must
// use the same one so the Status column lines up across event / defect rows.
// Columns: WOQ | WO | Event(square+name) | Status | Due-date | Due-TTAF | Days-left | Hours-left | Actions
// The compartments that used to be nested mini-grids are now flat cells with
// hairline dividers — the table reads like a ledger instead of a UI.
// WOQ / WO are 100px — fits the ERP's 11-char ids (e.g. "WOQ26-00024") in
// 11px mono without truncating. Status is 210px for the longest small-caps
// pill, "WOQ + booking created".
export const EVENTS_GRID_COLS =
  "grid-cols-[100px_100px_minmax(0,1fr)_210px_100px_104px_70px_70px_112px]";

const sevSquare: Record<Severity, string> = {
  green: "bg-sev-green-edge",
  yellow: "bg-sev-yellow-edge",
  red: "bg-sev-red-edge",
  unknown: "bg-foreground/25",
};

// Severity tints for the days/hours cells — restrained, no candy washes.
const severityHalf: Record<Severity, string> = {
  green: "bg-sev-green-bg text-sev-green-fg",
  yellow: "bg-sev-yellow-bg text-sev-yellow-fg",
  red: "bg-sev-red-bg text-sev-red-fg font-semibold",
  unknown: "bg-transparent text-muted-foreground",
};

type Props = {
  event: MaintenanceEvent;
  currentTtafMinutes: number | null;
  // True when a booking links this event — drives the third "Booked" status.
  // Where this event stands against its linked hangar bookings, if any.
  bookingPhase: BookingPhase | undefined;
  readOnly?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResolve: () => void;
  onExtend: () => void;
};

export default function EventRow({
  event,
  currentTtafMinutes,
  bookingPhase,
  readOnly = false,
  onEdit,
  onDelete,
  onResolve,
  onExtend,
}: Props) {
  const severity = getEventSeverity(event, currentTtafMinutes);
  const planStatus = getEventPlanStatus(event, bookingPhase);
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
        "grid items-center gap-0 px-3 py-1 border-t border-foreground/10 text-xs hover:bg-foreground/[0.025]",
        EVENTS_GRID_COLS,
      )}
    >
      <div className="pr-2">
        <WorkOrderCell
          value={event.quoteNumber}
          readOnly={readOnly}
          onSave={(woq) => updateEvent(event.id, { quoteNumber: woq })}
          placeholder="WOQ number"
          editTitle="Click to edit work order quote number"
        />
      </div>
      <div className="pr-2">
        <WorkOrderCell
          value={event.workOrderNumber}
          readOnly={readOnly}
          onSave={(wo) => updateEvent(event.id, { workOrderNumber: wo })}
        />
      </div>
      <span className="flex items-center gap-2 min-w-0 pr-2">
        <span
          className={cn("h-2 w-2 shrink-0", sevSquare[severity])}
          title={severity}
        />
        <FullTextTitle text={event.warning} />
      </span>
      <div className="pr-2">
        <PlanStatusPill status={planStatus} />
      </div>
      {/* Due-date cell — when an extension is in effect we surface it in the
          TTAF cell next door, not here. */}
      <div className="border-l border-foreground/15 px-2 py-0.5 text-center font-mono text-[11px] tabular-nums">
        {formatDate(event.expiryDate)}
      </div>
      {/* Due-TTAF cell — extension annotation lives here as a hairline tag */}
      <div
        className={cn(
          "border-l border-foreground/15 px-2 py-0.5 text-center font-mono text-[11px] tabular-nums leading-tight flex flex-col items-center justify-center",
          extHours != null && "bg-sev-yellow-bg/50",
        )}
        title={
          extHours != null
            ? `Extended +${extHours}h (was ${formatMinutesAsDuration(event.timerExpiryTimeMinutes)})`
            : undefined
        }
      >
        <span
          className={cn(
            extHours != null && "font-semibold text-sev-yellow-fg",
          )}
        >
          {formatMinutesAsDuration(effectiveExpiry)}
        </span>
        {extHours != null && (
          <span className="text-[8px] font-semibold tracking-spec text-sev-yellow-fg/80">
            EXTENDED {extHours}H
          </span>
        )}
      </div>
      {/* Days-left cell */}
      <div
        className={cn(
          "border-l border-foreground/15 px-1 py-0.5 text-center font-mono text-[11px] tabular-nums",
          severityHalf[daysSev],
        )}
        title="Days until due"
      >
        {daysLeft == null ? "—" : daysLeft}
      </div>
      {/* Hours-left cell — when an extension is active, the displayed hours
          already include it; stack a hairline tag to make that explicit so
          CAMO doesn't second-guess whether the value reflects the extension. */}
      <div
        className={cn(
          "border-l border-r border-foreground/15 px-1 py-0.5 text-center font-mono text-[11px] tabular-nums leading-tight flex flex-col items-center justify-center",
          severityHalf[hoursSev],
        )}
        title={
          extHours != null
            ? `Hours until due (vs current TTAF) — includes +${extHours}h extension`
            : "Hours until due (vs current TTAF)"
        }
      >
        <span>{formatHoursLeft(minutesLeft)}</span>
        {extHours != null && (
          <span className="text-[8px] font-semibold tracking-spec opacity-80">
            INCL. EXT
          </span>
        )}
      </div>
      {/* Action strip — square ghost buttons with hairline separators */}
      <div className="flex items-center justify-end gap-px pl-2">
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={onExtend}
              title={
                extHours != null
                  ? `Extension active (+${extHours}h) — click to manage`
                  : "Grant TTAF extension (CAMO, max 5h)"
              }
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center border border-transparent transition-colors hover:border-foreground/20 hover:bg-foreground/[0.06]",
                extHours != null &&
                  "text-sev-yellow-fg hover:bg-sev-yellow-bg/60",
              )}
            >
              <Hourglass className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onResolve}
              title="Close event (mark complete)"
              className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-sev-green-fg transition-colors hover:border-sev-green-edge/40 hover:bg-sev-green-bg/60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              title="Edit event"
              className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete event"
              className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-sev-red-edge/40 hover:bg-sev-red-bg/60 hover:text-sev-red-fg"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
