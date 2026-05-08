import { AlertTriangle, Check, Clock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import {
  DEFERRAL_REVIEW_DAYS,
  daysSinceDeferred,
  getDefectPlanStatus,
  getDeferralStatus,
  type DeferralStatus,
  type PlanStatus,
} from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import EstimatePill from "@/components/overview/EstimatePill";
import { EVENTS_GRID_COLS } from "@/components/overview/EventRow";
import { updateDefect } from "@/services/defects";
import type { Defect } from "@/types";

// Share the events grid template so the Status column lines up vertically
// across event and defect rows on the same aircraft card.
const DEFECTS_GRID_COLS = EVENTS_GRID_COLS;

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

type Props = {
  defects: Defect[];
  bookedDefectIds: ReadonlySet<string>;
  readOnly?: boolean;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
  onResolve: (defect: Defect) => void;
  onDefer: (defect: Defect) => void;
  onEstimate: (defect: Defect) => void;
};

function DeferralPill({
  status,
  defect,
  onClick,
  readOnly,
}: {
  status: DeferralStatus;
  defect: Defect;
  onClick: () => void;
  readOnly: boolean;
}) {
  if (status === "none") return null;
  const elapsed = daysSinceDeferred(defect) ?? 0;
  const overdue = status === "overdue";
  const reasonHint = defect.deferralReason
    ? ` — ${defect.deferralReason}`
    : "";
  const title = overdue
    ? `Deferral OVERDUE: ${elapsed}d elapsed (limit ${DEFERRAL_REVIEW_DAYS}d). CAMO follow-up required.${reasonHint}`
    : `Deferred ${elapsed}d ago (review at ${DEFERRAL_REVIEW_DAYS}d).${reasonHint}`;
  const labelText = overdue
    ? `OVERDUE ${elapsed}d`
    : `Deferred ${elapsed}/${DEFERRAL_REVIEW_DAYS}d`;
  const className = cn(
    "shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
    overdue
      ? "border-rose-500 bg-rose-200 text-rose-900 shadow-sm animate-pulse"
      : "border-amber-400 bg-amber-100 text-amber-900",
  );

  if (readOnly) {
    return (
      <span className={className} title={title}>
        {overdue ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        {labelText}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title} · click to manage`}
      className={cn(className, "transition-colors hover:brightness-95")}
    >
      {overdue ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {labelText}
    </button>
  );
}

export default function DefectsList({
  defects,
  bookedDefectIds,
  readOnly = false,
  onEdit,
  onDelete,
  onResolve,
  onDefer,
  onEstimate,
}: Props) {
  if (defects.length === 0) return null;

  return (
    <div className="border-t bg-amber-50/40">
      <div
        className={cn(
          "grid items-center gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-800/80",
          DEFECTS_GRID_COLS,
        )}
      >
        <span className="px-1">WO</span>
        <span className="px-1">REQ</span>
        <span>Defect ({defects.length})</span>
        <span>Status</span>
        <span>Estimate</span>
        <span>Reported</span>
        <span>TTAF</span>
        <span className="text-right">{readOnly ? "" : "Actions"}</span>
      </div>
      {defects.map((d) => {
        const planStatus = getDefectPlanStatus(d, bookedDefectIds);
        const deferralStatus = getDeferralStatus(d);
        return (
        <div
          key={d.id}
          className={cn(
            "grid items-center gap-2 px-3 py-1 border-t border-amber-200/60 text-xs hover:bg-amber-100/40",
            DEFECTS_GRID_COLS,
            // Highlight the entire row when a deferral has hit the review
            // limit so it can't be missed when scanning the overview.
            deferralStatus === "overdue" &&
              "bg-rose-50/60 hover:bg-rose-100/60",
          )}
        >
          <WorkOrderCell
            value={d.workOrderNumber}
            readOnly={readOnly}
            onSave={(wo) => updateDefect(d.id, { workOrderNumber: wo })}
          />
          <WorkOrderCell
            value={d.requisitionNumber}
            readOnly={readOnly}
            onSave={(req) => updateDefect(d.id, { requisitionNumber: req })}
            placeholder="REQ number"
            editTitle="Click to edit requisition number"
          />
          <div className="flex items-center gap-1.5 min-w-0">
            <DeferralPill
              status={deferralStatus}
              defect={d}
              onClick={() => onDefer(d)}
              readOnly={readOnly}
            />
            <span className="truncate" title={d.title}>
              {d.title}
            </span>
          </div>
          <span
            className={cn(
              "justify-self-start rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
              PLAN_STATUS_CLASS[planStatus],
            )}
            title={
              planStatus === "booked"
                ? "WO assigned and a calendar block is linked to this defect"
                : planStatus === "planned"
                  ? "Work order assigned — no hangar slot booked yet"
                  : "No work order assigned yet"
            }
          >
            {PLAN_STATUS_LABEL[planStatus]}
          </span>
          <div className="justify-self-start">
            <EstimatePill
              estimated={d.estimated}
              estimatedManHours={d.estimatedManHours}
              readOnly={readOnly}
              onClick={() => onEstimate(d)}
            />
          </div>
          <div className="font-mono tabular-nums">
            {formatDate(d.reportedDate)}
          </div>
          <div className="font-mono tabular-nums">
            {formatMinutesAsDuration(d.reportedTtafMinutes)}
          </div>
          <div className="flex items-center justify-end gap-0.5">
            {!readOnly && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6",
                    deferralStatus !== "none" &&
                      "text-amber-700 hover:bg-amber-100 hover:text-amber-800",
                  )}
                  onClick={() => onDefer(d)}
                  title={
                    deferralStatus === "none"
                      ? "Defer defect (start 30-day review)"
                      : "Manage deferral"
                  }
                >
                  <Clock className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                  onClick={() => onResolve(d)}
                  title="Resolve defect"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onEdit(d)}
                  title="Edit defect"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onDelete(d)}
                  title="Delete defect"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
